-- promote_viewer_to_actor: 관객(viewer)을 배우(actor)로 승격(ROOM-21, 손들기 큐 승인).
-- 기존 viewer 행을 UPDATE: role='actor' + 최저 빈 슬롯 배정 + token_version++(재발급 강제) + raise_hand_at 리셋.
-- 정원 초과면 'full'. FOR UPDATE 로 슬롯 레이스 차단(join_room_as_participant v2 와 동형).
-- SSOT: contracts/HostConsole.md §G-154 · state-machines/HostAuthority.md
-- SECURITY: service_role 전용 — p_user_id 파라미터라 클라 노출 시 임의 승격 가능 → 3중 revoke.
--   호스트 권한·대상의 수락은 호출 Edge(invite-to-stage·accept-stage-invite)가 검증한다.
create or replace function promote_viewer_to_actor(p_room_id uuid, p_user_id uuid)
returns table(status text, slot_index int, token_version int)
language plpgsql
set search_path = public
as $$
declare
  v_max   int;
  v_count int;
  v_slot  int;
  v_pid   uuid;
  v_role  text;
  v_tv    int;
begin
  -- 방 행 잠금 → 슬롯·정원을 락 안의 실값으로 계산(레이스 차단).
  select max_participants into v_max from rooms where id = p_room_id for update;
  if v_max is null then status := 'not_found'; return next; return; end if;

  -- 대상의 활성 참가자 행
  select rp.id, rp.role into v_pid, v_role
  from room_participants rp
  where rp.room_id = p_room_id and rp.user_id = p_user_id and rp.state <> 'left'
  limit 1;
  if not found then status := 'not_participant'; return next; return; end if;
  if v_role <> 'viewer' then
    -- 이미 배우(중복 승인·경합) → 멱등 성공(현재 슬롯·토큰 반환)
    select rp.slot_index, rp.token_version into v_slot, v_tv
    from room_participants rp where rp.id = v_pid;
    status := 'already_actor'; slot_index := v_slot; token_version := v_tv;
    return next; return;
  end if;

  -- 정원 = 배우석만(뷰어 비점유).
  select count(*) into v_count
  from room_participants rp
  where rp.room_id = p_room_id and rp.state <> 'left' and rp.role <> 'viewer';
  if v_count >= v_max then status := 'full'; return next; return; end if;

  -- 최저 빈 슬롯(뷰어 NULL 제외).
  select min(g.s) into v_slot
  from generate_series(0, v_max - 1) as g(s)
  where g.s not in (
    select rp.slot_index from room_participants rp
    where rp.room_id = p_room_id and rp.state <> 'left' and rp.slot_index is not null
  );

  update room_participants
    set role = 'actor', slot_index = v_slot, raise_hand_at = null,
        token_version = token_version + 1
    where id = v_pid
    returning token_version into v_tv;

  update rooms set current_participants = v_count + 1 where id = p_room_id;

  status := 'promoted'; slot_index := v_slot; token_version := v_tv;
  return next;
end;
$$;

revoke all on function promote_viewer_to_actor(uuid, uuid) from public;
revoke all on function promote_viewer_to_actor(uuid, uuid) from anon;
revoke all on function promote_viewer_to_actor(uuid, uuid) from authenticated;
grant execute on function promote_viewer_to_actor(uuid, uuid) to service_role;
