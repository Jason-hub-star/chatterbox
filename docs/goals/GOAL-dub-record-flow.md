# GOAL-dub-record-flow — 더빙 녹음 흐름 통제권 회복 (사다리 W)

## 골 한 줄
더빙 녹음이 첫 진입 로드 자가복구·완성 동선 단축(자동 다음+일괄 확정)·녹음 통제(카운트다운·구간 루프)를 갖춰 "끝까지 완주"가 지치지 않는 상태 — verified by `npm run check:all` + phase 별 실렌더(프로드 시딩·DB 실측), while preserving Edge 계약 무변경·기녹음 보존·비더빙 무대 무회귀. details in docs/goals/GOAL-dub-record-flow.md

## 배경 (2026-07-20 프로드 실 워크스루)
주인님 실사용 3피드백: ①방 진입 영상 무한 스피너(P1) ②49세그 반복 피로 ③녹음 중 영상이 통제 없이 흘러감. 근본은 "녹음 흐름의 통제권 부재"(로드 재시도 없음·완성 동선 수동·프리롤/루프 없음). 셋 다 프론트 전용(Edge/마이그 0).

## 1. Outcome / 5. Phases (이진·검증 명령)
| # | 항목 | Outcome(완료 시 참) | 검증 |
|---|---|---|---|
| W0 | 문서화 | §0 3항목 등재 + 브리프 + 사다리 W 표 | docs:check·links 0 |
| W1 | DUB-VIDEO-STALL(P1) | `<video>` 스톨 워치독 — loadstart 후 N초 내 loadedmetadata 없으면 `.load()` 1~2회 자동 재시도(+onError/onStalled 핸들). 첫 진입 검은 화면 자가복구 | check:all + 실렌더(src 지연/에러 주입 → .load() 재호출·readyState 회복 관찰) |
| W2 | DUB-COMPLETE-FLOW(High) | 제출→다음 내 차례 세그 자동 선택+녹음 대기(Space=녹음/중지·Enter=제출) + 호스트 "전부 확정"(기존 confirmDubTrack 클라 루프) + 솔로 제출=확정 자동 | check:all + 실렌더(제출→다음 세그 자동 포커스·일괄 확정 DB synced·솔로 자동확정 1/N↑) |
| W3 | DUB-RECORD-CONTROL(Med~High) | 구간 진입 카운트다운(3‑2‑1) + 구간 루프 재생 토글 + (옵션)구간 끝 녹음 자동중지 | check:all + 실렌더(카운트다운 후 재생 시작·루프 토글 시 구간 반복·자동중지 시 preview 진입) |
| W4 | 실증·마감 | 통합 실렌더(로드복구·완성동선·녹음통제) + 비더빙 무회귀 + §0 [x]+probe·사다리 DONE·GAP·AGENT-OPS | check:all + 통합 실렌더 |

## 2. Verification surface
`npm run check:all`(165+α) · phase 별 실렌더 하네스(프로드 시딩·무과금 — `dub-u-spot.mjs`/`dub-u4-spot.mjs` 골격 재사용·DUB 탭 관례) · W4 통합. W1 은 stall 재현이 불안정하니 워치독 로직 유닛 + 실렌더 `.load()` 호출 관찰로 대체.

## 3. Constraints (후퇴 금지)
Edge/서버 계약 무변경(프론트 전용·마이그 0) · 기녹음 보존·제출/확정 게이트 무약화 · 사다리 U/F 검증 표면 green 유지(recEngine·HUD·상태 시각화·레일) · 비더빙 무대 무회귀 · i18n 3국어 · 360px · check:all 그린.

## 4. Boundaries
허용: src/features/{dub,stage}/ · stores/dubStore · lib/dub(confirm 루프 헬퍼) · i18n · docs · 실렌더 스크래치. 금지: supabase/functions(무수정) · 마이그 · 새 의존성. 범위 밖: 연속 녹음 원테이크 모드·STT 짧은 세그 병합(대설계·후속 골)·배속 슬라이더(옵션 defer).

## 6. Blocked stop condition
W1 워치독이 정상 로드를 오탐해 재생 끊김 유발 반복 → blocked·정본 설계 질문. W2 자동 다음이 recEngine 가드와 충돌 반복 → blocked. 무진전 3패스 → blocked(재현/근사/막힘/불확실 4분류).

## 7. 실행 기록
- 2026-07-20 Fable — 실 워크스루 3발견 등재·사다리 조립·플랜모드 승인(W3=A안 카운트다운+루프).
- 2026-07-20 Fable — W1 완료: MainView `<video>` 스톨 워치독(loadstart→4s 무메타→`.load()` 재시도·MAX_RETRY 2·onError/onStalled 합류·loadedmetadata 시 해제·소스당 카운터 리셋)+DEV 훅 `__dubStallRetries`. 실렌더 4/4(`dub-w1-spot.mjs` — 정상 재시도 0·에러 주입 cap 2·cap 후 무한재시도 없음·정상 src 복원 회복). 타이머 경로는 동일 retryVideoLoad(복구는 W1d로 실증). check:all 0.
- 2026-07-20 Fable — W2 완료: DubRecorder submit 에 ①솔로 자동확정(모든 트랙 내 것이면 제출 직후 confirmDubTrack — 확정 단계 생략) ②자동 다음 이동(다음 미제출 내 세그로 setSeekRequest) + confirmAll(호스트 일괄 확정·submitted>1 시 [전부 확정] 버튼·기존 Edge 루프·새 Edge 0) + 키보드(녹음 중 Space=중지·프리뷰 Space/Enter=제출·입력 포커스 가드·시작은 defer). i18n confirmAll ×3. 실렌더 4/4(`dub-w2-spot.mjs` — Space→프리뷰·Enter 제출·솔로 seg1 synced·자동시크 8.51s·[전부 확정] seg2/3 synced). check:all 0.
- 2026-07-20 Fable — W3 완료(A안): startRec 에 마이크 선획득→구간 시작 프레임 정지(localMode preroll)→3‑2‑1 카운트다운(recCountdown·450ms×3)→재생+녹음. 구간 루프(recLoop 기본 ON — onTimeUpdate 구간 끝서 startMs 되돌림, OFF 면 기존 정지) + 센터 카운트다운 오버레이 + 녹음 HUD 🔁 토글. dubStore recCountdown/recLoop/setRecLoop·DubLocalMode.preroll. i18n loopHint/countdownLabel ×3. 스트림 교체 취소 가드(카운트다운 중 재시작). 실렌더 3/3(`dub-w3-spot.mjs` — 카운트다운+preroll 정지→녹음·루프 ON 미정지·🔁 OFF 구간끝 정지). check:all 0.
- 2026-07-20 Fable — W5 후속(주인님 관측 "영상 정지해도 백그라운드 재생"): `playDubPreview` Web Audio 가 영상 pause 무시하는 선재 버그(U 배포판 포함) — `DubPreviewHandle.pause/resume`(ctx.suspend/resume) 추가 + MainView 미리보기·시사회 effect 가 video pause/play 배선. 실렌더 3/3(`dub-w5-spot.mjs` — ctx running→suspended→running·DEV 훅 `__dubPreviewCtx`). check:all 0.
- 2026-07-20 Fable — **W4 실증·마감·골 종결**. 교차 검증: W2 하네스가 이미 카운트다운(W3)+솔로 자동확정(W2)+자동 다음 이동(W2)을 한 흐름에서 태워 4/4 → 상호작용 회귀 0. F 사다리 무회귀 10/10(`dub-f-spot.mjs` — F2 시크 어서션 1차 플레이크 t=15.26 → 재실행 t=8.76 10/10, 재생 중 폴링 타이밍). 비더빙 무대: video 스톨 워치독·onTimeUpdate 루프·localMode preroll 전부 `isDub` 게이트라 vgen 무영향(구성상). check:all 0(전 phase). §0 3항목 [x]+probe·사다리 W DONE·GAP-MATRIX·AGENT-OPS. 주의: 솔로 자동확정(W2)로 U2/U4 스크래치 하네스의 "제출→submitted 상태" 어서션은 superseded(제품 의도 변경·회귀 아님). 배포는 골 밖(`/배포`: CF Pages 프론트 전용·Edge 0).
