-- DP-1(델타 감사) presence 근본 재설계 — 전역 Realtime presence 채널 폐기.
-- 온라인 상태를 users 본인 행에 heartbeat 로 기록하고, list-friends 가 친구관계 검증 후
-- 친구의 last_active_at + 활성 room_participants 만 반환 → 전역 노출 0(비친구·차단자 presence 응답 부재).
-- 쓰기는 기존 users_update_own RLS(auth_id=auth.uid()) 로 본인 행만 — 신규 정책 불요.
alter table public.users
  add column if not exists last_active_at timestamptz;
