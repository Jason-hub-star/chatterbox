---
tags: [guide]
---

# Interaction & Asset-Slot Plan — flecto 인터랙션 강화 + 실사 자산 슬롯

작성: 2026-06-20 · 상태: **✅ 실행 완료 (phase-loop, 2026-06-20)** · FLECTO-80 후속
> 구현 요약: P1 자산 슬롯(`assets.ts`+`AssetSlot`)+아카네 투입 / P2 pinned ScrollScrub(데스크탑)+모바일 in-view(`hero-flow/` 폴더 분리) / P3 아카네 커서 tilt+멀티레이어 패럴랙스(count-up은 실수치 stat 확정 시로 보류) / P4 `lottie-react`+`LottiePlayer`(ssr:false)+직접제작 펄스 Lottie→Features. 최종 빌드 148kB. 상세는 [[PROJECT-STATUS]].

## 배경 (주인님 결정 2026-06-20)

- 제품 개발이 덜 끝나 **실사 자산 대량 투입은 이름** → **placeholder 슬롯 구조**로 세팅해 자산 완성 시 **경로만 채우면 즉시 투입**되게 한다.
- **단, 최신 파이프라인 결과물 "아카네 아바타"(character-008)는 사용 가능** → 지금 투입.
  - 원본: `Vtube/experiments/autorig-character-008/master_640.png` (RGB 640², 흰 배경 → 카드 프레임에 넣어 사용)
- **인터랙션 강화**가 이번 주 목표. flecto식 **scroll-scrub**(스크롤=타임라인 재생헤드)로 "트리 펼침" 순차 애니메이션 등 유니크 요소 추가.
- **Lottie 적극 도입** (스킬 `diffusionstudio/lottie` 생성 + `lottie-react` 렌더, ssr:false).

## flecto "스크롤 시 순차 펼침"의 원리 = scroll-driven animation

영상 아님. ① 섹션 스크롤 진행도를 0~1로(`useScroll`/`scrollYProgress`) → ② SVG `pathLength`·transform·opacity를 그 값에 묶음 → ③ 각 요소에 **진행 구간을 stagger**(가지1 0~0.3, 가지2 0.3~0.6…) → 스크롤 내릴수록 위→아래 순차 개화. 되감으면 역재생. 우리 `HeroFlow` draw-on을 *시간* 대신 *스크롤*에 묶으면 동일.

## 자산 슬롯 아키텍처 (핵심)

- `src/content/assets.ts` — 자산 매니페스트 SSOT. 각 슬롯: `{ src?: string; type: "image"|"video"|"lottie"; placeholder: string; alt: string }`. `src` 있으면 실사, 없으면 placeholder.
- `<AssetSlot>` 프리미티브 — `src` 유무로 `<img>`/`<video>`/Lottie vs placeholder 박스 자동 분기. **컴포넌트 수정 없이 `assets.ts` 경로만 채우면 자산 라이브.**
- `public/avatars/akane.png` (지금 투입) · `public/demo/`·`public/motion/` (자산 완성 시 채울 슬롯).
- 텍스트는 `content.ts`, 자산은 `assets.ts` — 둘 다 SSOT, 컴포넌트 하드코딩 금지.

---

## Phase 1 — 자산 슬롯 아키텍처 + 아카네 투입 (★★★)

- `assets.ts` 매니페스트 + `<AssetSlot>` 컴포넌트(src→실사 / 없으면 placeholder, reduced-motion 시 video autoplay 정지).
- 아카네 `master_640.png` → `public/avatars/akane.png` 복사. 히어로 데모 자리 + HeroFlow 라이브(3) 단계 글리프를 아카네 실사 카드로 교체.
- 데모 영상(`hero.demo`)·모션 GIF(`features.motion`)는 slot만, placeholder 유지.
- **게이트**: 아카네가 카드 프레임에 자연스럽게 렌더 · placeholder 슬롯은 빈 자산에도 깨지지 않음 · 빌드/타입 그린.

## Phase 2 — ScrollScrub HeroFlow (트리 펼침, 유니크 ★★★)

- `HeroFlow` 연결선 `pathLength` + 단계 카드 opacity/scale을 `useScroll`(컨테이너 진행도)에 바인딩, 단계별 구간 stagger → 스크롤 내릴수록 좌→우(또는 위→아래) 순차 개화.
- `useReducedMotion` 시 전부 펼친 정적 상태.
- **게이트**: 스크롤 따라 순차 draw-on · 되감기 역재생 · reduced-motion 정지 · 모바일 동작.

## Phase 3 — flecto 마이크로인터랙션 (★★)

- **KPI count-up**: 히어로/지표 숫자가 inView 시 0→목표값 카운트업(`useInView`+`animate`), reduced-motion 시 즉시 최종값.
- **nav 언더라인 슬라이드**: 헤더 nav 링크 호버 시 언더라인 좌→우 슬라이드(추출 links(52) hover 기록).
- **멀티레이어 패럴랙스**: 히어로 배경/글로우/플로팅 카드가 서로 다른 속도로(깊이감).
- **게이트**: 각 인터랙션 작동 · reduced-motion 존중 · 색·모션 토큰 무회귀.

## Phase 4 — Lottie 적극 도입 (★★)

- `lottie-react` 설치 + `LottiePlayer.tsx`(`dynamic ssr:false`, reduced-motion 시 정지/첫프레임). JSON은 `public/lottie/`.
- `diffusionstudio/lottie` 스킬로 기능 섹션 아이콘 애니(filling-line, 스프링그린/딥그린 토큰 명시) 생성 → Features 아이콘 칩에 적용. 폴백: 기존 lucide SVG.
- **게이트**: Lottie 렌더·번들 증가 점검·폴백 동작·reduced-motion 정지.

---

## 검증 게이트 (공통)

- 빌드/타입: Phase 중 `npx tsc --noEmit`(dev `.next` 무손상), 최종 `npm run build`(dev 끄고). `dev-build-next-conflict`
- 시각: agent-browser 데스크탑+모바일, flecto 스크린샷 대조.
- 불변식: 텍스트=`content.ts` · 자산=`assets.ts` · 토큰=`DESIGN-TOKENS.md` 먼저 · reduced-motion 존중 · 색·모션 토큰 무회귀.
