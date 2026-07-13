-- 인앱 피드백/문의 접수(ISS-04 창구 · reporting-logging-feedback.md §16 계열).
-- 신고(moderation_reports=타인 대상 운영 큐)와 분리 — 피드백은 "내 경험의 문제"를 개발팀에 알리는 채널.
-- 쓰기는 Edge(create-feedback, service_role) 전용: 레이트리밋·diag 화이트리스트를 서버가 강제.
-- 조회는 본인 행만(RLS) — 접수 상태(received→investigating→fixed) 추적 UI 용.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null check (category in ('avatar', 'room', 'audio', 'other')),
  description text not null check (char_length(description) between 1 and 1000),
  -- opt-in 진단 번들 — Edge 가 화이트리스트 키만 재구성해 저장(원본 업로드 이미지 등 미포함).
  diag jsonb,
  status text not null default 'received' check (status in ('received', 'investigating', 'fixed', 'closed')),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
create index if not exists feedback_status_idx on public.feedback (status, created_at);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);

create policy feedback_select_own on public.feedback
  for select using (user_id = public.current_user_id());

-- 보존 90일(프라이버시 고지와 동기) — messages purge 와 동형.
create or replace function public.purge_old_feedback()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.feedback where created_at < now() - interval '90 days';
$$;

-- DEFINER RPC 는 3-role 완전 revoke (SEC-7/8 교훈: public 만 빼면 anon/authenticated 에 default-priv 잔존).
revoke execute on function public.purge_old_feedback() from public, anon, authenticated;

-- pg_cron 일일 등록(있을 때만 — 로컬 supabase 미탑재여도 db reset 안 깨짐, messages cron 과 동형).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      execute 'create extension if not exists pg_cron';
      perform cron.schedule(
        'feedback-purge-90d',
        '20 4 * * *',
        'select public.purge_old_feedback();'
      );
    exception when others then
      raise notice 'pg_cron schedule skipped: %', sqlerrm;
    end;
  end if;
end;
$$;
