-- ISS-20 (도그푸딩 감사 2026-08-20, P1): 강퇴자 RLS 우회 read 차단.
-- is_room_member() 가 state<>'left' 만 봐서, kick-participant 가 행을 남긴 채
-- is_disabled_by_host=true 만 세팅하는(KICK-SEAT 의미론) 강퇴 참가자를 여전히 "멤버"로 판정했다.
-- token_version++ 는 LiveKit/Edge 토큰만 무효화 — 살아있는 Supabase JWT 로 PostgREST 직접 GET 시
-- 이 헬퍼를 쓰는 9개 테이블(rooms·room_participants·messages·polls·dub·vgen·recordings·recording_tracks)이
-- 그대로 열렸다. 강퇴 = 비멤버로 재정의(단일 지점, 참조처 전부 재컴파일 없이 즉시 반영).
-- SSOT: docs/specs/SecurityPolicies.md §2.2 · docs/status/DOGFOOD-AUDIT-2026-07.md ISS-20
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
      and rp.is_disabled_by_host is not true
  );
$$;
