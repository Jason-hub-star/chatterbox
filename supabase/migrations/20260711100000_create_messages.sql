-- 채팅 영속화(contracts/ChatPanel.md · SecurityPolicies §6.4) — messages 테이블 + 멤버-only RLS + 30일 purge.
-- 왜: 채팅이 LiveKit DataChannel 휘발성이라 늦입장 히스토리 부재 + 클라 직발행 sender 스푸핑 가능 →
--   send-chat Edge(서버릴레이)가 sanitize·멤버십·rate-limit 검증 후 service_role 로 INSERT + broadcast.
-- ponytail: realtime publication 미등록 — 라이브 전달은 LiveKit 서버릴레이 담당, hidden/tombstone 실시간
--   전파·감사로그는 HOST-11(채팅 클리어) 슬라이스에서. note(message_type='note') 영속도 후속(현재 휘발 유지).

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  sender_auth_id text not null,   -- LiveKit identity(=auth uid) — 좌석·표시 키잉과 동형
  sender_name text,               -- 발신 시점 표시명 비정규화(히스토리 렌더 조인 회피)
  text text not null check (char_length(text) between 1 and 500),
  message_type text not null default 'chat' check (message_type in ('chat', 'note')),
  status text not null default 'visible' check (status in ('visible', 'hidden', 'tombstone')),
  hidden_reason text,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_room_created_idx on public.messages (room_id, created_at);

alter table public.messages enable row level security;

-- 멤버만 + visible 만 (소프트삭제 행은 클라에 미노출). 쓰기 정책 없음 — 클라 직접 INSERT 는 RLS deny,
-- send-chat Edge(service_role) 전용 (SecurityPolicies §6.4.2).
create policy messages_select_member on public.messages
  for select using (public.is_room_member(room_id) and status = 'visible');

-- 보존 30일(무한적재 상한): 채팅 소비처는 세션 중 히스토리뿐. 방 종료 즉시 삭제는 ROOM-13(다시보기)과
-- 충돌해 30일 유예 일괄 purge. 일 1회·소량이라 created_at 전용 인덱스는 불요(ponytail).
create or replace function public.purge_old_messages()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.messages where created_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- DEFINER RPC 는 3-role 완전 revoke (SEC-7/8 교훈: public 만 빼면 anon/authenticated 에 default-priv 잔존).
revoke execute on function public.purge_old_messages() from public, anon, authenticated;

-- pg_cron 일일 등록(있을 때만 — 로컬 supabase 미탑재여도 db reset 안 깨짐, vgen cron 과 동형).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      execute 'create extension if not exists pg_cron';
      perform cron.schedule(
        'messages-purge-30d',
        '10 4 * * *',
        'select public.purge_old_messages();'
      );
    exception when others then
      raise notice 'pg_cron schedule skipped: %', sqlerrm;
    end;
  end if;
end;
$$;
