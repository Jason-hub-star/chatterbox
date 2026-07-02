-- app_config: Feature Flag 테이블
-- SSOT: docs/specs/FeatureFlags.md (Supabase app_config + Zustand + Realtime)

create table app_config (
  id          bigserial   primary key,
  key         text        not null unique,
  value       jsonb       not null,
  description text,
  enabled     boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table app_config enable row level security;

-- 모두 읽기: loadConfig 는 anon key 로 select (FeatureFlags.md §RLS public_read).
create policy "public_read" on app_config
  for select using (true);

-- 관리자 쓰기(admin_write)는 user_roles 테이블 생성 후 별도 마이그레이션으로 추가한다.
-- Phase 0 범위 밖 — 시드/변경은 SQL Editor 또는 service_role 로 수행.

-- updated_at 자동 갱신 트리거
create or replace function update_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on app_config
  for each row execute function update_timestamp();

-- 시드 (FeatureFlags.md §초기화 SQL) — value 는 JSONB {"value": ...}
insert into app_config (key, value, description, enabled) values
  ('VGEN_ENABLED',            '{"value": false}', 'VGEN 영상 생성 기능 활성화. 비용 발생 기능이므로 서버 승인 전 기본 OFF', true),
  ('DUB_ENABLED',             '{"value": false}', '음성 더빙 기능 활성화. 업로드/STT 비용 기능이므로 서버 승인 전 기본 OFF', true),
  ('DUB_YOUTUBE_ENABLED',     '{"value": false}', 'YouTube DUB import. P2 법무/SSRF/비용 gate 승인 전 OFF', true),
  ('ROOM_MAX_USERS',          '{"value": 6}',     '방당 최대 참가자 수', true),
  ('VGEN_DAILY_LIMIT',        '{"value": 3}',     '사용자당 일일 VGEN 생성 횟수 제한', true),
  ('VGEN_MAX_SEC',            '{"value": 10}',    'VGEN 생성 최대 길이(초)', true),
  ('LIVEKIT_ENABLED',         '{"value": true}',  'WebRTC 연결 활성화', true),
  ('MAINTENANCE_MODE',        '{"value": false}', '점검 모드 — true면 로그인 차단', false),
  ('NEW_ONBOARDING',          '{"value": false}', '신규 온보딩 UX (A/B 테스트용)', false),
  ('VGEN_REFUND_MODERATION',  '{"value": false}', 'content_moderation 실패를 VGEN 환불 대상으로 포함', true),
  ('VGEN_REFUND_USER_CANCEL', '{"value": false}', '사용자 취소(user_cancel)를 VGEN 환불 대상으로 포함', true),
  ('DUB_REFUND_USER_CANCEL',  '{"value": false}', '사용자 취소(user_cancel)를 DUB 환불 대상으로 포함', true);
