-- G3(ROOM-13) 인앱 녹화 — recordings + room_artifacts (DATA-SCHEMA §1.11·§1.22 준수).
-- 쓰기는 전부 service_role(Edge) 전용 — 클라 정책 없음. consent_json 은 계약
-- specs/security/consent-credits-quota.md §11.2 구조(ip_hash 포함) 그대로 Edge 가 관리.

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade, -- 시작한 호스트
  storage_object_key text, -- R2 키. consent_pending 단계엔 아직 없음 → nullable(§1.11 대비 편차: 2단계 시작 흐름)
  signed_url_cache text,
  duration_ms int,
  file_size_bytes bigint,
  status text not null default 'consent_pending'
    check (status in ('consent_pending','recording','processing','ready','failed','cancelled','discarded')),
  visibility text not null default 'members_only'
    check (visibility in ('public','private','members_only','private_hold')),
  thumbnail_url text,
  consent_json jsonb not null default '{"participants":{},"all_consented":false}'::jsonb,
  local_backup_manifest jsonb,      -- ROOM-23(V-4) 예약 — 현재 미사용
  upload_resume_token_hash text,    -- ROOM-23(V-4) 예약 — 현재 미사용
  started_at timestamptz,           -- 실제 녹화 시작(all_consented 후). 요청 시각은 created_at
  ended_at timestamptz,
  retention_expires_at timestamptz, -- ended_at + 90일 (Edge 가 complete 시 세팅)
  created_at timestamptz not null default now()
);

create index recordings_room_idx on public.recordings (room_id, created_at desc);

alter table public.recordings enable row level security;

-- SELECT: 계약 §1.11 RLS — public 전체 / members_only 같은 방 멤버 / private(및 그 외) 본인.
-- private_hold 는 어떤 일반 경로도 불가(service 전용) — 정책에서 명시 제외.
create policy recordings_select on public.recordings
  for select using (
    status <> 'discarded' and visibility <> 'private_hold' and (
      visibility = 'public'
      or (visibility = 'members_only' and public.is_room_member(room_id))
      or user_id = public.current_user_id()
    )
  );

create table public.room_artifacts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  source_type text not null check (source_type in ('vgen_job','recording','dub_output')),
  source_id uuid not null,
  title text,
  thumbnail_object_key text,
  media_object_key text not null,
  share_url_cache text,
  visibility text not null default 'room' check (visibility in ('private','room','public_link')),
  created_at timestamptz not null default now()
);

create index room_artifacts_room_idx on public.room_artifacts (room_id, created_at desc);

alter table public.room_artifacts enable row level security;

-- SELECT: room = 같은 방 멤버 / private = 소유자. public_link 는 직접 SELECT 없이 Edge signed URL 만(§1.22).
create policy room_artifacts_select on public.room_artifacts
  for select using (
    (visibility = 'room' and public.is_room_member(room_id))
    or user_id = public.current_user_id()
  );

-- 보존기간 만료 행 삭제(§11.4) — 매일 04:20 UTC. R2 오브젝트 정리는 defer(ponytail:
-- pg 에서 R2 삭제 불가 — 만료 스윕 Edge 로 승급 예정, 행 삭제가 재생 경로(발급)는 즉시 차단).
select cron.schedule(
  'purge-expired-recordings',
  '20 4 * * *',
  $$delete from public.recordings where retention_expires_at is not null and retention_expires_at < now()$$
);
