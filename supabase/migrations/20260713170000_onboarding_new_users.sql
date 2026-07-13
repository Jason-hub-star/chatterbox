-- G-ONB 온보딩: 신규 가입자만 온보딩 플로우를 시작하게 한다.
-- handle_new_user 트리거(신규 auth.users → public.users 자동 생성)가 onboarding_step='intro' 로 심는다.
-- 기존 유저는 이미 삽입돼 있어(onboarding_step=null 기본값) 영향 없음 — "기존 유저에게 가이드 미노출" 보장.
-- 프론트 OnboardingGuide 는 step ∈ {'intro','genre'} 에서만 뜨고, null/'lobby'/'done' 은 안 뜬다.
--
-- create_users 마이그의 handle_new_user 와 동일하되 onboarding_step 만 추가(멱등 create or replace).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (auth_id, email, display_name, onboarding_step)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@placeholder.local'),
    nullif(left(split_part(coalesce(new.email, ''), '@', 1), 20), ''),
    'intro'
  )
  on conflict (auth_id) do nothing;
  return new;
end;
$$;
