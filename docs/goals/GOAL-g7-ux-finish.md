# GOAL-g7-ux-finish — U-연출 마감 (네온 On Air 입장 연출 + 공유재생 배속 동기 + 대극장 아트)

## 골 한 줄
입장 게이트 네온 "On Air"(red→green) 연출 + 호스트 동기 배속 3단 + 대극장 원화 후보 생성이 완료 — verified by `npm run check:all` green + 2탭 rate 동기 E2E + 360px 실렌더, while preserving G1~G6 검증 표면 green. details in docs/goals/GOAL-g7-ux-finish.md

## 0. 확정 사항 (주인님 판정 2026-07-13)
- U-6 방향: **네온사인**(시안 B 채택) — 텍스트 **"On Air"**, 로딩 중 **빨강**(fire-hot 계열) 지지직 점등 → 입장 성공 순간 **초록**(spring-green) 전환.
- U-3 조작: 3단 버튼 1x/1.5x/2x(추천안 기본값 — 이의 없으면 유지).
- F-8: 원안대로 포함(scene-pipeline). 생성 원화 **채택은 골 밖 취향 판정**(골 내부는 후보 생성+실렌더까지).

## 1. Outcome
- **U-6**: `RoomJoinGate` joining 화면의 CampfireGlyph 가 네온 "On Air" 간판으로 교체 — 로딩 = 빨강 네온 지지직 점등(불규칙 스텝, 균일 사인파 금지), 입장 성공 = 초록 전환 연출(≤700ms) 후 방 진입. reduced-motion = 네온 점등 유지·지지직/전환 모션만 정지.
- **U-3**: 공유재생(VOD) 배속 1x/1.5x/2x — 호스트 조작 → 전원 동기. `VodSyncState.rate` 신설, 드리프트 보정식의 1x 가정 제거(`vodTargetMs` 경과항 ×rate), 비호스트 `video.playbackRate` 반영, 5s 하트비트로 늦은 입장자 수렴.
- **F-8**: 대극장 내부 원화(`theater.webp`) 후보 신규 생성(scene-pipeline 화풍 고정) + 실렌더 + 앵커(posterBoard·ticketBooth) 좌표 후보 캘리브. 채택·교체는 골 밖 판정.

## 2. Verification surface
- `npm run check:all` → exit 0 (tsc·lint·test·build·docs:check·docs:drift·docs:links).
- 실렌더 E2E(playwright-core 임시설치, 검증 후 제거):
  - 2탭 rate 동기: 호스트 rate 2x → 비호스트 `video.playbackRate === 2` + 드리프트 ≤ `VOD_DRIFT_TOLERANCE_MS`(200ms) 실측, rate 복귀 1x 확인.
  - joining 화면: 네온 요소 렌더 + animationName ≠ none, reduced-motion 컨텍스트에서 모션 정지·요소 유지, 입장 green 전환 후 방 진입.
  - 360px 실렌더(신규/변경 화면 DoD — 오버플로 0).
- 아티팩트: 스크린샷(joining 네온 red·green 전환 프레임·대극장 원화 후보) — 주인님 취향 판정 자료.

## 3. Constraints (후퇴 금지)
- G1~G6 검증 표면 green 유지: check:all·docs:links 0 broken·기존 테스트 무회귀(i18nCoverage 포함 — 신규 문구는 en/ja 완역).
- "On Air"는 장식 간판 텍스트(aria-hidden·영문) — UI 상태 문구(`room.joining` 등)는 i18n 유지.
- 기존 앰비언트 연출(hub-lamp 8·hub-cloud·stage-fire·GlowMotes) 무회귀.
- 백엔드 변경 0 (Edge/마이그 없음 — rate 는 기존 LiveKit relay `vod_sync` 페이로드 확장).
- 검증 성역 — 실측 없는 수치·"됐을 것" 주장 금지.

## 4. Boundaries
- 허용: `src/features/room/RoomJoinGate.tsx` · `src/components/shared/CampfireGlyph.tsx`(교체/대체) · `src/index.css` · `src/features/stage/vodSync.ts` · `src/features/stage/MainView.tsx` · `src/pages/RoomPage.tsx`(vod relay·게이트 phase) · i18n 로케일 3종 · `public/scenes/`(F-8 후보) · `src/scenes/manifest.ts`(F-8 채택 시 앵커) · docs(GAP-MATRIX·GOAL-LADDER·본 브리프).
- 금지: Edge functions·supabase 마이그 · stores 구조 변경 · 무관 연출/컴포넌트 · `.env`(grep 금지·awk만).
- 커밋: 명시 파일 목록만(병행 세션 스윕 방지). 배포(bepo)는 골 밖 별도 승인.

## 5. Iteration policy
- 페이즈루프: **A** U-6 네온(연출) → **B** U-3 배속(로직+2탭) → **C** F-8 아트(생성+캘리브). 각 페이즈 끝 게이트(check:all + 해당 E2E) 실행, 실패 항목만 최소 변경 재시도.
- 무진전 3패스 = blocked 판정.

## 6. Blocked stop condition
- LiveKit 2탭 하네스 재현 불가(3회) · scene-pipeline 생성 품질 미달 반복(3회) · vod 동기 ±200ms 미달성 반복.
- 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실 4분류.

## 7. 실행 기록 (실행 에이전트가 기록)
- 2026-07-13 Claude Code(Fable) — **패스 1 완주**: A 네온(NeonOnAir+entering 경유+i18n 3언어, campfire 삭제) → B rate(vodSync ×rate·MainView 3칩/ratechange 단일 발행/applier·relay 하위호환 검증·단위테스트) → C 후보(주인님 콜 2회: 과녁=무대 전용 대극장 확정+프롬프트 승인 — gpt-image-2 세이프티 오탐 400→gpt-image-1 66s, 계보 `~/Documents/채터박스/v2/theater_stage_v1.png`) → D 검증: `check:all` exit 0(테스트 138/138) · E2E **15/15 ×2연속**(방 2개 실측 — 네온 red 지지직/green 경유/reduce 정지·2탭 rate 2x→1x 왕복·드리프트 수렴 6/5ms·후보 배경 실렌더·360px 오버플로 0) · 번들 시크릿 감사 0·DEV 훅 프로드 부재 실측.
- 하네스 함정(신규 4): ①테스트 영상 5s 는 onEnded 자동 clear 로 대기 중 소멸 → 10분 저부하 H.264 ②헤드리스 SwiftShader 의 2x 소프트디코드 스톨이 외삽 드리프트를 오염 → 드리프트는 1x 수렴치로 측정 ③재연결 stale 메시지 과속 외삽 → **제품 가드 추가**(끝 강제시크 스킵 — MainView) ④room 진입 후 waitForFunction 불안정 → evaluate 폴링.
- 4분류: **재현됨** = §2 전 어서션. **근사됨** = "2x 유지 중 절대 드리프트 ≤200ms"는 헤드리스 디코드 한계로 rate 왕복 후 수렴 드리프트(6/5ms)+단위식(×rate)으로 대체 실증. **막힘** = 없음. **불확실** = 실기기 2x 장시간 드리프트(bepo 프로드 판정 때 확인 권장).
- 골 밖 잔여: F-8 후보 채택 취향 판정(채택 시 stageBackgrounds theater 항목 교체+webp 커밋) · bepo.

## 참조 문서
- `docs/goals/GOAL-LADDER.md` G7 행 · `docs/design/DESIGN-TOKENS.md`(fire-hot #ff4500·spring-green #56f09f) · `src/features/stage/vodSync.ts` 헤더 주석(±200ms AC) · 시안: scratchpad `u6-mockups.html`(판정 B)
