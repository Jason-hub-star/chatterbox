-- RES-ROOM: 예약에 "갈 방"을 만든다(UIUX 감사 #3 예약분).
--
-- 원 설계(20260708150000)는 "예약 = 약속 + 알림, 방은 시작 때 만드는 것"이었다. 그 판단 자체는
-- 유효하다 — 방을 미리 만들면 빈 방 ended 로직·reaper 와 충돌한다. 문제는 방을 **연 뒤에도**
-- 예약과 방이 이어지지 않아, 리마인더를 받은 초대자가 갈 곳이 없었다는 것이다.
-- 그래서 선생성이 아니라 **사후 연결**을 넣는다: 호스트가 그 예약으로 방을 열면 여기가 채워진다.
alter table room_reservations
  add column room_id uuid references rooms(id) on delete set null;

comment on column room_reservations.room_id is
  'RES-ROOM: 이 예약으로 실제로 연 방. 방이 지워지면 null 로 되돌아간다(예약 행은 살린다).';

-- 리마인더 재정의: payload 에 reservation_id·room_id 를 싣는다.
--   - reservation_id: 예전 payload 엔 room_title·scheduled_at 뿐이라 알림이 어느 예약인지 몰랐다
--     (초대 알림은 이미 싣고 있었고, 이 함수가 그걸로 대상자를 찾는다 — 리마인더만 빠져 있었다).
--   - room_id: 리마인더 시점에 이미 방이 열려 있으면 클릭 한 번으로 그 방까지 간다.
create or replace function send_reservation_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select id, host_id, title, scheduled_at, room_id from room_reservations
     where scheduled_at between now() and now() + interval '30 minutes'
       and reminded_at is null
     for update skip locked
  loop
    insert into notifications (user_id, type, room_id, payload)
    select distinct n.user_id, 'reservation_reminder', r.room_id,
           jsonb_build_object(
             'room_title', r.title,
             'scheduled_at', r.scheduled_at,
             'reservation_id', r.id,
             'room_id', r.room_id
           )
      from notifications n
     where n.type = 'reservation_invite'
       and (n.payload ->> 'reservation_id') = r.id::text;

    insert into notifications (user_id, type, room_id, payload)
    values (r.host_id, 'reservation_reminder', r.room_id,
            jsonb_build_object(
              'room_title', r.title,
              'scheduled_at', r.scheduled_at,
              'reservation_id', r.id,
              'room_id', r.room_id
            ));

    update room_reservations set reminded_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- create or replace 는 기존 ACL 을 보존하지만, 이 함수는 SECURITY DEFINER 라 조용한 노출이
-- 곧 사고다([[supabase-definer-rpc-revoke]]) — 명시 재선언으로 못을 다시 박는다.
revoke all on function send_reservation_reminders() from public;
revoke all on function send_reservation_reminders() from anon;
revoke all on function send_reservation_reminders() from authenticated;
grant execute on function send_reservation_reminders() to service_role;
