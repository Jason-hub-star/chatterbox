-- ROOM-14 리허설/본공연 모드 (주인님 확정 의미론 2026-07-09):
--   rehearsal   = 활성 참가자 전원 cue 진행 허용 (연습 방 규칙을 일반 방에서 토글)
--   performance = 호스트만 진행 (기본, 기존 동작 그대로)
-- 쓰기는 set-script-mode Edge(호스트 검증)만, 판정은 advance-script-cue 가 참조.
-- SSOT: docs/DATA-SCHEMA.md §1.2 · contracts/ScriptPanel.md
alter table public.rooms
  add column script_mode text not null default 'performance'
  check (script_mode in ('rehearsal', 'performance'));
