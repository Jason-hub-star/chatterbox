-- 뷰어 역할 개통(Phase 4, LOB-07·ViewerGate). SSOT: docs/contracts/ViewerGate.md · DATA-SCHEMA §1.3
-- 핵심: 뷰어는 좌석·정원을 점유하지 않는다 — 기존 join RPC 가 뷰어를 모르면
--   ①정원 계산에 뷰어가 섞이고 ②뷰어의 slot_index NULL 이 NOT IN 을 오염시켜 슬롯 배정이 깨진다.

-- 1) 활성 참가자 유니크(부분 인덱스): 동시 중복 조인의 최후 방어선(배우·뷰어 공통).
create unique index if not exists uq_room_participants_active
  on room_participants(room_id, user_id) where state <> 'left';

-- 2) join_room_as_participant v2 — 뷰어 제외 정원·슬롯 + 실제 role 반환.
--    (rejoined 가 role 을 안 돌려주면 뷰어 재입장이 actor 로 위장되는 버그 — roomJoin.ts 하드코딩 제거)
--    RETURNS 시그니처 변경이라 drop 후 재생성(권한 재부여 포함).
drop function if exists join_room_as_participant(uuid, uuid);
create function join_room_as_participant(p_room_id uuid, p_user_id uuid)
returns table(status text, participant_id uuid, slot_index int, role text)
language plpgsql
set search_path = public
as $$
declare
  v_max   int;
  v_count int;
  v_slot  int;
  v_id    uuid;
  v_eslot int;
  v_role  text;
begin
  -- 방 행 잠금 → 동시 조인 직렬화(레이스 차단). 정원도 락 안의 실값을 쓴다.
  select max_participants into v_max from rooms where id = p_room_id for update;
  if v_max is null then
    status := 'not_found'; return next; return;
  end if;

  -- 멱등: 이미 활성 참가자면(뷰어 포함) 기존 행을 실제 role 그대로 반환.
  select rp.id, rp.slot_index, rp.role into v_id, v_eslot, v_role
  from room_participants rp
  where rp.room_id = p_room_id and rp.user_id = p_user_id and rp.state <> 'left'
  limit 1;
  if found then
    status := 'rejoined'; participant_id := v_id; slot_index := v_eslot; role := v_role;
    return next; return;
  end if;

  -- 정원 = 배우석만(뷰어 무제한·비점유).
  select count(*) into v_count
  from room_participants rp
  where rp.room_id = p_room_id and rp.state <> 'left' and rp.role <> 'viewer';
  if v_count >= v_max then
    status := 'full'; return next; return;
  end if;

  -- 최저 빈 슬롯(0..max-1). slot_index is not null — 뷰어 NULL 이 NOT IN 을 오염시키지 않게.
  select min(g.s) into v_slot
  from generate_series(0, v_max - 1) as g(s)
  where g.s not in (
    select rp.slot_index from room_participants rp
    where rp.room_id = p_room_id and rp.state <> 'left' and rp.slot_index is not null
  );

  insert into room_participants (room_id, user_id, slot_index, role, state)
  values (p_room_id, p_user_id, v_slot, 'actor', 'connected')
  returning id into v_id;

  update rooms set current_participants = v_count + 1 where id = p_room_id;

  status := 'joined'; participant_id := v_id; slot_index := v_slot; role := 'actor';
  return next;
end;
$$;

revoke all on function join_room_as_participant(uuid, uuid) from public;
revoke all on function join_room_as_participant(uuid, uuid) from anon;
revoke all on function join_room_as_participant(uuid, uuid) from authenticated;
grant execute on function join_room_as_participant(uuid, uuid) to service_role;

-- 3) join_room_as_viewer — 좌석·정원·current_participants 무관, 멱등.
--    잠금(is_locked)·ended 게이트는 호출 Edge(join-as-viewer·accept-invite)가 담당(actor 경로와 동일 분업).
create function join_room_as_viewer(p_room_id uuid, p_user_id uuid)
returns table(status text, participant_id uuid, role text)
language plpgsql
set search_path = public
as $$
declare
  v_id   uuid;
  v_role text;
begin
  if not exists (select 1 from rooms r where r.id = p_room_id) then
    status := 'not_found'; return next; return;
  end if;

  select rp.id, rp.role into v_id, v_role
  from room_participants rp
  where rp.room_id = p_room_id and rp.user_id = p_user_id and rp.state <> 'left'
  limit 1;
  if found then
    status := 'rejoined'; participant_id := v_id; role := v_role;
    return next; return;
  end if;

  begin
    insert into room_participants (room_id, user_id, slot_index, role, state)
    values (p_room_id, p_user_id, null, 'viewer', 'connected')
    returning id into v_id;
  exception when unique_violation then
    -- 동시 중복 조인 → 부분 유니크가 잡음 — 기존 행으로 멱등 수렴.
    select rp.id, rp.role into v_id, v_role
    from room_participants rp
    where rp.room_id = p_room_id and rp.user_id = p_user_id and rp.state <> 'left'
    limit 1;
    status := 'rejoined'; participant_id := v_id; role := v_role;
    return next; return;
  end;

  status := 'joined'; participant_id := v_id; role := 'viewer';
  return next;
end;
$$;

revoke all on function join_room_as_viewer(uuid, uuid) from public;
revoke all on function join_room_as_viewer(uuid, uuid) from anon;
revoke all on function join_room_as_viewer(uuid, uuid) from authenticated;
grant execute on function join_room_as_viewer(uuid, uuid) to service_role;
