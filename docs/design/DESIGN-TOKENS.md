# Design Tokens (SSOT)

> 출처: `flecto.io/?ref=godly` 디자인 추출(designlang, 2026-06-20) → distill.
> 이 표가 **사람이 읽는 단일 진실 원천**입니다. `tailwind.config.ts` / `src/lib/motion.ts` 는 항상 이 표와 일치시키세요.
> 원본 추출물은 `design/flecto-reference/` (레퍼런스 전용, 코드에 직접 복제 금지).

flecto 무드 한 줄: **딥 포레스트 그린 + 따뜻한 크림 + 스프링 그린 액센트 → 차분·프리미엄·에디토리얼.**
(VTuber 제품의 발랄함은 색이 아니라 이미지·일러스트·액센트로 표현한다.)

---

## 1. Color

| 토큰 | Hex | 역할 | tailwind |
|---|---|---|---|
| `background` | `#FFFBEC` | 페이지 기본 배경 (따뜻한 크림) | `bg-background` |
| `foreground` | `#222222` | 본문 텍스트 (잉크) | `text-foreground` |
| `card` | `#FFFFFF` | 카드 표면 | `bg-card` |
| `card.foreground` | `#222222` | 카드 위 글자 | `text-card-foreground` |
| `primary` | `#004737` | 브랜드/딥 포레스트 그린 (CTA·헤딩) | `bg-primary` `text-primary` |
| `primary.600` | `#005F4A` | primary hover | `hover:bg-primary-600` |
| `primary.700` | `#003A2D` | primary 진하게 | — |
| `primary.deep` | `#032019` | 다크 섹션 배경 (거의 검정 그린) | `bg-primary-deep` |
| `primary.foreground` | `#FFFBEC` | 그린 위 글자 (크림) | `text-primary-foreground` |
| `accent` | `#56F09F` | 액션 하이라이트 (스프링 그린) | `bg-accent` |
| `accent.600` | `#2AAF71` | accent hover | `hover:bg-accent-600` |
| `accent.700` | `#1F8D59` | accent 더 진하게 (예비·현재 미사용) | — |
| `accent.foreground` | `#032019` | 액센트 위 글자 (짙은 그린) | `text-accent-foreground` |
| `mint` | `#D4FFE8` | 연한 민트 (배지·소프트 배경) | `bg-mint` |
| `cream.deep` | `#FAF2D5` | 살짝 진한 크림 (섹션 대비) | `bg-cream-deep` |
| `pop` | `#FFC900` | 포인트 노랑 (절제해서 사용) | `text-pop` |
| `muted` | `#F1EFE2` | 뉴트럴 표면 | `bg-muted` |
| `muted.foreground` | `#6B6B61` | 보조 텍스트 | `text-muted-foreground` |
| `border` | `#E6E2D2` | 경계선 (warm) | `border-border` |
| `destructive` | `#F52929` | 에러 | — |
| `success` | `#2AAF71` | 성공 | — |
| `ring` | `#004737` | 포커스 링 (예비·현재 미사용) | `ring-ring` |

**대비(WCAG) 안전 조합** — flecto 추출 검증값:
- `#032019` on `#FFFFFF` = 17.15:1 (AAA)
- `#D4FFE8` on `#004737` = 9.85:1 (AAA) → 다크 그린 위 민트 텍스트 OK
- `#004737` on `#FFC900` = 6.06:1 (AA)
- ⚠️ 피할 것: `#2AAF71` on 밝은 민트 배경(2.67:1 FAIL). 밝은 배경엔 `primary(#004737)` 사용.

---

## 2. Typography

| 용도 | 폰트 | 비고 |
|---|---|---|
| 본문 / JP | **Noto Sans JP** (400/500/700) | 가나·한자·라틴 커버. `--font-noto-jp` |
| 디스플레이 / 로고 | **Schibsted Grotesk** (400/500/700) | 기하 그로테스크 = flecto `aeonik` 결 근사. `--font-display` |

> flecto 원본은 유료 `aeonik`+`roobert`. 무료 대체로 위 2종 채택(추출 트리아지: 유료폰트는 버림).
> **디스플레이 weight = 400 경량이 기본**(flecto 추출 weight 400 dominant 3286× vs 500 10×). 강조/호버에만 500. 700은 로고 워드마크 등 예외용.

**헤딩 스케일** (flecto: 크게 + 타이트한 음수 자간 + **weight 400 경량**):

| 토큰 | size / line-height / letter-spacing / weight | tailwind |
|---|---|---|
| display-2xl | 5.5rem / 1.02 / -0.03em / **400** | `text-display-2xl` |
| display-xl | 4.5rem / 1.04 / -0.03em / **400** | `text-display-xl` |
| display-lg | 3.75rem / 1.06 / -0.03em / **400** | `text-display-lg` |
| display-md | 2.875rem / 1.1 / -0.02em / **400** | `text-display-md` |
| display-sm | 2rem / 1.18 / -0.015em / **400** | `text-display-sm` |
| kpi (숫자 강조) | 3.25rem / 1.02 / -0.02em / **500** | `text-kpi` |

루트 폰트: **18px** (모바일 ≤768px = 16px). 본문 line-height 1.7. 헤딩은 sentence case·weight 400.

---

## 3. Spacing & Layout

- 컨테이너 max-width: **1280px** (`max-w-container`).
- 섹션 패딩: 모바일 `py-20 px-5` → 데스크탑 `lg:py-32 lg:px-12` (`.section-padding`).
- flecto는 넉넉한 여백 리듬(60–110px) + 3컬럼 우세. 그리드 기본 `gap-6`.
- 베이스 스페이싱은 tailwind 기본(4px 스텝) 사용.

---

## 4. Radius

| 토큰 | 값 | 용도 |
|---|---|---|
| `rounded-full` | 9999px | 버튼·배지 (flecto 시그니처 = pill) |
| `rounded-card` | 1rem (16px) | 소형 칩 |
| `rounded-card-lg` | 1.5rem (24px) | **카드 기본**(`Card`) ·CTA 블록 |
| `rounded-panel` | 2.5rem (40px) | **히어로/섹션 플로팅 패널** (flecto 시그니처 — 크림 위에 떠 있는 라운드 패널). `Section panel` variant · Comparison/FinalCTA 블록 |

---

## 5. Shadow (soft, 그린 틴트)

| 토큰 | 값 |
|---|---|
| `shadow-card` | `0 1px 2px rgba(0,71,55,0.04)` |
| `shadow-card-hover` | `0 18px 36px rgba(1,44,34,0.08)` |
| `shadow-cta` | `0 1px 2px rgba(0,71,55,0.10)` |
| `shadow-glow` | `0 18px 28px rgba(15,194,101,0.18)` (액센트 버튼) |

---

## 6. Motion & Interaction (`src/lib/motion.ts`)

flecto `motion.framer.js` / `motion-tokens.json` / `motion.css` 를 **그대로 이식**(distill 아님).
원본: `flecto-reference/flecto-io-motion.framer.js` · `…-motion.css`.

**토큰 (motion.ts)**

| 토큰 | 값 | 비고 |
|---|---|---|
| EASE.out | `cubic-bezier(0.19, 1, 0.22, 1)` | 라이브 페이지 55회 — 시그니처 |
| DURATION.sm/md/lg | 0.2 / 0.3 / 0.5s | 추출 duration |
| SPRING.soft | stiffness 320 · damping 30 · mass 1 | 추출 spring |
| TRANSITION.base/fast/slow | 0.5 / 0.25 / 0.9s easeOut | 추출 transitions |
| VARIANTS | fade · slideUp(y16) · scaleIn(0.96) · pop(0.9→1) | 추출 variants |
| stagger | staggerChildren **0.125** | 추출값 |
| IN_VIEW | once · amount 0.3 | 추출 inView |

Tailwind 토큰(tailwind.config.ts): `ease-flecto` · `duration-sm/md/lg` · `animate-{fade-in,slide-up,scale-in,pop,marquee}` · `bg-grad-overlay`.

**반영된 인터랙션 (추출 → 컴포넌트)**

| 추출 신호 | 구현 위치 |
|---|---|
| scrollLinked: true (스크롤 연동) | `Parallax` (Hero 프리뷰 useScroll/useTransform) |
| variants pop / spring | Hero 지표 · HowItWorks 스텝 (`Stagger`+pop) |
| stagger 0.125 | 카드 그리드 전반 (`Stagger`/`StaggerItem`) |
| transition transform/color 0.3~0.5s easeOut (hover) | `Button` lift+press · `Card` hover lift · 아이콘 칩 |
| switches(129)·tabs(12) | **Pricing 월/년 토글 스위치** (pill+spring knob, 가격 교체 애니메이션) |
| links(52) hover | 헤더 nav 언더라인 슬라이드 · 푸터 링크 컬러 |
| sticky main-header | `Header` 스크롤 elevation(그림자/높이 축소) |
| keyframes pop(0.9→1.03→1) | `animate-pop` (CSS) |
| marquee 무한 루프 (로고 스트립) | `LogoMarquee` (`animate-marquee` 28s linear, BackedBy 로고월. reduced-motion 시 globals.css 정지) |
| gradient grad-1 (사진 오버레이) | `bg-grad-overlay` 유틸 |
| 히어로 scroll-scrub 영상(scroll=재생헤드) | **`HeroShowreel`**(실물 빌드 영상 `public/showreel/`, 데스크탑 스크럽·모바일 루프·reduce 포스터). 구 `HeroFlow` SVG 대체·제거 |
| keyframes avatar-sway / blink-dot / talk-bar | **AvatarStudio** 미리보기(髪 sway · まばたき · リップシンク 시연, accent #56F09F만) |
| scroll-scrub 자동 루프 · 가짜 채팅 순환 · inView 카운트업 | **LiveFlowLoop** · **StreamPanel** · **`CountUp`** (전부 `useReducedMotion` 최종 정적/즉시값) |

- 모든 진입은 `Reveal`/`Stagger`(`whileInView`, once)로 통일. `prefers-reduced-motion` 존중(globals.css + Parallax 비활성).

---

## 8. 플랫폼 토큰 (새 플랫폼 전용)

> 랜딩(§1~§7 flecto 기반)과 별도. 버튜버 연극 룸 UI에만 적용.
> **2026-07-01 개정**: 배경을 무채색(디스코드풍 그레이/블랙) 베이스로 전환. 앰버는 브랜드
> 액센트로 유지하되 배경 앰비언트 글로우가 아니라 **버튼·호스트 표시·CTA에만 절제해서 사용**.
> 컨셉: 마비노기 모닥불 정체성은 액센트 색(`fire-amber`)과 씬 시스템(§4.3 scene-accent)에 남기고,
> 룸 UI 크롬 자체는 중립 다크로 이동 — 컬러 팩(씬+액센트 세트) 구매 시스템의 기본값.
> Source: ../DESIGN-DIRECTION.md §2

| 토큰 | Hex | 역할 |
|---|---|---|
| `stage-base` | `#0B0B0D` | 룸 기본 배경 (중립 니어블랙) |
| `stage-panel` | `#18181C` | 카드·사이드바 배경 |
| `stage-elevated` | `#222227` | 모달·호버·플로팅 요소 |
| `stage-border` | `#2E2E35` | 경계선 |
| `stage-text` | `#F5F5F2` | 본문 텍스트 (오프화이트) |
| `stage-text-muted` | `#9C9CA3` | 보조 텍스트 |
| `fire-amber` | `#FF8C2A` | **액센트 전용** — 브랜드/호스트 표시/CTA (배경 워시 금지) |
| `fire-hot` | `#FF4500` | 녹음/라이브 상태 |
| `spring-green` | `#56F09F` | 트래킹/성공 상태 |
| `scene-accent` | `var(--scene-accent)` | 씬 전환 시 동적 주입 (SceneBackground가 설정, 구매 가능한 씬 팩과 연동 예정) |

**대비(WCAG) 검증:**
- `#F5F5F2` on `#0B0B0D` = 18.9:1 (AAA)
- `#FF8C2A` on `#0B0B0D` = 5.1:1 (AA Large)

**CSS 변수 (`--scene-accent`):**
씬 전환 시 SceneBackground가 `document.documentElement.style.setProperty` 로 주입.
기본값: `#FF8C2A` (모닥불 amber). **컬러/씬 팩 구매 시스템**: `--scene-accent`를 유료 씬 언락과
연동하는 방향 검토 중 — 스펙 미확정, `DATA-SCHEMA.md §1.7 scenes` 테이블에 `is_purchasable`·
`price` 컬럼 추가 필요 여부는 PENDING.

---
[구버전 — 참조용, 2026-06-27~2026-06-30 세션에서 확정했던 앰버 다크나이트 배경 스펙]

| 토큰 | Hex | 역할 |
|---|---|---|
| `stage-night` | `#0D0D14` | 룸 기본 배경 (딥 나이트 블루-블랙) |
| `night-blue` | `#1A1A3E` | 비활성 슬롯·배경 서브 |

`#FF8C2A on #0D0D14` = 4.8:1 (AA Large). 배경 자체에 앰버 글로우를 쓰던 방식 — 위 무채색
개정으로 대체됨.

---

## 7. 유지보수 규칙

1. 색/폰트/모션을 바꿀 때 **이 문서 먼저** 고치고, 그다음 `tailwind.config.ts`·`motion.ts` 동기화.
2. flecto 원본(`flecto-reference/`)은 참고용. 새 값이 필요하면 추출물을 보되 코드엔 distill한 토큰만 둔다.
3. 접근성 대비는 §1 표의 검증 조합을 우선 사용.
