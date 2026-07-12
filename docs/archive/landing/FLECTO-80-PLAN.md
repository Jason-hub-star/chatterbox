---
tags: [guide]
---

# FLECTO-80 Plan — 다음 세션 인계

작성: 2026-06-20 · 상태: **✅ 실행 완료 (2026-06-20, phase-loop)** — Phase 1~6 전부, 각 Phase 빌드+실렌더 게이트 통과. 산출 요약은 [[PROJECT-STATUS]]. (아래는 실행 당시 인계 플랜 원문, 참고용 보존.)
> 실제 구현 차이: P3 그래픽 = 손수 SVG(`HeroFlow.tsx`)로 PNG→緑リグ→ライブ 3단계(계획대로 Lottie 미사용). P4에서 `Section panel` variant + `rounded-panel` 토큰 신설. P5 신규 `Testimonials`·`BackedBy`. P6 풀그린 = HowItWorks·Comparison.

## 목표

현재 snack-web 은 색·모션은 flecto인데 타이포·레이아웃·섹션 골격이 tak(SaaS 퍼널)이라 체감 **flecto 55 / tak 45**.
→ 타이포·레이아웃·섹션을 flecto 쪽으로 옮겨 **flecto 80 / tak 20** 달성. (색·모션 토큰은 그대로)

## 주인님 확정 결정

- 적용 범위 = **풀 flecto-80 패스 (Phase 1~6 전부)**
- 디스플레이 폰트 = **Schibsted Grotesk** (Plus Jakarta Sans 교체, aeonik 결 근사)
- **Lottie 사용 = 채택** (아래 §Lottie). 필요하면 designlang 재추출 후 진행.

## 근거 자료 (ground truth)

- **flecto 실사 스크린샷**: `design/flecto-reference/flecto-live-screenshots.png` (2026-06-20 라이브 캡처 4컷)
- 추출물: `design/flecto-reference/*` (design-language.md·motion·visual-dna·icon-system 등)
- 디자인 토큰 SSOT: `design/DESIGN-TOKENS.md`

### 스크린샷에서 확인한 flecto 시그니처 (= 지금 빠진 것)
1. 히어로가 통째로 **딥그린 둥근 플로팅 패널**(흰 여백 위에 떠 있는 ~40px 라운드 초록 카드). 현재 = 크림/흰색.
2. 디스플레이 타이포 **weight 400 경량**·가운데·흰 글자. 현재 = bold 700/800 ← **tak 티의 핵심**.
3. 밝은 **스프링그린 기하 그래픽**(노드/플로우 다이어그램), **스크롤 스크럽** 애니메이션.
4. 가장자리에 **떠다니는 UI 카드**(제품 스니펫·후기 말풍선).
5. **전부 둥글게**(섹션도 큰 라운드 패널, 원형 스크롤 버튼, pill 헤더).
6. **초록 지배적**(풀블리드 그린 섹션 다수). 추출: primary `#004737` 3863회 사용.

---

## Phase 1 — 타이포를 flecto로 (★★★ 임팩트 최대)

**변경**
- 디스플레이 weight 700/800 → **400**(경량). 호버/강조에만 500.
- 폰트 Plus Jakarta Sans → **Schibsted Grotesk** (`next/font/google`, `--font-display`).
- 디스플레이 사이즈 키우고 자간 타이트 유지(현 -0.03em ≈ flecto h2 -1.8px).
- 본문 Noto Sans JP 유지(라틴은 display 폰트와 조화).

**파일**: `src/app/layout.tsx`(폰트 import) · `tailwind.config.ts`(`fontSize.display-*` fontWeight 400, 필요시 `display-2xl 5.5rem` 추가) · `design/DESIGN-TOKENS.md §2`.

**근거**: 추출 Typography — flecto weight **400 dominant(3286×)**, 500은 10×뿐. h1 60px/400/line-height 66px. AGENT.md "Use the extracted typography families." 스크린샷 = 가는 헤딩.

**게이트**: 헤딩이 얇게 렌더 · flecto 스크린샷과 대조.

---

## Phase 2 — 히어로 = 딥그린 둥근 플로팅 패널 (★★★)

**변경**
- 페이지 bg = 크림/흰. 히어로 내부에 **거대한 `rounded-[40px]` 패널**(bg `primary-deep #032019` 또는 `primary #004737`), 좌우 여백 두고 떠 있게.
- 패널 안: **흰/크림 경량 디스플레이 가운데 정렬** + 배지 + CTA(accent pill + cream outline). 지표는 패널 하단 or 패널 안.
- **떠다니는 UI 카드 2~3개**(absolute, 흰 라운드 카드)를 패널 가장자리에: 예) "OBS連携", "1–3分", 미니 아바타 카드.

**파일**: `src/components/sections/Hero.tsx` · `tailwind.config.ts`(`borderRadius.panel: 2.5rem` 추가).

**근거**: 스크린샷 = 풀 다크그린 라운드 패널이 흰 위에 부유, 흰 경량 가운데 타이포, 가장자리 "Channels & Security" 카드, 중앙 그린 그래픽. 추출 visual-dna `maxRadius 1280`·`hasPill true`·`shadowProfile soft`.

**게이트**: 히어로가 flecto "플로팅 그린 패널"과 유사.

---

## Phase 3 — 히어로 그래픽 = 우리만의 "3단계 변환 플로우" (SVG, ★★)

> **주인님 결정 (2026-06-20)**: flecto의 추상 노드-플로우는 *그들의* B2B 스토리라 폐기. 우리 히어로 중앙 그래픽은 **"PNG → 초록 리깅 → 라이브 아바타" 3단계 변환 플로우**로 재정의. flecto의 *문법*(딥그린 패널·스프링그린 액센트·좌→우 흐름·둥근)은 계승, *내용*은 100% 우리 제품. 컨셉 후보 3종(3단계 플로우 / 단일 리그 오버레이 / 웹캠 미러) 중 **3단계 플로우 채택** — 피치 심사위원 1초 이해 + 초록 리그 시그니처를 가운데 주인공으로.

**시그니처 인사이트**: **초록 리그 와이어프레임**(`#56F09F`)이 우리 제품의 "노드 그래픽" 등가물이다(promo 스킬 "초록 리깅 순차 등장"). flecto가 스프링그린으로 노드를 그리듯 우리는 같은 색으로 *리그 메시*를 그린다 → 색·문법 flecto 80, 내용 100% 우리 것.

**레이아웃** (딥그린 패널 안, 좌→우):
```
┌────┐    ┌────┐    ┌────┐
│PNG │ →  │◓rig│ →  │▶ライブ│      ● 세 단계 카드를 스프링그린 연결선/노드로 잇기
│静止 │    │緑メッシュ│ │配信中│      ● 가운데 'rig' 단계 = 초록 와이어프레임 메시가 주인공(글로우)
└────┘    └────┘    └────┘
     ●───●───●  ← flecto식 연결 노드
```
- 카피·일본어는 전부 `〔仮〕` 임시(위 목업은 예시) — 실제 텍스트는 `content.ts`만 교체.

**구현 = 손수 SVG/CSS (Lottie 아님)**
- 히어로 그래픽은 **노드+선+사각형의 단순 기하** → 스킬 생성 Lottie보다 **직접 SVG가 더 싸고 색 토큰(`#56F09F`/`#032019`) 정확 일치, 번들 0, AI생성 품질 리스크 0**.
- 프리미티브 `src/components/sections/HeroFlow.tsx`(SVG, framer-motion으로 연결선 draw-on + idle 미세 sway, `prefers-reduced-motion` 시 정지).
- 초록 리그 메시는 실제 rig 비주얼 결을 따라 그린다(promo 스킬의 초록 리깅 캡처 참고 가능).

**Lottie = 범위 축소 (선택)**: 채택은 유효하되 **히어로엔 미사용**. 기능 섹션의 **작은 아이콘 애니메이션에만 선택 적용**(추출 `icon-system.json` = lottie-animation·filling-line). 도입 시에만 `lottie-react` + `LottiePlayer.tsx`(`ssr:false`) 추가, JSON은 `public/lottie/`. 미도입이어도 무방.

**근거**: flecto 실사 스크린샷 = 히어로 중앙이 단순 기하 노드-플로우(SVG로 완전 재현 가능). 우리 변환 스토리가 flecto의 좌→우 흐름 구조에 1:1 매핑. visual-dna imagery = flat-illustration.

**게이트**: 3단계 플로우 렌더·연결선 애니메이션 작동·`prefers-reduced-motion` 시 정지·flecto 스크린샷과 그린 패널 정합.

---

## Phase 4 — 전부 더 둥글게 + 섹션 패널화 (★★)

**변경**: 카드 radius 16→**24~32**, 큰 블록 `rounded-panel(40)`, 버튼 pill 유지. 일부 섹션을 **큰 라운드 패널**(크림/그린/민트 inset)로 감싼다. 원형 스크롤 힌트 버튼.

**파일**: `tailwind.config.ts`(radius) · `Card`(기본 radius↑) · `Section`(`panel` variant = `rounded-panel` inset bg) · 각 섹션.

**근거**: visual-dna `avgRadius 107.8`·material-you(pill+soft shadow). 스크린샷 = 모든 블록 큰 라운드.

---

## Phase 5 — 신규 flecto 섹션: Backed-by 로고월 + 후기 (★★, 피치 유용)

**변경**: `content.ts`에 `backedBy`(투자자/파트너 로고월 — "Proudly backed by") + `testimonials`(카드/말풍선) 키 신설 + 섹션 컴포넌트 신설. **알리바바 피치에 직접 유용**.

**파일**: `src/content/content.ts`(키 추가, 타입 포함) · `src/components/sections/BackedBy.tsx`·`Testimonials.tsx` · `page.tsx` 순서.

**근거**: 추출 Section Roles — footer "Proudly backed by" 0.95, testimonial 0.8. 스크린샷 = 떠다니는 후기 말풍선.

---

## Phase 6 — 더 많은 그린 / 풀블리드 섹션 (★)

**변경**: 중간 1~2 섹션을 풀블리드 다크그린으로(예: Comparison 또는 기능 하이라이트). flecto식 크림↔그린 리듬 교차.

**파일**: 섹션 `bg` prop(이미 `dark`·`mint`·`cream` variant 존재).

---

## §Lottie — diffusionstudio/lottie 평가 (주인님 질문 답)

| 항목 | 내용 |
|---|---|
| 정체 | **렌더러 아님.** AI가 프롬프트로 **Lottie JSON을 생성**하는 Claude Code 스킬 |
| 설치 | `npx skills add diffusionstudio/lottie` (스킬), MIT |
| 출력 | `public/projects/<p>/<scene>/lottie.json`, lottie-web(SVG)로 렌더 |
| 우리 적합성 | **높음** — flecto가 lottie-animation 아이콘 사용. 히어로 그래픽·기능 아이콘 저작에 이상적 |
| 추가 필요 | **렌더 라이브러리 별도**: `lottie-react` 또는 `@lottiefiles/dotlottie-react`(.lottie 압축) — Next에선 `ssr:false` 클라이언트 |
| 리스크 | 생성 품질은 프롬프트 의존 → 폴백(CSS/SVG 기하) 준비. 번들 크기 체크(아이콘은 가벼움) |

**결론 (2026-06-20 정정)**: **히어로 그래픽은 Lottie 미사용 — 손수 SVG로 3단계 변환 플로우 제작**(단순 기하라 SVG가 더 싸고 색 정확·번들 0). Lottie 채택은 유효하나 **범위를 기능 섹션 소형 아이콘 애니메이션으로 축소**(선택). 도입 시에만 스킬 생성 → `LottiePlayer`(`ssr:false`) 렌더, 프롬프트에 스프링그린/딥그린 토큰 명시.

---

## 필요 시 designlang 재추출

세부(히어로 그래픽 타이밍·플로팅 카드 배치·스크롤 스크럽 키프레임)가 더 필요하면:
```bash
mkdir -p /tmp/dl-out && cd /tmp/dl-out
npx -y designlang 'https://flecto.io/?ref=godly'   # 따옴표 필수(zsh ? 글로빙)
# 갱신분만 design/flecto-reference/ 로 복사
```
(특정 flecto 하위 페이지 추출도 고려.)

---

## 검증 게이트 (실행 세션)

- **빌드**: `npm run build` 그린 (stale 시 `rm -rf .next`).
- **시각**: `design/flecto-reference/flecto-live-screenshots.png` 와 나란히 대조 → 80/20 목표. agent-browser 데스크탑+모바일 몽타주 1장 Read.
- **불변식**: 텍스트는 `content.ts`만 · 토큰은 `DESIGN-TOKENS.md` 먼저 · reduced-motion 존중 · 색·모션 토큰 무회귀.

## 실행 순서 권장

Phase 1(타이포) → 2(히어로 패널) 먼저 = 체감 80% 거의 달성. 그 뒤 3(Lottie)→4(라운드)→5(신규섹션)→6(그린). 각 Phase 후 빌드+시각 게이트.
