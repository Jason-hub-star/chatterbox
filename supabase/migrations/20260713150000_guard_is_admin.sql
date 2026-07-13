-- ISS-05 선제 차단: users.is_admin 셀프 승격 방지.
-- 배경: users_update_own 정책은 "본인 행"만 볼 뿐 컬럼 제한이 없어, authenticated 유저가
--   PostgREST 로 자기 행 is_admin=true 를 갱신할 수 있다(2026-07-13 정책 qual 실측).
--   오늘은 is_admin 을 믿는 배선이 0 이라 무해하나, 인앱 GM/어드민 콘솔이 is_admin 을 배선하는
--   순간 P0 권한상승 — 배선 전에 자물쇠부터 건다.
--
-- 방식: is_admin 컬럼만 콕 집어 막는 BEFORE UPDATE 트리거(컬럼 화이트리스트 REVOKE/GRANT 는
--   updatable 컬럼 전수 열거가 필요해 누락 회귀 위험 — 트리거가 최소·정확).
--   role 판정은 current_user — PostgREST 는 SET ROLE authenticated 로 접속하므로 클라 세션은
--   current_user='authenticated'(anon 은 'anon'). service_role(Edge)·postgres(psql/마이그)는
--   그대로 통과 → 미래 GM 승격 경로 보존.
--   ⚠️ SECURITY DEFINER 금지: DEFINER 안에서는 current_user 가 함수 소유자(postgres)로 바뀌어
--      role 게이트가 무력화된다 — INVOKER(기본)로 둬야 호출자 role 이 보인다.

create or replace function public.guard_users_is_admin()
returns trigger
language plpgsql
-- security invoker (기본) — current_user = 호출자 실효 role 이어야 게이트가 성립.
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and current_user in ('authenticated', 'anon') then
    raise exception 'is_admin can only be changed by service_role (self-promotion blocked — ISS-05)'
      using errcode = '42501'; -- insufficient_privilege
  end if;
  return new;
end;
$$;

drop trigger if exists guard_users_is_admin on public.users;
create trigger guard_users_is_admin
  before update on public.users
  for each row execute function public.guard_users_is_admin();
