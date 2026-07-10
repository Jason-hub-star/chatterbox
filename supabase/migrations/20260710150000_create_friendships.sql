-- FriendSystem 코어(PROFILE-04, contracts/FriendSystem.md) — friendships 테이블.
-- as-built 편차(계약 §RLS 대비): ①auth.uid() 직비교 대신 current_user_id()(이 코드베이스는 users.id≠auth_id 분리)
-- ②쓰기 정책 미부여 = 클라 직접 INSERT/UPDATE 전면 거부 — 차단·레이트리밋·알림·미러행을 Edge(service_role)가 강제.
-- user_blocks 는 차단 UI(프로필 페이지 슬라이스)와 함께 — 소비자 없는 스키마 선행은 죽은 코드라 defer.
create table friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,   -- 요청자(행 소유)
  friend_id uuid not null references users(id) on delete cascade, -- 수신자
  relationship_type text not null check (relationship_type in ('friend', 'follow')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz, -- soft delete(계약: 30일 유예 정책은 후속 pg_cron)
  constraint no_self_friendship check (user_id <> friend_id),
  unique (user_id, friend_id, relationship_type)
);

create index idx_friendships_user_id on friendships(user_id);
create index idx_friendships_friend_id on friendships(friend_id);
create index idx_friendships_status on friendships(status);

alter table friendships enable row level security;

-- 조회는 당사자만(친구 목록·요청 수신함). 이름 해석은 list-friends Edge(service)가 담당(users RLS=본인만).
create policy friendships_select_own on friendships
  for select using (current_user_id() in (user_id, friend_id));

-- 요청 도착/수락 실시간(FriendsPanel 자동 갱신) — RLS 가 당사자 행만 방송.
alter publication supabase_realtime add table friendships;
