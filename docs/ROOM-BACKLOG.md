---
tags: [status, backlog]
---

<!--
  2026-07-11 - 룸 페이지 SSOT 대조 전수 스캔(하이쿠 2기 + 메인 직접 검증) 산출물.
  /backlog docs/ROOM-BACKLOG.md 로 소비한다 — §0 체크리스트가 소스.
  각 행 끝의 probe 주석(형식: "probe: 상대경로 :: 정규식", 정규식 생략 시 파일 존재만)은
  scripts/check-backlog-drift.mjs 가 읽어 STALE(구현 흔적 있는데 미체크)·REGRESSION(체크됐는데
  흔적 소실)을 감지한다. 자동 [x] 전환은 하지 않는다 — 검증(실측) 없는 체크 금지, 스크립트는 표식만.
  미구현 항목의 probe 경로는 "구현 시 권장 산출물 경로"를 겸한다(그 경로로 만들면 자동 감지).
-->

# ROOM-BACKLOG — 룸 페이지 미구현 인덱스 (2026-07-11 스캔)

방침(주인님 콜): **수직 기능(트랙 V)을 먼저 세우고 → UIUX(트랙 U)에 집중.** 근거 file:line 은 스캔 실측. 스펙 원행은 `FEATURE-SPEC.md`(ROOM/HOST/RT)·`GAP-MATRIX.md`.

## §0. 체크리스트

### 트랙 V — 수직 기능 (먼저)

- [x] **V-1 채팅 모더레이션 묶음** (HOST-09 슬로우모드·HOST-10 금칙어·HOST-11 클리어/숨김) — 구현(2026-07-11): rooms 정책 컬럼+`audit_logs` 마이그(`20260711170000`)·`set-chat-policy`/`moderate-chat` Edge(soft delete+감사+`chat-mod` broadcast)·send-chat 서버 강제(400 banned_word/429 slow_mode·호스트 면제)·HostConsole 정책 UI+클리어 Modal·ChatPanel 호스트 숨김. **실측**: 통합 18/18(로컬+프로드)·deno 3/3·게이트 그린 · ✅ 프로드 배포+2탭 E2E(hide 라이브 전파, 2026-07-12). <!-- probe: supabase/functions/moderate-chat/index.ts -->
- [x] **V-2 신고/차단** — 구현(2026-07-12 · 스펙 정정: `reporting-logging-feedback.md` §16.2 차단=**개인 경험 필터**라 livekit-token 입장 게이트 가정 폐기): 마이그 `20260711180000`(moderation_reports 운영 큐·user_blocks+blocked_auth_id 비정규화·본인 SELECT RLS)·`create-report`(3/분+20/시·발신자/본문 서버 확정 스냅샷·audit)·`create-block`/`delete-block`(멱등)·ChatPanel 접힘/펼침·신고 모달(+동시 차단)·차단 해제. **실측**: 통합 19/19(로컬+프로드)·deno 3/3·게이트 그린 · ✅ 프로드 배포+2탭 E2E(차단 접힘, 2026-07-12). <!-- probe: supabase/functions/create-report/index.ts -->
- [ ] **V-3 인앱 녹화·다시보기 (ROOM-13)** — 방식 확정(GOAL-g3 §0): 아바타는 비디오트랙이 아니라 Egress 기본 컴포지트 불가 → **클라 캔버스 합성 녹화(P1)**·Egress custom template 은 P2 승급. **백엔드 완료(2026-07-12)**: 마이그 `20260712120000`(recordings+room_artifacts·RLS·보존 cron)+Edge 5종(start/consent/upload/complete/url — 동의 게이트 §11.1.1) 통합 **17/17**·deno 5/5. **C 레코더 완료(2026-07-12)**: `stageRecorder.ts`(좌석 캔버스 rAF 합성+원형 클립·WebAudio 믹스·webm) + 좌석 preserveDrawingBuffer 활성. 잔여: D(동의 모달·⏺ 배선·REC·재생)·배포 라이브 실측. <!-- probe: src/pages/RoomPage.tsx :: startStageRecorder -->
- [ ] **V-4 로컬 백업 녹화 (ROOM-23)** — 참가자별 MediaRecorder chunk + IndexedDB(`DubRecorder.tsx:11` defer와 공유 기반).
- [ ] **V-5 관객 투표/폴 (ROOM-22)** — 코드 0건(grep 실측). <!-- probe: src/features/room/PollPanel.tsx -->
- [ ] **V-6 방장 이양 명시 UI + HOST-02 화면 비활성화** — 서버 승계(leave-room)·음소거만 존재.
- [x] **V-7a 하드닝 — ROOM_MAX_USERS·CORS 스위치** (2026-07-12) — 정원 상한을 app_config `ROOM_MAX_USERS`(기본 6) 클램프로(create-room 생성 시 — 방별 강제는 기존 RPC 'full' 원자 담당) + CORS 를 env `ALLOWED_ORIGIN` 스위치로(기본 '*' 유지: localhost→프로드 개발 루프 상시 의존·Bearer API 라 실위험 Low — 공개 런칭 때 secrets 로 좁힘, 다오리진 echo 는 json(req) 전 함수 승급 ceiling). **실측**: 정원 7 요청 400(프로드 통합)·deno 전 함수 스윕 클린·전 함수 재배포 완료(2026-07-12). <!-- probe: supabase/functions/create-room/index.ts :: ROOM_MAX_USERS -->
- [ ] **V-7b 서버 하드닝 잔여(defer)** — leave-room 30s grace·sync-script-role DB 승급·livekit-token onboarding/age 게이트(의존 기능·테이블 부재)·CORS 다오리진 echo. 사유: 의존 기능 미구현·실위험 Low — 해당 기능 슬라이스에 동반.
- [ ] **V-8 1:1 귓속말 (G-72)** — recipient 필드 or DM 토픽(send-chat 확장).
- [ ] **V-9 리허설 피드백 (ROOM-24)** — 10초 다시듣기·대사 겹침 분석. V-3(녹화) 뒤.

### 트랙 U — UIUX (V 안정 후 1패스)

- [ ] **U-1 씬 대화형 레이어 (ROOM-26)** — PNG 파츠 클릭/호버·파티클·사운드(코드 0건 실측).
- [ ] **U-2 앰비언트/BGM (ROOM-27)** — `AudioMixerPanel.tsx:7` defer.
- [ ] **U-3 배속 조절 (ROOM-18/G-29)** — 컨트롤 바 0.5x~2x.
- [ ] **U-4 무대 폴리시** — 슬롯 드래그 재배치·정밀 좌표·glow 연결선(`stageLayout.ts:3`).
- [ ] **U-5 다크 elevation·라이트모드** — DOGFOOD 트랙 B P2 잔여(그쪽 행이 SSOT, 여긴 포인터).

## §1. 완료 — 회귀 감시 (probe 활성)

- [x] **ROOM-11 트래킹 실패 폴백** — 얼굴 미인식 → 빈 blendshape 폴백(중립 idle·원격 동반 idle). 유닛 + 실렌더 E2E 9/9 + 프로드 스모크 4/4(픽셀 시간변화=폴백 구동, 2026-07-11 배포). <!-- probe: src/hooks/useFaceTracking.ts :: ROOM-11 -->
- [x] **채팅 영속화 (ROOM-05·ChatPanel.md 계약)** — send-chat 서버릴레이 + `messages` 30일 보존(pg_cron purge)·히스토리 백필. 통합 17/17 + 배포판 2탭 E2E 10/10(2026-07-11 프로드 배포 완료 — 릴레이 왕복·행 영속·새로고침 백필). <!-- probe: supabase/functions/send-chat/index.ts :: check_rate_limit --> <!-- probe: supabase/migrations/20260711100000_create_messages.sql -->
- 보안 5건(SEC-RA-1·AVJ-1·RXN-1·CR-1·CR-2)의 probe 는 `DOGFOOD-AUDIT-2026-07.md` §0 원행에 부착(중복 등재 안 함).

## 스캔에서 정리한 stale 표식 (2026-07-11)

- `RoomPage.tsx` cue 권한 ponytail 주석 삭제 — `advance-script-cue` 서버 재검증이 이미 배선(SEC-5).
- MILESTONES "필살기 핫키+Lottie" [x] 정정 — 이모트 기능화(Lottie 8종·핫키)로 충족.
- 오탐 방지 기록: ROOM-20/21(손들기·무대초대)·ROOM-25(네트워크 인디케이터)·HOST-01/03/08(강퇴·비번·뮤트)·초대/시크릿룸은 구현 확인됨 — 미구현 아님.
