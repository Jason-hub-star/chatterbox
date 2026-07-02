-- rooms / room_participants / public_rooms view
-- SSOT: docs/DATA-SCHEMA.md §1.2 · §1.2.0 · §1.3
--
-- 스키마는 SSOT 대로 완전하게 만들되, 동작(생성/입장/퇴장)만 최소 슬라이스로 배선한다.
-- 미배선 컬럼(cue_operator_id, playback_position_ms, muted_until, character_role 등)은
-- 후속 슬라이스에서 로직이 붙는다 — 지금 만들어 두면 ALTER 반복을 피한다.

create table rooms (
  id                    uuid primary key default gen_random_uuid(),
  host_id               uuid not null references users(id) on delete cascade,
  title                 text not null,
  description           text,
  genre                 text,
  status                text default 'waiting',                    -- waiting | live | ended
  is_demo               boolean default false,
  is_locked             boolean default false,                     -- 비번/초대 필요 여부(해시는 room_secrets)
  max_participants      int default 6,
  current_participants  int default 0,
  background_url        text,
  background_key        text,
  template_id           uuid,                                      -- nullable, FK 미강제(부트스트랩 의존 회피)
  language              varchar(10) default 'ko',
  authority_state_json  jsonb,
  authority_epoch       int default 1,                             -- host transfer 시 증가
  cue_operator_id       uuid references users(id) on delete set null,
  live_participant_count int default 0,
  emptied_at            timestamptz,
  playback_position_ms  int default 0,
  created_at            timestamptz default now(),
  started_at            timestamptz,
  ended_at              timestamptz,
  updated_at            timestamptz default now(),

  constraint rooms_status_chk check (status in ('waiting','live','ended')),
  constraint rooms_max_participants_chk check (max_participants between 1 and 6)
);

create index rooms_status_idx on rooms (status);
create index rooms_host_idx on rooms (host_id);

create table room_participants (
  id                  uuid primary key default gen_random_uuid(),
  room_id             uuid not null references rooms(id) on delete cascade,
  user_id             uuid not null references users(id) on delete cascade,
  slot_index          int,                                         -- 0-5 (6인 레이아웃)
  role                text default 'actor',                        -- actor | viewer
  role_source         text default 'host_selected',
  state               text default 'joining',                      -- joining|connected|active|muted|inactive|left
  audio_enabled       boolean default false,
  muted_by_host       boolean default false,
  muted_until         timestamptz,                                 -- HOST-08 timed mute (후속)
  is_disabled_by_host boolean default false,
  token_version       int default 1,                               -- kick/leave/safety 시 +1 (토큰 무효화)
  token_revoked_at    timestamptz,
  character_role      text,
  is_tracking_failed  boolean default false,
  is_ready            boolean default false,
  slot_display_name   text,                                        -- 동명이인 "이름#2" (G-81, 후속)
  joined_at           timestamptz default now(),
  left_at             timestamptz,
  updated_at          timestamptz default now(),

  constraint rp_role_chk  check (role in ('actor','viewer')),
  constraint rp_state_chk check (state in ('joining','connected','active','muted','inactive','left')),
  unique (room_id, user_id),     -- 멀티탭 동시입장 차단 (C17·G-51)
  unique (room_id, slot_index)   -- 슬롯 유일
);

create index rp_room_idx on room_participants (room_id);
create index rp_user_idx on room_participants (user_id);

create trigger set_updated_at
  before update on rooms
  for each row execute function update_timestamp();

create trigger set_updated_at
  before update on room_participants
  for each row execute function update_timestamp();

-- 공개 로비 목록: host_id/비밀번호 노출 금지, host_display_name 만 (§1.2.0, C11).
-- 뷰는 기본 security definer(뷰 소유자 권한)라 users RLS 를 우회해 표시용 이름만 안전 노출.
create view public_rooms as
select
  r.id,
  r.title,
  r.description,
  r.genre,
  r.status,
  r.is_demo,
  r.is_locked,
  r.max_participants,
  r.current_participants,
  r.background_url,
  u.display_name as host_display_name,   -- host_id(UUID) 대신 표시용 이름만
  r.created_at,
  r.started_at,
  r.updated_at
from rooms r
left join users u on u.id = r.host_id
where r.status in ('waiting', 'live');

grant select on public_rooms to authenticated;

-- RLS 활성화. 정책은 20260702050003_room_rls.sql 에서 is_room_member() 도입 후 추가.
-- (정책 없는 동안은 deny-all — 클라 직접 쓰기 차단. 서버는 service_role 로 우회.)
alter table rooms enable row level security;
alter table room_participants enable row level security;
