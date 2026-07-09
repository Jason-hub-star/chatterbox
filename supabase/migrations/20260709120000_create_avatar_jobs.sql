-- avatar_jobs: PNG→Live2D 자동 리깅 잡 테이블 + RLS + Realtime — 기능 수직 슬라이스.
-- vgen_jobs(20260704120000) 패턴 복제 축소: 크레딧/디덥/모더레이션은 이번 슬라이스 제외(해피패스).
--  - 트리거 = Edge(create-avatar-job) → Modal 웹엔드포인트 spawn.
--  - 진행/완료 = 파이프라인이 service_role 로 직접 PATCH(phase/status). 별도 webhook 불요(1차).
--  - RLS: SELECT 만(본인 행). 쓰기는 service_role(Edge·파이프라인)만 = deny by default.
--    Realtime 전달도 이 SELECT 정책을 타므로 본인 행 구독이 성립한다.

create table avatar_jobs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  status             text not null default 'queued',   -- queued|running|done|failed
  phase              text,                              -- analyzing|cutting|rigging|finishing
  input_object_key   text,                             -- Storage avatar-uploads/<user>/uploads/<uuid>.png
  result_project_url text,                             -- avatars/<job>/project.json (완료 시)
  provider           text not null default 'modal',
  provider_call_id   text,                             -- Modal FunctionCall id
  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  completed_at       timestamptz,
  constraint avatar_jobs_status_chk check (status in ('queued','running','done','failed'))
);

create index avatar_jobs_user_idx   on avatar_jobs (user_id, created_at desc);
create index avatar_jobs_status_idx on avatar_jobs (status);

create trigger set_updated_at
  before update on avatar_jobs
  for each row execute function update_timestamp();

alter table avatar_jobs enable row level security;

create policy avatar_jobs_select on avatar_jobs
  for select using (user_id = current_user_id());

-- Realtime: status/phase 변화 구독(queued→running→done/failed, phase 진행)
alter publication supabase_realtime add table avatar_jobs;
