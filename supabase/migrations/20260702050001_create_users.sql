-- users: 앱 프로필 테이블 (Supabase Auth 와 분리)
-- SSOT: docs/DATA-SCHEMA.md §1.1
--
-- 설계 요점(Phase 2 결정):
--  - users.id (자체 UUID PK) 와 users.auth_id (= auth.uid()) 를 분리한다 (§1.1).
--  - 방 테이블의 host_id/user_id 는 users.id 를 참조한다.
--  - LiveKit identity 는 auth.uid() 를 그대로 쓰므로(기존 아바타 코드 유지), 서버 로직은
--    auth_id → users.id 매핑(current_user_id())으로 연결한다.

create table users (
  id                   uuid primary key default gen_random_uuid(),
  auth_id              uuid not null unique,                          -- Supabase Auth UID (auth.users.id)
  email                text not null unique,
  display_name         text,
  avatar_url           text,
  status               text default 'offline',
  is_admin             boolean default false,
  language             text default 'ko',
  timezone             text default 'Asia/Seoul',                     -- 표시용; 저장은 항상 UTC (G-82)
  onboarding_step      text default null,                             -- null | intro | genre | lobby | done
  preferred_genres     text[] default '{}',
  anonymous_session_id uuid references auth.users(id) on delete set null,  -- guest→정회원 이관 (G-56)
  bio                  text,
  profile_visibility   text default 'public',
  notification_prefs   jsonb default '{"room_invite":true,"room_scheduled":true,"room_full":false,"credit_low":true}',
  age_band             text default null,                             -- 14_17 | 18_plus (14세 미만 차단)
  age_attested_at      timestamptz default null,
  deleted_at           timestamptz default null,                      -- 소프트 삭제 (AUTH-05)
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),

  constraint users_display_name_len   check (display_name is null or char_length(display_name) between 1 and 20),
  constraint users_bio_len            check (bio is null or char_length(bio) <= 120),
  constraint users_status_chk         check (status in ('active','online','offline','away')),
  constraint users_profile_vis_chk    check (profile_visibility in ('public','connected','private')),
  constraint users_onboarding_chk     check (onboarding_step is null or onboarding_step in ('intro','genre','lobby','done')),
  constraint users_age_band_chk       check (age_band is null or age_band in ('14_17','18_plus'))
);

-- updated_at 자동 갱신 (update_timestamp() 는 app_config 마이그레이션에서 이미 생성됨)
create trigger set_updated_at
  before update on users
  for each row execute function update_timestamp();

-- auth.uid() → users.id 매핑. RLS 정책과 서버 게이트에서 재사용.
-- security definer: RLS 를 우회해 users 를 조회(재귀 방지). search_path 고정(보안).
create or replace function current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users where auth_id = auth.uid() and deleted_at is null;
$$;

-- RLS: 본인 행만 읽기/수정. 타 사용자 표시는 public_rooms 뷰 + LiveKit 로 커버(이 슬라이스).
-- ponytail: profile_visibility public/connected 교차조회 정책은 후속(프로필 기능) 슬라이스.
alter table users enable row level security;

create policy users_select_own on users
  for select using (auth_id = auth.uid());

create policy users_update_own on users
  for update using (auth_id = auth.uid());

-- auth.users INSERT → public.users 프로필 자동 생성.
-- display_name 기본값 = 이메일 로컬파트(최대 20자), 없으면 null.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (auth_id, email, display_name)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@placeholder.local'),
    nullif(left(split_part(coalesce(new.email, ''), '@', 1), 20), '')
  )
  on conflict (auth_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 기존 auth 유저 1회 백필 (트리거 도입 전에 가입한 계정).
insert into public.users (auth_id, email, display_name)
select id, coalesce(email, id::text || '@placeholder.local'),
       nullif(left(split_part(coalesce(email, ''), '@', 1), 20), '')
from auth.users
on conflict (auth_id) do nothing;
