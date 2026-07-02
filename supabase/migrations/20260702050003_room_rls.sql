-- 방 RLS 정책 + 멤버십 헬퍼 + Realtime 게시
-- SSOT: docs/DATA-SCHEMA.md §1.2 · §1.3, docs/specs/SecurityPolicies.md §2.2
--
-- C2 교정(RLS 재귀 회피): room_participants 의 "같은 방 참가자만 SELECT" 정책이
-- room_participants 를 다시 조회하면 정책이 자기 자신을 재귀 호출한다.
-- security definer 함수로 RLS 를 우회해 멤버십을 판정하면 재귀가 끊긴다.

create or replace function is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_participants rp
    join public.users u on u.id = rp.user_id
    where rp.room_id = p_room_id
      and u.auth_id = auth.uid()
      and rp.state <> 'left'
  );
$$;

-- rooms: 호스트 또는 같은 방 참가자만 상세 조회. (비참가자는 public_rooms 뷰로만 발견)
-- 쓰기는 서버(service_role)만 — 클라 정책 없음(deny).
create policy rooms_select_member on rooms
  for select using (host_id = current_user_id() or is_room_member(id));

-- room_participants: 같은 방 참가자만 참가자 목록 조회(ROOM-08 Realtime 동기).
-- 쓰기는 서버(service_role)만.
create policy rp_select_member on room_participants
  for select using (is_room_member(room_id));

-- Realtime: 방 상태·참가자 변경 구독 (ROOM-01 / ROOM-08).
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table room_participants;
