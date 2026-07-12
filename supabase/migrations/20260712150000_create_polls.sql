-- 관객 투표 (ROOM-22, V-5) — polls + poll_responses
-- SSOT: docs/DATA-SCHEMA.md §1.25 · docs/contracts/MobileViewer.md §4.2
--
-- FSM: open(투표 가능·percent 비공개) → revealed(마감·counts 스냅샷 공개) → closed. open→closed 직행 허용.
-- 쓰기는 전부 service_role(Edge: create-poll·set-poll-status·submit-viewer-poll) — 클라 쓰기 정책 없음.
-- 라이브 동기는 LiveKit `poll` 서버 릴레이 토픽. Realtime 게시 안 함(늦입장은 RLS SELECT 로 수렴).

create table polls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  created_by uuid not null references users(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 200),
  options jsonb not null check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4
  ),
  status text not null default 'open' check (status in ('open', 'revealed', 'closed')),
  -- reveal 시 서버 집계 스냅샷(늦입장 percent 동기). open 동안 null — 중간 결과 비공개.
  counts jsonb,
  created_at timestamptz not null default now()
);

-- 방당 활성 폴 1개(activePoll 단일 모델) — 동시 생성 경쟁을 DB 가 원자 차단(Edge 는 23505 → 409).
create unique index polls_one_active_per_room on polls (room_id) where status <> 'closed';

create table poll_responses (
  poll_id uuid not null references polls(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  choice_index int not null check (choice_index between 0 and 3),
  created_at timestamptz not null default now(),
  -- 1인 1표. upsert = open 동안 선택 변경 허용.
  primary key (poll_id, user_id)
);

alter table polls enable row level security;
alter table poll_responses enable row level security;

-- 멤버만 폴 조회(늦입장 초기 동기·활성 폴 fetch).
create policy polls_select_member on polls
  for select using (is_room_member(room_id));

-- 본인 투표만 조회(내 선택 하이라이트). 타인 행 불가 → 중간 집계를 클라 SELECT 로 재구성 못 함 —
-- 선택지별 결과는 reveal 스냅샷(polls.counts)과 서버 릴레이만이 공개 경로(MobileViewer §4.2).
create policy poll_responses_select_own on poll_responses
  for select using (user_id = current_user_id());
