-- notifications: 인앱 알림(Phase 5, LOB-08 재초대·LOB-06 예약의 공통 인프라).
-- SSOT: docs/DATA-SCHEMA.md §1.24(축소 as-built — email/push 는 provider 후속, in-app 만).
-- 쓰기 = service_role(Edge)만. 읽기 = 본인 행만(RLS) — 클라가 직접 SELECT/realtime 구독.
-- 읽음 처리 = 본인 행의 read_at 컬럼만(UPDATE 컬럼 그랜트로 나머지 컬럼 변조 차단).
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  type       text not null,              -- 're_invite' | 'reservation_invite' | 'reservation_reminder' | …
  payload    jsonb not null default '{}',
  room_id    uuid references rooms(id) on delete set null,
  read_at    timestamptz,
  created_at timestamptz default now()
);

create index idx_notifications_user on notifications(user_id, created_at desc);

alter table notifications enable row level security;

-- 본인 알림만 조회(realtime postgres_changes 도 이 정책을 따른다).
create policy notifications_select_own on notifications
  for select to authenticated
  using (user_id = current_user_id());

-- 본인 알림의 read_at 만 갱신 가능: 행은 RLS, 컬럼은 그랜트로 제한.
create policy notifications_update_own on notifications
  for update to authenticated
  using (user_id = current_user_id())
  with check (user_id = current_user_id());

revoke update on notifications from anon, authenticated;
grant update (read_at) on notifications to authenticated;
-- INSERT/DELETE 는 정책 없음(deny) — service_role 만.

alter publication supabase_realtime add table notifications;
