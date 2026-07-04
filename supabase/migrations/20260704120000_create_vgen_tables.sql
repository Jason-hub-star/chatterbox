-- VGEN(AI 영상생성) 잡 테이블 + RLS + Realtime — 슬라이스1.
-- SSOT: docs/DATA-SCHEMA.md §1.8 · docs/state-machines/Vgen.md · docs/specs/RefundPolicy.md
--
-- 설계 결정(Opus 검토):
--  - status CHECK: DATA-SCHEMA 는 CHECK 미정의 → DB 상태집합(pending|generating|done|failed|flagged)으로 제약.
--    'moderating'/appeal 진행은 프론트/API 상태 — DB 미영속(§1.8 주석).
--  - RLS: SELECT 만 정책(visibility 게이트). INSERT/UPDATE 정책 없음(deny) = Edge Function(service_role)만.
--    호스트 판정은 triggered_by(=생성 호스트)로 근사 — DUB(created_by) 패턴 미러, rooms 조인 RLS 재귀 회피.
--  - 3-way DONE 게이트·크레딧 원자성은 RPC(20260704120002)·vgen-webhook·cron(20260704120003)에서 강제.
--  - 저장: result_object_key = R2 durable SSOT. result_url = 단기 signed 캐시(공개 URL 아님).
--  - slice1 미사용 컬럼(output_9x16_url·clip_count·flagged_categories·appeal_status·egress_id)은 스키마 예약 —
--    코드경로 없음. vgen_appeals(§1.8.1)는 slice2 defer — 이 마이그에서 생성 안 함.

create table vgen_jobs (
  id                 uuid primary key default gen_random_uuid(),
  room_id            uuid not null references rooms(id) on delete cascade,
  triggered_by       uuid not null references users(id) on delete cascade,
  prompt_text        text not null,
  prompt_hash        text not null,                    -- SHA256, dedup 키
  prompt_snapshot    text,                             -- 모더레이션 시점 스냅샷(VGEN-01 LWW, slice2)
  egress_id          text,                             -- LiveKit Egress 매핑(slice1 미사용)
  status             text not null default 'pending',  -- pending|generating|done|failed|flagged
  appeal_status      text,                             -- slice2 예약
  failure_reason     text,                             -- moderation_rejected|provider_error|timeout|validation_failed
  result_object_key  text,                             -- R2 durable SSOT
  result_url         text,                             -- 단기 signed 캐시(공개 URL 아님)
  provider           text not null default 'seedance',
  model_id           text not null default 'seedance-v2.0',
  provider_job_id    text,                             -- fal request_id (webhook 정합)
  duration_sec       int not null default 10,
  credit_cost        int not null default 0,
  estimated_cost_usd numeric(10, 4),
  output_format      text not null default '16:9',     -- '16:9'|'9:16'(slice2)
  output_9x16_url    text,                             -- slice2 예약
  clip_count         int not null default 1,           -- slice2 예약
  visibility         text not null default 'members_only',  -- public|private|members_only|private_hold
  flagged_categories text[],                           -- slice2 예약
  idempotency_key    text unique,                      -- SHA256(prompt_hash+user+room+10s버킷), C3
  credit_deducted_at timestamptz,                      -- null=미차감
  credit_refunded_at timestamptz,
  validation_status  text not null default 'pending',  -- pending|passed|failed (MP4 무결성, C5)
  created_at         timestamptz not null default now(),
  completed_at       timestamptz,
  updated_at         timestamptz not null default now(),
  unique (room_id, prompt_hash),                        -- dedup: 같은 방 같은 프롬프트 = 같은 결과(VGEN-05)
  constraint vgen_jobs_status_chk
    check (status in ('pending','generating','done','failed','flagged')),
  constraint vgen_jobs_validation_chk
    check (validation_status in ('pending','passed','failed')),
  constraint vgen_jobs_format_chk
    check (output_format in ('16:9','9:16')),
  constraint vgen_jobs_visibility_chk
    check (visibility in ('public','private','members_only','private_hold')),
  constraint vgen_jobs_appeal_chk
    check (appeal_status is null or appeal_status in ('pending','reviewing','approved','rejected'))
);

create index vgen_jobs_room_idx        on vgen_jobs (room_id, created_at desc);
create index vgen_jobs_triggered_idx   on vgen_jobs (triggered_by);
create index vgen_jobs_status_idx      on vgen_jobs (status);
create index vgen_jobs_prompt_hash_idx on vgen_jobs (prompt_hash);

create trigger set_updated_at
  before update on vgen_jobs
  for each row execute function update_timestamp();

-- ── RLS: visibility 게이트(SELECT). 쓰기는 service_role(Edge Function)만. ──
alter table vgen_jobs enable row level security;

create policy vgen_jobs_select on vgen_jobs
  for select using (
    visibility = 'public'
    or triggered_by = current_user_id()
    or (visibility = 'members_only' and is_room_member(room_id))
  );

-- ── Realtime: status 변화 구독(pending→generating→done/failed) ──
alter publication supabase_realtime add table vgen_jobs;
