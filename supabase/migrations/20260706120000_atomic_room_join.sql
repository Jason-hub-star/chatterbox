-- 원자적 방 참가 (조인 레이스 수정). Fable 리뷰 ③ 후속.
-- SSOT: docs/state-machines/Room.md · docs/DATA-SCHEMA.md §1.3
--
-- 기존 흐름(_shared/roomJoin.ts)은 [SELECT active → INSERT participant → UPDATE
--   current_participants = active.length + 1] 3-step 이 원자적이지 않았다. 동시 조인 2건이
--   같은 stale count(N)를 읽어 둘 다 N+1 을 쓰거나(카운트 저평가), 같은 최저 빈 슬롯을 골라
--   충돌했다. 근본원인 = read-modify-write 비원자성.
-- 수정: rooms 행을 FOR UPDATE 로 잠가 같은 방 조인을 직렬화한다 → 활성수·슬롯·정원이 모두
--   락 안에서 정확히 계산된다. Edge Function(roomJoin.ts)은 이 RPC 한 번만 호출.
--
-- SECURITY: service_role(Edge Function) 전용. p_user_id 가 파라미터이므로, 이 함수가 클라에
--   노출되면 남을 임의 방에 넣을 수 있다 → PUBLIC/anon/authenticated EXECUTE 를 revoke.
--   호스트/비번/잠금 게이트는 호출 Edge Function(join-public-room·join-room-with-password)에 유지.

create or replace function join_room_as_participant(p_room_id uuid, p_user_id uuid)
returns table(status text, participant_id uuid, slot_index int)
language plpgsql
set search_path = public
as $$
declare
  v_max   int;
  v_count int;
  v_slot  int;
  v_id    uuid;
  v_eslot int;
begin
  -- 방 행 잠금 → 동시 조인 직렬화(레이스 차단). 정원도 락 안의 실값을 쓴다.
  select max_participants into v_max from rooms where id = p_room_id for update;
  if v_max is null then
    status := 'not_found'; return next; return;
  end if;

  -- 멱등: 이미 활성 참가자면 기존 행 반환(새로고침/중복 호출 안전)
  -- rp 별칭 필수 — slot_index 는 RETURNS TABLE OUT 파라미터명과 겹쳐 미별칭이면 ambiguous.
  select rp.id, rp.slot_index into v_id, v_eslot
  from room_participants rp
  where rp.room_id = p_room_id and rp.user_id = p_user_id and rp.state <> 'left'
  limit 1;
  if found then
    status := 'rejoined'; participant_id := v_id; slot_index := v_eslot;
    return next; return;
  end if;

  select count(*) into v_count
  from room_participants rp where rp.room_id = p_room_id and rp.state <> 'left';
  if v_count >= v_max then
    status := 'full'; return next; return;
  end if;

  -- 최저 빈 슬롯(0..max-1). v_count < v_max 이므로 반드시 존재.
  select min(g.s) into v_slot
  from generate_series(0, v_max - 1) as g(s)
  where g.s not in (
    select rp.slot_index from room_participants rp
    where rp.room_id = p_room_id and rp.state <> 'left'
  );

  insert into room_participants (room_id, user_id, slot_index, role, state)
  values (p_room_id, p_user_id, v_slot, 'actor', 'connected')
  returning id into v_id;

  update rooms set current_participants = v_count + 1 where id = p_room_id;

  status := 'joined'; participant_id := v_id; slot_index := v_slot;
  return next;
end;
$$;

revoke all on function join_room_as_participant(uuid, uuid) from public;
revoke all on function join_room_as_participant(uuid, uuid) from anon;
revoke all on function join_room_as_participant(uuid, uuid) from authenticated;
grant execute on function join_room_as_participant(uuid, uuid) to service_role;
