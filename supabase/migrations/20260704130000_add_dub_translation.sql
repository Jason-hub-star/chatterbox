-- DUB 자동번역(DUB-06): dub_tracks 에 번역 텍스트 컬럼.
-- SSOT: docs/DATA-SCHEMA.md §1.13 · docs/state-machines/DubSession.md
--
-- 번역 주 저장은 dub_sessions.diarization_result_json.segments[].translated_text (JSONB 스키마리스,
--   역할배정 전에도 존재). 이 컬럼은 assign-dub-roles 가 세그먼트→트랙 복사 시, 또는
--   translate-dub-script 가 역할배정 후 번역할 때 채운다(녹음 화면 DubRecorder 표시용).
-- 컬럼 단위 RLS 없음 — 기존 dub_tracks 행 RLS(is_dub_member SELECT·쓰기 service_role) 그대로 적용.

alter table dub_tracks add column translated_text text;  -- JP/EN → KR 번역(nullable, 미번역 시 원문 사용)
