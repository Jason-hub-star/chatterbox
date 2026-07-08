-- 연습 방(LOB-10 MVP): 혼자 시작 방지 — 상시 열린 공용 연습 무대 1개.
-- as-built: AI/TTS 상대역·녹화 루프 파트너는 defer(별도 스펙) — 셀프 리허설(대본·더빙·아바타)이 v1 가치.
-- 시스템 호스트(실사용자 아님)라 호스트 콘솔 없음·승계 안 탐. 빈 방이어도 안 닫힘(leave-room 예외).
alter table rooms add column is_practice boolean not null default false;

-- public_rooms 뷰에 is_practice 노출(create or replace 는 컬럼 끝 추가만 허용 — 마지막에 append).
create or replace view public_rooms as
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
  u.display_name as host_display_name,
  r.created_at,
  r.started_at,
  r.updated_at,
  r.is_practice
from rooms r
left join users u on u.id = r.host_id
where r.status in ('waiting', 'live');

-- 시드(멱등): 시스템 유저(auth 계정 없음 — auth_id 는 FK 아님·unique 만) + 연습방 1개.
insert into users (id, auth_id, email, display_name)
values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000aa',
  'system+practice@chatterbox.local',
  'ChatterBox'
)
on conflict (id) do nothing;

insert into rooms (id, host_id, title, genre, status, max_participants, current_participants, is_practice)
values (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  '연습 무대',
  'free',
  'waiting',
  6,
  0,
  true
)
on conflict (id) do nothing;
