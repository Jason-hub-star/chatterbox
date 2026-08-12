-- ROOM-28 음성 전용 방 녹음 — 산출물 종류를 행 생성 시점에 확정한다.
-- 계약: docs/contracts/VoiceRecording.md §데이터 델타 / 스키마: docs/schema/02-content-and-economy.md §1.11
--
-- 왜 컬럼인가: 업로드 키가 `recordings/<roomId>/<recordingId>.webm` 로 종류와 무관하고(audio-only 도 webm),
-- 산출물 종류를 파일 확장자·MIME 로 추정하면 다시보기가 `<video>`/`<audio>` 를 잘못 고른다.
-- default 'stage' = 기존 행·기존 호출부(kind 미지정) 무회귀.
alter table public.recordings
  add column if not exists kind text not null default 'stage';

alter table public.recordings
  drop constraint if exists recordings_kind_check;

alter table public.recordings
  add constraint recordings_kind_check check (kind in ('stage', 'voice'));

comment on column public.recordings.kind is
  'ROOM-28 산출물 종류. stage=무대 합성 영상(V-3) / voice=음성 전용. 확장자로 추정 금지.';
