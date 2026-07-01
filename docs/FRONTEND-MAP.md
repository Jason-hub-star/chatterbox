---
tags: [guide]
---

# Frontend Map — snack-web

> 프론트엔드의 **기술 스택 · 기능(섹션) · 어디서 무엇을 바꾸나(SSOT) · 교체 레시피**를 한눈에.
> 목적: 다음에도 빠르게 **스캔**하고, 기술/기능을 쉽게 **검색·교체**.
> 최종 갱신: 2026-06-23 · 라이브: https://snack-web-khaki.vercel.app

---

## 1. 기술 스택 (패키지 → 역할 → 교체 후보)

| 패키지 | 버전 | 역할 | 교체 후보(swap) |
|---|---|---|---|
| **next** | ^14.2 | App Router 프레임워크·빌드·라우팅 | Remix / Astro (대공사) |
| **react / react-dom** | ^18.3 | UI 런타임 | (고정) |
| **framer-motion** | ^11.15 | **모든 애니메이션** — 스크롤 연동·스프링·layout 모프·pin | motion(v12)·react-spring·GSAP |
| **lottie-react** | ^2.4 | 벡터 Lottie 재생 (`featurePulse`) | @lottiefiles/dotlottie-react (스크롤 스크럽·.lottie) |
| **lucide-react** | ^0.468 | 아이콘 | react-icons·heroicons |
| **tailwindcss** | ^3.4 | 스타일링·디자인 토큰 | vanilla-extract·CSS Modules (대공사) |
| **class-variance-authority** | ^0.7 | 컴포넌트 variant 정의 (Button/Card/Section) | tailwind-variants |
| **clsx + tailwind-merge** | — | `cn()` className 병합 (`src/lib/utils.ts`) | (고정 권장) |
| devDeps | — | typescript ^5.7 · eslint(next) · postcss · autoprefixer | — |

**원칙**: 모션은 전부 framer-motion 한 곳. 색·타이포·모션 토큰은 SSOT(아래)로 통일 — 교체 시 토큰만 바꾸면 전파됨.

---

## 2. SSOT 지도 — *어디서 무엇을 바꾸나*

| 바꿀 것 | 파일 | 방법 |
|---|---|---|
| **텍스트(다국어)** | `src/content/content.ts`(타입) + `src/content/locales/{ko,ja,en}.ts` | 타입에 키 추가 → 3로케일에 값. 컴포넌트는 `useContent()`로 읽음 |
| **이미지·영상·Lottie** | `src/content/assets.ts` (`ASSETS`) | 슬롯에 `src` 채우면 `<AssetSlot>`이 자동 렌더(없으면 placeholder). video는 autoplay/loop/poster/reduced-motion 자동 |
| **모션 토큰**(이징·duration·스프링·variant·blink) | `src/lib/motion.ts` | `EASE.out`·`DURATION`·`SPRING.soft`·`VARIANTS`·`VARIANTS_BLINK` |
| **디자인 토큰**(색·타이포·radius·shadow·keyframe·marquee/blink 애니) | `tailwind.config.ts` | `theme.extend` |
| **전역 CSS·유틸**(`.transition-flecto*`·reduced-motion·pin 폴백) | `src/app/globals.css` | `@layer` |
| **className 병합** | `src/lib/utils.ts` (`cn`) | clsx+tailwind-merge |
| **언어 컨텍스트** | `src/content/LocaleProvider.tsx` (`useContent`) + `Header`의 `LanguageToggle` | KO/JA/EN |

---

## 3. 섹션 맵 (`src/app/page.tsx` 순서대로)

| # | 섹션 | 파일 | 역할 | 인터랙션·모션 | content 키 | 자산 |
|---|---|---|---|---|---|---|
| — | Header | `Header.tsx` | 상단 내비 + 언어토글 | sticky | `nav` | — |
| 1 | Hero | `Hero.tsx` + `hero-showreel/` | 히어로 | **핀 스크럽**(260vh) · 데스크탑 FloatingCard 패럴랙스 · 모바일 stats=JourneyItem | `hero` | `heroShowreel`(video) |
| 2 | LogoMarquee | `LogoMarquee.tsx` | 신뢰 로고 띠 | 가로 marquee 루프 | `logos` | — |
| 3 | Problem | `Problem.tsx` | 문제 제기 | JourneyItem 카드 | `problem` | — |
| 4 | HowItWorks | `HowItWorks.tsx` + `live-flow/` | 작동 원리(스텝) | **핀 스크럽** → step 하이라이트(`useScrollStep`) · 모바일=Stagger | `how`,`liveFlow` | — |
| 5 | **PipelineFlow** | `PipelineFlow.tsx` + `rig-flow/` | 파이프라인 네트워크 애니(**코드, 영상 아님**) | 자동 루프 SVG(커넥터 draw + 노드 스프링 팝) · blink | `flowGraph`(노드 라벨 i18n) | — |
| 6 | **RealDemo** | `RealDemo.tsx` | 루비 라이브 데모 영상 | autoplay muted loop · LIVE blink · JourneyItem | `realDemo` | `rubyDemo`(video) |
| 7 | Features | `Features.tsx` | 핵심 특징 | **에디토리얼 카드**(모노 인덱스·헤어라인·아이콘 없음·호버 룰) · JourneyItem | `features` | — |
| 8 | ShowcaseTabs | `showcase/` + `avatar-studio/` + `stream-panel/` | 크리에이터/시청자 듀얼 데모 | **탭**(layoutId 모프) · Studio 토글 · Stream blink | `showcase`,`studio`,`stream` | — |
| 9 | Comparison | `Comparison.tsx` | 경쟁 대비표 | JourneyItem 패널 | `comparison` | — |
| 10 | UseCases | `UseCases.tsx` | 활용 사례 | **카드 클릭→상세 모프**(layoutId+SPRING) · Esc/백드롭 닫기 | `useCases` | — |
| 11 | Testimonials | `Testimonials.tsx` | 후기 | JourneyItem 카드 | `testimonials` | — |
| 12 | Pricing | `Pricing.tsx` | 요금 | 월/년 **토글**(layout 스프링) · 가격 popLayout · JourneyItem | `pricing` | — |
| 13 | BackedBy | `BackedBy.tsx` | 투자/파트너 | JourneyItem | `backedBy` | — |
| 14 | FinalCTA | `FinalCTA.tsx` | 마지막 CTA | JourneyItem | `finalCta` | — |
| 15 | FAQ | `FAQ.tsx` | FAQ(하단 강등) | 아코디언(grid-rows) | `faq` | — |
| — | Footer | `Footer.tsx` | 푸터 | — | `footer` | — |

별도 라우트: `/preview` = PipelineFlow(RigFlowGraph) 단독 미리보기.

---

## 4. UI 프리미티브 (`src/components/ui/`)

| 파일 | 역할 |
|---|---|
| `Button.tsx` | CTA 버튼/링크(cva variant·pill·flecto 호버) |
| `Card.tsx` | 카드(cva: default/featured/soft/ghost) |
| `Badge.tsx` | 배지(accent/muted/dark) |
| `Section.tsx` / `SectionHeader.tsx` | 섹션 래퍼(bg variant) / 헤더(eyebrow·title·subtitle·dark) |
| `AssetSlot.tsx` | 미디어 슬롯 — `ASSETS` 정의로 image/video/lottie/placeholder 자동 분기 |
| `LottiePlayer.tsx` | Lottie 재생 |
| `CountUp.tsx` | 숫자 카운트업 |
| **모션 프리미티브** | `JourneyItem`(스크롤 연동 rise+scale+opacity·대부분 카드) · `ScrollSpine`(좌측 진행 레일) · `Parallax`(y 드리프트) · `Reveal`(in-view 1회 페이드) · `Stagger`(순차 등장) |

---

## 5. 모션·인터랙션 카탈로그 (검색용)

| 효과 | 구현 | 쓰는 곳 |
|---|---|---|
| 스크롤 연동 카드 등장 | `JourneyItem` (useScroll → y/scale/opacity) | Problem·Features·Comparison·Pricing·BackedBy·FinalCTA·Hero(모바일) |
| 핀 스크럽(고정 후 스크롤 연동) | 260vh `pin-track`+sticky `pin-stage` | Hero·HowItWorks |
| layout 모프(카드→상세/탭) | framer `layoutId` + `SPRING.soft` | UseCases(클릭 모프)·ShowcaseTabs(탭)·Pricing(토글) |
| 노드 그래프 자동 애니 | `rig-flow/RigFlowGraph` (rAF 루프 + pathLength draw) | PipelineFlow·/preview |
| LIVE 점멸 | `animate-blink`(tailwind) / `VARIANTS_BLINK`(motion.ts) | RealDemo·LiveFlowLoop·StreamPanel·StudioPreview |
| 가로 마키 | tailwind `animation: marquee` | LogoMarquee |
| 전역 진행 레일 | `ScrollSpine`(장식, pointer-events-none) | 페이지 전역 |
| reduced-motion 폴백 | `useReducedMotion()` + globals.css | 전 컴포넌트(무모션·정적) |

---

## 6. 자주 하는 변경 레시피 (swap cheatsheet)

- **문구 바꾸기** → `locales/{ko,ja,en}.ts`의 해당 키. (타입 변경 시 `content.ts`도)
- **이미지/영상 교체** → `assets.ts` 슬롯의 `src`(+`poster`). 컴포넌트 무수정.
- **아바타/캐릭터 교체** → 영상은 `public/demo/`, 정지는 `public/avatars/` 넣고 `assets.ts` 연결.
- **섹션 추가/삭제/순서** → `src/app/page.tsx`의 import + JSX 순서만.
- **색·폰트·radius·그림자** → `tailwind.config.ts theme.extend`.
- **모션 느낌(스프링 말랑/속도)** → `motion.ts`의 `SPRING.soft`·`DURATION`·`EASE`. (전 모프/등장에 전파)
- **아이콘 라이브러리 교체** → `lucide-react` import를 react-icons 등으로(컴포넌트별 import 지점만).
- **Lottie 업그레이드(스크롤 스크럽)** → `@lottiefiles/dotlottie-react` 설치 후 `LottiePlayer`/`AssetSlot` 분기 추가.
- **카드 룩 변경** → 섹션별 카드 마크업(에디토리얼=`Features.tsx` 참고) 또는 `Card.tsx` variant.

---

## 7. 재스캔 (이 문서 갱신용)

```bash
cd snack-web
# 패키지
python3 -c "import json;d=json.load(open('package.json'));[print(k,v) for k,v in {**d['dependencies'],**d['devDependencies']}.items()]"
# 섹션·프리미티브·lib
ls src/components/sections src/components/ui src/lib
# content 키
grep -oE '^  [a-zA-Z]+: \{' src/content/content.ts | tr -d ' :{'
# 페이지 섹션 순서
grep -oE '<[A-Z][A-Za-z]+ />' src/app/page.tsx
# 모션 검색
grep -rn 'layoutId\|JourneyItem\|animate-blink\|pin-track\|useScroll' src --include='*.tsx'
```

타입체크: `./node_modules/.bin/tsc --noEmit` (dev 켜둔 채 `npm run build` 금지 — `.next` 충돌).

---

## 8. 배포

```bash
vercel --prod --yes   # Vercel 클라우드 빌드(로컬 .next 무영향), 프로젝트=snack-web
```
공개 라이브 = **https://snack-web-khaki.vercel.app** (배포별 URL은 보호됨). 상세: [[DEPLOY]].
