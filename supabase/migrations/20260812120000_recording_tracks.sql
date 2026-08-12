-- ROOM-28 P2a 참가자별 로컬 원본 트랙 (double-ender).
-- 계약: docs/contracts/VoiceRecording.md §P2 설계 / 골: docs/goals/GOAL-voice-multitrack.md
--
-- P1 믹스(recordings)는 **듣기용**, 이 테이블은 **편집용** 원본 N개. 서로를 대체하지 않는다.
-- unique(recording_id, participant_id) = 참가자당 1행 — 리테이크(P2b)는 행을 덮어쓰고 옛 오브젝트를
-- 지운다(테이크마다 행을 쌓으면 저장이 선형 증가하고 "어느 게 최종"이 흐려진다).
create table if not exists public.recording_tracks (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings(id) on delete cascade,
  participant_id uuid not null references public.users(id) on delete cascade,
  storage_object_key text,            -- 서버 생성. 클라가 준 키는 신뢰하지 않는다(제출 시 프리픽스 검증)
  start_offset_ms int not null default 0,  -- recording_started 수신 대비 자기 recorder 시작 지연
  duration_ms int,
  file_size_bytes bigint,
  take_no int not null default 1,
  status text not null default 'recording'
    check (status in ('recording', 'submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recording_id, participant_id)
);

create index if not exists recording_tracks_recording_idx
  on public.recording_tracks (recording_id);

alter table public.recording_tracks enable row level security;

-- SELECT: 그 녹화가 속한 방의 참가자만(= recordings 의 가시성을 그대로 상속).
--   is_room_member() 는 SECURITY DEFINER 라 RLS 재귀를 피한다(20260702050003 선례).
drop policy if exists recording_tracks_select_member on public.recording_tracks;
create policy recording_tracks_select_member on public.recording_tracks
  for select to authenticated
  using (
    exists (
      select 1 from public.recordings r
       where r.id = recording_tracks.recording_id
         and public.is_room_member(r.room_id)
    )
  );

-- 쓰기는 service_role(Edge) 전용 — 클라 직접 INSERT/UPDATE 금지.
-- 동의 게이트·키 생성·프리픽스 검증이 전부 서버에 있어야 성립한다(계약 P2 MUST NOT).

comment on table public.recording_tracks is
  'ROOM-28 P2a: 음성 녹음의 참가자별 로컬 원본 트랙(편집용). recordings 는 호스트 믹스(듣기용).';
comment on column public.recording_tracks.start_offset_ms is
  'recording_started 수신 대비 recorder 시작 지연(ms). 브로드캐스트 지연만큼 계통 오차 있고 클럭 드리프트 미보정 — ceiling.';
