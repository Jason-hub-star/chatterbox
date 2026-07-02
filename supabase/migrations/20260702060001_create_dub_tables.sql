-- 더빙(DUB) 3테이블 + RLS + Storage 버킷
-- SSOT: docs/DATA-SCHEMA.md §1.12~1.14 · docs/state-machines/DubSession.md · docs/specs/SecurityPolicies.md §2.2
--
-- 설계 결정(오푸스 검토):
--  - status CHECK: DATA-SCHEMA 는 CHECK 미정의 → FSM 상태집합으로 제약을 건다.
--    (IDLE/UPLOADING 은 클라 전용 상태 — DB status 에 없음. §DubSession FSM)
--  - RLS 재귀 회피: dub_tracks/dub_outputs 정책이 room_participants 를 직접 조회하면
--    rp_select_member 정책이 다시 걸린다. is_dub_member() SECURITY DEFINER 로 우회
--    (rooms 의 is_room_member() 와 동일 패턴, 20260702050003_room_rls.sql 참조).
--  - 쓰기 정책 없음(deny): 모든 INSERT/UPDATE 는 Edge Function(service_role)만.
--    URL/클라 직접쓰기 차단(방 로직과 동일 보안모델).
--  - 저장소: Cloudflare R2 대신 Supabase Storage 비공개 버킷 dub-assets 사용.
--    ponytail: 프로덕션은 R2 로 이관(업로드=createSignedUploadUrl, 다운로드=service_role).

-- ── §1.12 dub_sessions ──────────────────────────────────────────────
create table dub_sessions (
  id                      uuid primary key default gen_random_uuid(),
  room_id                 uuid not null references rooms(id) on delete cascade,
  created_by              uuid not null references users(id) on delete cascade,
  source_video_url        text not null,               -- Storage object path (또는 VGEN key)
  source_type             text not null,               -- 'mp4' | 'vgen' | 'youtube'(P2 비활성)
  youtube_url             text,                         -- P2 전용, MVP 미사용
  whisper_job_id          text,                         -- 외부 Whisper 작업 ID
  diarization_result_json jsonb,                        -- {segments:[{id,start_ms,end_ms,text}]} (화자 없음: whisper-1 은 diarization 불가)
  role_version            int not null default 1,       -- DUB-03/04 역할배정 잠금 버전(H12)
  roles_locked_at         timestamptz,                  -- 녹음 중 non-null, 역할수정 차단
  roles_locked_by         uuid references users(id) on delete set null,
  consent_json            jsonb not null default '{"participants": {}, "all_consented": false}'::jsonb,  -- G-43
  retention_expires_at    timestamptz not null default (now() + interval '90 days'),                     -- G-39 보존기간
  status                  text not null default 'uploaded',
  error_message           text,
  created_at              timestamptz not null default now(),
  completed_at            timestamptz,
  updated_at              timestamptz not null default now(),
  constraint dub_sessions_status_chk
    check (status in ('uploaded','transcribing','ready','recording','compositing','completed','failed')),
  constraint dub_sessions_source_chk
    check (source_type in ('mp4','vgen','youtube'))
);

create trigger set_updated_at
  before update on dub_sessions
  for each row execute function update_timestamp();

-- ── §1.13 dub_tracks ────────────────────────────────────────────────
create table dub_tracks (
  id                      uuid primary key default gen_random_uuid(),
  dub_session_id          uuid not null references dub_sessions(id) on delete cascade,
  participant_id          uuid not null references users(id) on delete cascade,
  speaker_name            text not null,                -- "Segment 1" 등(호스트 배정) / 이후 실이름
  start_time_ms           int not null,
  end_time_ms             int not null,
  transcript_text         text not null,                -- Whisper 원문
  recording_url           text,                         -- 녹음 오디오 Storage path (제출 후)
  recording_duration_ms   int,
  local_backup_manifest   jsonb,                        -- ROOM-23: 로컬 청크 백업(후속)
  upload_resume_token_hash text,                        -- 청크 업로드 재개 토큰 해시(후속)
  calibration_offset_ms   int not null default 0,       -- 더빙 타이밍 동기 오프셋
  status                  text not null default 'assigned',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (dub_session_id, participant_id, speaker_name),
  constraint dub_tracks_status_chk
    check (status in ('assigned','recording','submitted','synced'))
);

create trigger set_updated_at
  before update on dub_tracks
  for each row execute function update_timestamp();

-- ── §1.14 dub_outputs (합성 결과 — DUB-05 는 P2, MVP 는 테이블만) ──────
create table dub_outputs (
  id                      uuid primary key default gen_random_uuid(),
  dub_session_id          uuid not null references dub_sessions(id) on delete cascade,
  status                  text not null default 'compositing',
  output_object_key       text,
  output_video_url        text,
  file_size_bytes         bigint,
  duration_ms             int,
  error_message           text,
  created_at              timestamptz not null default now(),
  completed_at            timestamptz,
  constraint dub_outputs_status_chk
    check (status in ('compositing','ready','failed'))
);

-- ── 인덱스 ──────────────────────────────────────────────────────────
create index dub_sessions_room_idx    on dub_sessions (room_id);
create index dub_sessions_status_idx  on dub_sessions (status);
create index dub_tracks_session_idx   on dub_tracks (dub_session_id);
create index dub_tracks_participant_idx on dub_tracks (participant_id);
create index dub_outputs_session_idx  on dub_outputs (dub_session_id);

-- ── 멤버십 헬퍼(RLS 재귀 회피) ──────────────────────────────────────
-- dub_session_id → room_id → 참가자 여부를 service definer 로 판정.
create or replace function is_dub_member(p_dub_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dub_sessions ds
    join public.room_participants rp on rp.room_id = ds.room_id
    join public.users u on u.id = rp.user_id
    where ds.id = p_dub_session_id
      and u.auth_id = auth.uid()
      and rp.state <> 'left'
  );
$$;

-- ── RLS: 같은 방 참가자만 SELECT. 쓰기는 service_role(Edge Function)만. ──
alter table dub_sessions enable row level security;
alter table dub_tracks   enable row level security;
alter table dub_outputs  enable row level security;

create policy dub_sessions_select_member on dub_sessions
  for select using (created_by = current_user_id() or is_room_member(room_id));

create policy dub_tracks_select_member on dub_tracks
  for select using (is_dub_member(dub_session_id));

create policy dub_outputs_select_member on dub_outputs
  for select using (is_dub_member(dub_session_id));

-- ── Realtime: 상태 변화 구독(업로드→STT→ready→recording, 트랙 status) ──
alter publication supabase_realtime add table dub_sessions;
alter publication supabase_realtime add table dub_tracks;
alter publication supabase_realtime add table dub_outputs;

-- ── Storage: 더빙 소스/녹음 비공개 버킷 ─────────────────────────────
-- 업로드=Edge Function 이 발급한 signed upload URL(토큰 인증, RLS 우회),
-- 다운로드=Edge Function(service_role) 직접 download → Storage RLS 정책 불필요.
insert into storage.buckets (id, name, public)
values ('dub-assets', 'dub-assets', false)
on conflict (id) do nothing;
