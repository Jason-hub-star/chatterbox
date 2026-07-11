-- V-2 신고/차단(docs/specs/security/reporting-logging-feedback.md §16).
-- 신고 = 운영 검토 큐(클라 정책 0 — 쓰기·조회 service_role 전용).
-- 차단 = 개인 경험 필터(§16.2: 클라 표시 접힘만, 입장 차단·신고 자동생성 아님).
create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.users(id) on delete cascade,
  -- room/reported/message 는 느슨한 참조(운영 큐 — messages 30일 purge·계정 삭제와 독립 보존).
  room_id uuid,
  reported_user_id uuid,
  message_id uuid,
  message_text text check (char_length(message_text) <= 500), -- purge 대비 본문 스냅샷(서버가 확정)
  reason text not null check (reason in ('abuse', 'sexual', 'spam', 'privacy', 'other')),
  description text check (char_length(description) <= 500),
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  check (reported_user_id is not null or message_id is not null)
);
alter table public.moderation_reports enable row level security;
create index if not exists moderation_reports_status_idx on public.moderation_reports (status, created_at);

create table if not exists public.user_blocks (
  blocker_user_id uuid not null references public.users(id) on delete cascade,
  blocked_user_id uuid not null references public.users(id) on delete cascade,
  blocked_auth_id text not null, -- 비정규화: 클라 필터 키(LiveKit identity = auth uid)
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);
alter table public.user_blocks enable row level security;
-- 본인 차단 목록만 조회(클라 접힘 필터용) — 쓰기는 Edge(service_role) 전용.
create policy user_blocks_select_own on public.user_blocks
  for select using (blocker_user_id = public.current_user_id());
