-- HOST-09/10/11 채팅 모더레이션: 방별 정책 컬럼 + 운영 감사로그.
-- 정책 강제는 send-chat(Edge)이, 숨김/클리어는 moderate-chat(Edge, service_role)이 수행.
alter table public.rooms
  add column if not exists chat_slow_mode_sec int not null default 0
    check (chat_slow_mode_sec between 0 and 600),
  add column if not exists chat_banned_words text[] not null default '{}';

-- 운영 행위 감사(contracts/ChatPanel.md "운영 숨김 시 audit_logs 필수" · reporting-logging-feedback §16).
-- 최소 스키마 — 쓰기·조회 모두 service_role 전용(클라 정책 0, RLS on).
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_user_id uuid references public.users(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  target_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create index if not exists audit_logs_room_created_idx on public.audit_logs (room_id, created_at desc);
