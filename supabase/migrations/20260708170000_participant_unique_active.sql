-- 참가자 유니크를 활성 행 한정으로(잠복 버그 2건 정수정 — 연습방 E2E 가 최초로 노출, 전 방 공통).
--  버그①: (room_id, slot_index) 전행 유니크 → 퇴장한(left) 행이 slot 을 계속 점유,
--          빈 좌석 재배정(만석→퇴장→신규 입장)이 duplicate key 409 로 사망.
--  버그②: (room_id, user_id) 전행 유니크 → 한 번 나간 방에 재입장 INSERT 가 영구 불가.
-- 정수정: 전행 유니크 2개 제거. 활성 행 유니크는 부분 인덱스가 담당 —
--  (room_id,user_id) 활성 = uq_room_participants_active(20260708130000, 기존).
--  (room_id,slot_index) 활성 = 아래 신설. left 행은 이력으로 보존(세션당 1행).
alter table room_participants drop constraint room_participants_room_id_slot_index_key;
alter table room_participants drop constraint room_participants_room_id_user_id_key;

create unique index uq_room_participants_active_slot
  on room_participants(room_id, slot_index)
  where state <> 'left' and slot_index is not null;
