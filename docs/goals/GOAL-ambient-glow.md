# GOAL-ambient-glow — 원화 광원 연출 2종 (무대 불 일렁임 · 로비 구름 드리프트)

## 골 한 줄
무대 campfire 불 글로우 일렁임 + 로비 하늘 구름 드리프트가 CSS-only로 렌더 — verified by `npm run check:all` exit 0 + 실렌더 E2E 6어서션 + 스크린샷 2장, while preserving 가로등 8등 렌더·기존 스위트 green·원화 파일 무수정. details in docs/goals/GOAL-ambient-glow.md

## 0. 원칙 (2026-07-13 확정)
"새로 그리지 않고 원화의 빛을 움직인다" — 불씨 파티클 기각(fe236e3) 교훈. 원화 위 신규 요소를 그리지 않고, 글로우/블렌드로 원화에 이미 있는 광원(불·하늘)만 움직인다.

## 1. Outcome
- (무대) campfire 배경 선택 시 원화 불 위치 % 앵커에 글로우 일렁임 렌더: `.stage-fire` ≥1개이며 **백드롭 div의 자식**(켄 번스 `stage-pan`과 동승 — 형제 배치 금지), 타 배경 선택 시 0개. reduced-motion = 글로우 유지·플리커만 정지.
- (로비) 광장 하늘 영역에 구름 드리프트 밴드 렌더: `.hub-cloud` ≥1개, computed animationName에 드리프트 키프레임 적용, hub-cam 자식(호버 푸시·탈채와 자연 합성). reduced-motion = 요소 유지·애니 정지.
- 기존 연출 무회귀: 로비 `.hub-lamp` 8개 렌더 유지.

## 2. Verification surface
- 명령: `npm run check:all` → exit 0 (tsc·lint·test·build·docs:check·drift·links)
- 실렌더 E2E(도구 중립 — vite dev + `npm i playwright-core --no-save --no-package-lock`, 검증 후 제거; 기존 로그인/방 입장 하네스 재사용):
  1. 로비: `.hub-cloud` ≥1 · animationName ≠ none
  2. 로비 reduced-motion 컨텍스트: `.hub-cloud` 유지 · animationName = none
  3. 로비: `.hub-lamp` = 8 (무회귀)
  4. 방(campfire 배경): `.stage-fire` ≥1 · 부모 = backgroundImage 백드롭 div
  5. 방(타 배경 전환): `.stage-fire` = 0
  6. 방 reduced-motion: `.stage-fire` 유지 · 플리커 애니 정지
- 아티팩트: 스크린샷 2장(lobby-cloud.png · stage-fire.png) — 골 밖 취향 게이트 입력자료
- 좌표 캘리브는 실렌더 스크린샷 육안으로만 확정(추측 좌표 금지 — 검증 성역)

## 3. Constraints (후퇴 금지)
- 기존 게이트 전체 green 유지. 원화(webp) 무수정 — CSS·TS 데이터만, 신규 자산·의존성·비용 $0.
- `GlowMotes.tsx` 무변경(불씨 원복 상태 5d5ef6f 유지).
- reduced-motion 관례: 요소는 유지·움직임만 정지(가로등 eafdf25 전례).
- 커밋은 명시 파일 목록만(병행 세션 스윕 방지) + 커밋 전 번들 시크릿 감사 CLEAN.

## 4. Boundaries
- 허용: `src/lib/stageBackgrounds.ts`(fireGlow 앵커 필드) · `src/features/stage/Stage.tsx` · `src/scenes/manifest.ts`(sky 밴드) · `src/components/shared/HubMap.tsx` · `src/index.css` · `docs/GAP-MATRIX.md` 진행 로그 · scratch 캘리브/E2E 스크립트
- 금지: Edge 함수·마이그레이션·stores·로케일(신규 문구 없음 — aria-hidden 장식)·`.env`·배포(bepo 별도 승인)·GOAL-LADDER(이 골은 8골 사다리 밖 사이드 골)

## 5. Iteration policy
- 각 패스: 캘리브(하네스 스크린샷 육안) → 구현 → `check:all` → E2E 6어서션 → 스크린샷 육안 → 실패 항목만 최소 변경으로 재시도.
- 무진전 3패스 = blocked 판정.

## 6. Blocked stop condition
- 백드롭 자식 배치로도 켄 번스 스케일과 글로우 위치가 어긋남(backgroundImage cover 크기 계산 불일치)이 3패스 내 해소 불가.
- E2E 하네스가 인프라 사유(로컬 supabase·LiveKit)로 3회 연속 실패.
- 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실 4분류.

## 7. 실행 기록 (실행 에이전트가 기록)
- 2026-07-13 Claude Code(Fable 5) — 패스 1 완료: 캘리브 fire-calib 2회(코어 48.8/68.5/r9 · 웅덩이 49.2/76.5/r16)·cloud-calib(밴드 2~26%, **screen 델타≈0 실측 → multiply 그늘로 전환**, 프로드 강도 픽셀 diff 피크 45로 정량). `npm run check:all` exit 0. 실렌더 E2E 7/7 PASS(①②③④⑤⑥ 전 어서션 + 플리커 위상 분리 보너스). 스크린샷 lobby-cloud.png·stage-fire.png 산출·에이전트 육안 통과. 판정: **골 내 자동 증거 전부 충족 — 골 밖 게이트(주인님 취향·/bepo)만 잔여.**
- 2026-07-13 Claude Code(Fable 5) — bepo 마감: 커밋 92f6199 → CF Pages 배포(`index-DferzErF.js` 별칭 서빙 실측·시크릿 감사 0히트·curl 3종 200). **배포판 E2E 7/7 PASS**(동일 스크립트 BASE 재조준·프로드 키프레임명 보존 확인) + 프로드 스크린샷 육안. 잔여: 주인님 취향 판정(라이브 하늘 20~30초 관찰 권장).

## 골 밖 게이트 (자동 증거로 판정 불가)
- 주인님 취향 판정: 스크린샷/실사용으로 "가짜같지 않음" 확인(불씨 전례) → 승인 시 /bepo 배포.

## 참조 문서
- `docs/GAP-MATRIX.md` 진행 로그 2026-07-13 — 연출 원칙·가로등 전례(eafdf25)
- 부품: `src/index.css:55-59` campfire-flick 리듬 · `:89-104` .hub-lamp/lamp-breathe · `src/scenes/manifest.ts` PlazaLamp % 앵커 패턴
