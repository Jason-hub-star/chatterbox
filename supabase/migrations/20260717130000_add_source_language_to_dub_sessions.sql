-- DUB-LANG: 더빙 소스 언어를 방 UI 언어(rooms.language)와 분리한다.
-- 근본: STT(start-dub-transcription)·번역(translate-dub-script) 둘 다 소스 언어로 rooms.language 를
--   써서, UI 로 만든 방(항상 language='ko')에 일본/영어 영상을 올리면 STT 오인식 + 번역 스킵으로
--   간판 JP→KR 더빙이 무오류로 깨졌다(프로드 라이브 검증 확인). 소스 언어는 방 UI 언어가 아니라
--   '이 더빙 작업의 원본 언어' 라는 세션 속성 → dub_sessions 에 저장한다.
-- 읽기 폴백: source_language ?? rooms.language ?? 'ko' → 컬럼 없는 legacy 세션은 기존 동작 유지(회귀 0).
-- 화이트리스트는 create-room LANGS(['ko','en','ja'])와 동형.

alter table dub_sessions
  add column source_language text
  check (source_language is null or source_language in ('ko', 'en', 'ja'));
