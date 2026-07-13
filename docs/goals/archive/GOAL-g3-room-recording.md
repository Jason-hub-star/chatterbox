# GOAL-g3 — V-3 인앱 녹화·다시보기 (ROOM-13)

## /goal 한 줄

/goal 호스트가 전원 사전동의 후 무대를 녹화→R2 저장→방 작품으로 재생 가능 — verified by 통합테스트(동의 게이트 412·all_consented 전이·RLS·업로드-완료-재생 왕복) + 프로드 라이브 녹화 1건 실측, while preserving G1·G2 검증 표면 green + 기존 방 루프 무회귀(131 테스트).

## 0. 방식 결정 (2026-07-12 실측 근거)

**클라이언트 캔버스 합성 녹화(P1) 채택, LiveKit Egress 는 P2 승급 경로.**

- 아바타는 LiveKit **비디오 트랙이 아니다**(blendshape DataChannel → 클라 Pixi 렌더). Egress 기본 RoomComposite = 검은 타일 + 음성만. Egress 로 하려면 custom template(배포 프론트 뷰어 라우트 + egress 전용 토큰) 의존 — 배포 결합·비용(분당 과금) 큼.
- 전례: `contracts/DubCompositor.md:142` — 합성을 ffmpeg.wasm(P1·비용절감) 채택, Egress(P2·품질) 승급 경로로 못박음. 같은 원칙.
- 구현: 호스트 클라가 무대를 오프스크린 캔버스로 합성(씬 배경 + 아바타 캔버스들 drawImage — preserveDrawingBuffer 이미 활성, ROOM-11 프로드 스모크서 실측) + WebAudio 로 원격/로컬 오디오 믹스 → `canvas.captureStream+MediaRecorder`(webm) → R2 presign 업로드.
- **ceiling(ponytail)**: 화질·프레임 = 호스트 기기 성능 의존, 호스트 이탈 시 녹화 중단, DOM 오버레이(채팅 등)는 미포함(무대만). 업그레이드 = Egress custom template(뷰어 라우트 + obs_viewer_tokens).

## 1. Outcome

- 호스트 ⏺ → 전원 동의 요청 → all_consented 시 녹화 시작 → 정지 시 R2 업로드 → `recordings` ready + `room_artifacts(source_type='recording')` → 방 멤버가 재생(presigned GET).
- 동의 거절 1인 이상이면 녹화 시작 불가(계약 §11.1.1).

## 2. Verification surface

- 통합테스트(.mjs, 로컬 스택): 비호스트 시작 403 · 동의 미완 시작 412 · 전원 동의 → 시작 200 · presign 업로드→complete→status ready + artifact 행 · 비멤버 재생 URL 403 · RLS(멤버 SELECT·비멤버 0).
- 프론트: check:all 그린 + 2탭 실렌더(호스트 시작→참가자 동의 모달→REC 배지→정지→목록 재생 버튼).
- 배포 게이트: 프로드 라이브 녹화 1건(실 webm 바이트 R2 실존 + 재생 URL 200).

## 3. Constraints (후퇴 금지)

- G1(docs 게이트 3종)·G2(스모크 대상 UI) green 유지. 기존 131 테스트 무회귀.
- consent_json 구조는 계약 §11.2 그대로(ip_hash 포함). 가짜 녹화 금지(RoomBottomBar 주석 성역).
- R2 키는 `isSafeObjectKey` 패턴(`recordings/<room>/<file>`), 시크릿 노출 금지.

## 4. Boundaries

- 허용: `supabase/migrations/`·`supabase/functions/`(신규 recording 5종)·`src/features/room|stage`·`src/lib`·i18n·RoomBottomBar·HostConsole.
- 금지: 기존 dub/vgen 파이프라인 변경, LiveKit 토큰 로직 변경(G2 name 주입 외), .env.

## 5. Iteration policy

- 페이즈: A 스키마(마이그+실측) → B Edge 5종(deno+통합) → C 클라 레코더(합성+믹스) → D UI 배선+실렌더 → E 배포+라이브 실측. 각 페이즈 게이트 green 후 다음.

## 6. Blocked stop condition

- 캔버스 합성이 헤드리스/실기기에서 프레임 0(WebGL drawImage 실패)으로 재현 불가할 때 → Egress custom template 로 전환 보고.
- 사후확인(post-consent)·철회·연장·트림은 defer(§11.1.2·11.5 — 운영 큐 필요), MVP 밖.

## 참조

- `docs/specs/security/consent-credits-quota.md §11` · `DATA-SCHEMA §1.11·§1.22` · `contracts/DubCompositor.md`(P1/P2 전례) · `contracts/DubRecorder.md`(MediaRecorder 패턴) · dub `record-consent` Edge(동의 재계산 패턴) · `_shared/r2.ts`(presign).
