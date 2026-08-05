-- SEC-1 후속(사다리 D1, 로컬 통합테스트 발견): promote_viewer_to_actor 가 항상 500 —
-- "column reference token_version is ambiguous". RETURNS TABLE 의 OUT 파라미터명(status/slot_index/
-- token_version)이 room_participants 컬럼명과 충돌 → UPDATE ... SET token_version = token_version+1
-- RETURNING token_version 에서 plpgsql 기본 variable_conflict=error 로 파싱 실패.
-- 손들기 뷰어 버튼 폐기로 정규 승격(invite→accept)이 프로드에서 실행된 적 없어 잠복(코드리딩 감사 미포착).
-- 호스트 직접 초대 모델은 이 RPC 성공이 전제 → 정수정. 최소 수정 = `#variable_conflict use_column`
-- (SQL 문 내 모호 식별자를 컬럼으로 해석; OUT 파라미터 대입은 plpgsql 대입이라 영향 없음). 본문·시그니처 불변.
create or replace function promote_viewer_to_actor(p_room_id uuid, p_user_id uuid)
returns table(status text, slot_index int, token_version int)
language plpgsql
set search_path = public
as $$
#variable_conflict use_column
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

  update room_participants rp
    set role = 'actor', slot_index = v_slot, raise_hand_at = null,
        token_version = rp.token_version + 1
    where rp.id = v_pid
    returning rp.token_version into v_tv;

  update rooms set current_participants = v_count + 1 where id = p_room_id;

  status := 'promoted'; slot_index := v_slot; token_version := v_tv;
  return next;
end;
$$;

-- create or replace 는 기존 권한을 보존하나, 성역(임의 승격 차단)이라 3중 revoke 재명시(방어).
revoke all on function promote_viewer_to_actor(uuid, uuid) from public;
revoke all on function promote_viewer_to_actor(uuid, uuid) from anon;
revoke all on function promote_viewer_to_actor(uuid, uuid) from authenticated;
grant execute on function promote_viewer_to_actor(uuid, uuid) to service_role;
