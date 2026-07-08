-- 스튜디오 방(쇼츠 제작소, 로비 IA 재편): VGEN 이 room 에 강결합(vgen_jobs.room_id NOT NULL·
-- trigger-vgen 호스트검증·R2 경로 vgen-refs/<room>)이라, 로비 독립 쇼츠 생성을 위해
-- "유저당 숨겨진 1인 작업방"을 재사용한다. 스키마·보안(SEC-2/3) 무변경 — 기존 create-room·
-- trigger-vgen·R2 경로를 그대로 태우되, 이 방만 공개 목록에서 제외한다. SSOT: docs/design/scene-prompts.md
alter table rooms add column is_studio boolean not null default false;

-- 유저당 스튜디오 1개 — get-or-create 멱등 보장(ensure-studio-room 이 재사용, 동시진입 경합은 이 인덱스가 차단).
create unique index uniq_studio_per_host on rooms (host_id) where is_studio;

-- public_rooms 뷰: 스튜디오 방 제외(개인 작업방은 공개 목록·검색에 안 뜬다).
-- 컬럼 목록은 불변(create or replace 제약) — where 절만 확장.
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
where r.status in ('waiting', 'live') and not r.is_studio;
