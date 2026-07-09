-- ROOM-20 관객 손들기(무대 서기 요청). raise_hand_at 이 NULL 이 아니면 호스트 큐에 표시된다.
-- 손 내리기·호스트 승격(promote_viewer_to_actor, 슬라이스 2) 시 NULL 로 리셋. SSOT: contracts/HostConsole.md §G-154.
-- room_participants 정의: 20260702050002_create_rooms.sql. 기존 컬럼 불변(부분 인덱스만 추가).
alter table room_participants
  add column if not exists raise_hand_at timestamptz default null;

-- 호스트 큐 조회(활성 손들기만·시간순) 최적화. 손 든 참가자는 소수라 부분 인덱스로 충분.
create index if not exists idx_room_participants_raise_hand
  on room_participants (room_id, raise_hand_at)
  where raise_hand_at is not null;
