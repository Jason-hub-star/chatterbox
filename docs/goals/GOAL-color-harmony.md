---
tags: [goals, design]
---

# GOAL — 색상 조화 리팩터 (CP1~CP4)

> 2026-08-03 승인. 소스 = 룸/UIUX 색상 감사(이 세션): 살아있는 앱은 무채 다크+앰버 단일
> 팔레트로 ~95% 토큰 일관(stage/fire 토큰 1,140회 vs 하드코딩 hex 66). 흔들림 3곳만 정수정.
> 미리보기 아티팩트에서 주인님이 **전체(CP1~CP4) 사다리** 채택.
> 설계 SSOT: `docs/design/DESIGN-TOKENS.md` · 계약: `docs/contracts/RoomView.md §G-261`(모드 배너색).

## 0. 판정 근거 (감사 실측)

| 흔들림 | 위치 | 성격 |
|---|---|---|
| 장르 6색 무지개 | `features/theater/genrePresets.ts` | 밝기 L 0.70~0.87·채도 제각각 → comedy만 튐 |
| 모드배너 생 파랑+보라 | `features/room/ModeBanner.tsx` | Tailwind 기본 blue-600/purple-600 = 전형 "AI 티" |
| 목조 세계색 미토큰화 | `src/index.css`(12색)+반복 리터럴 | 이미 조화(웜 가족)이나 흩어짐·DRY 위반 |
| 죽은 flecto 그린 팔레트 | `DESIGN-TOKENS.md §1~§7` | 코드 사용 0·`@theme` 정의 0 = 문서 유령(중구난방 착시 근원) |

**안 건드림(allowlist):** 카카오 `#FEE500`·구글 흰색·그린스크린 `#00b140`·rig 렌더 내부색 — 브랜드/기능 강제색.

## 1. 적용값 SSOT (OKLCH 격자 L 0.80 · C 0.125 · H 회전, 폴백만 저채도)

**CP1 장르 (구값 → 신값):**

| genre | 구 | 신 | H |
|---|---|---|---|
| romance | `#ff5c93` | `#FF9CB6` | 3 |
| horror | `#a78bfa` | `#C1B0FF` | 294 |
| fantasy | `#38d1d9` | `#37D5DE` | 200 |
| comedy | `#ffcb47` | `#E1B856` | 86 |
| drama | `#7aa2ff` | `#9FBDFE` | 265 |
| free | `#4ecdc4` | `#3ED7CD` | 189 |
| fallback | `#9c8b73` | `#999186` | 76(저C) |

**CP2 모드배너 채움(글자 `text-white` 유지, 대비 AAA):** vgen `#2563EB`→`#374C76`(7.82:1) · dub `#9333EA`→`#55436F`(7.95:1).

**CP3 토큰 승격(값 불변·이름만):**
- wood: `--wood-sign-bg #241811`·`--wood-plaque #2A1C10`·`--wood-ink #1A1208`·`--wood-border #6B4A2B`·`--wood-frame #8A6A3A`
- gold: `--gold-muted #C8B394`·`--gold-hi #FFD98A`·`--gold-text #FFE9C4`
- 리터럴: `bg-[#f4f0e8]`(6곳)→`--color-avatar-canvas #F4F0E8` · `text-[#241605]`(3곳)→`--color-cta-ink #241605`

## 2. Phase 사다리 (이진 Outcome · 검증 명령)

**CP1 — 장르 재조율** (`genrePresets.ts`만)
- Outcome: §1 표의 7색 신값으로 교체, 구값 리터럴 0.
- 검증: `rg '#ff5c93|#a78bfa|#38d1d9|#ffcb47|#7aa2ff|#4ecdc4|#9c8b73' src` → 0 · `npm run check:all` PASS.

**CP2 — 모드배너 재색** (`RoomView.md §G-261` 먼저 → `ModeBanner.tsx`)
- Outcome: 계약 §G-261 색 규격을 신값으로 갱신 후 코드 반영. `#2563EB`·`#9333EA` 리터럴 0.
- 검증: `rg '#2563EB|#9333EA' src` → 0 · `npm run docs:check`(계약 정합) · `npm run check:all` PASS.

**CP3 — 토큰 승격** (`DESIGN-TOKENS.md §8` 먼저 → `index.css @theme` → 리터럴 치환)
- Outcome: §1 CP3 토큰 전부 `@theme` 정의 + 반복 리터럴(`bg-[#f4f0e8]`×6·`text-[#241605]`×3)·index.css 목조 리터럴을 토큰 참조로 치환. **색 값 byte 불변**.
- 검증: `rg 'bg-\[#f4f0e8\]|text-\[#241605\]' src` → 0 · `npm run check:all` PASS · 빌드 산출 색 diff 0(값 동일 확인).

**CP4 — 회귀가드 + 죽은 팔레트 정리** (테스트/lint + `DESIGN-TOKENS.md §1~§7`)
- Outcome: 제거한 구 리터럴(장르 7·배너 2·`bg-[#f4f0e8]`·`text-[#241605]`) 재등장 시 실패하는 가드 존재 + flecto §1~§7 **DEPRECATED(코드 미사용)** 명시.
- 검증: `npm run test`(가드 포함)·`npm run docs:check`·`npm run docs:links` PASS.

## 3. 누적 Constraints

- 이전 phase 검증 표면 green 유지: `tsc`·`lint`·`test`(30/30 이상)·`build`.
- **CP3·CP4 색 값 byte-불변** — 이름만 부여, 시각 회귀 0(같은 hex를 var()로).
- allowlist 미변경: 카카오·구글·그린스크린·rig 내부색.
- **구조/토큰 문서 먼저**: CP2=`RoomView.md §G-261`, CP3=`DESIGN-TOKENS.md §8` 갱신 후 코드(CLAUDE.md 규칙).
- 장르 어휘 SSOT 1:1 유지(create-room GENRES·lib/rooms ROOM_GENRES·i18n lobby.genre.*) — 값만 교체, 키 불변.
- 무진전 3패스 → blocked 4분류(재현/근사/막힘/불확실) 보고.
- **배포·커밋은 골 밖** — 완주 후 `/배포`·`/마감` 승인 게이트.

## 7. 실행 기록

**CP1 — 장르 재조율** DONE(2026-08-03): `genrePresets.ts` 7색 OKLCH 신값 교체(romance #FF9CB6·horror #C1B0FF·fantasy #37D5DE·comedy #E1B856·drama #9FBDFE·free #3ED7CD·fallback #999186). `rg` 구값 7종 → **0**. `check:all` 최종단 docs:links OK(전 단계 그린·schema 144·contract PASS·drift STALE0/REG0). 장르 키 6종 불변(어휘 SSOT 1:1 유지).

**CP2 — 모드배너 재색** DONE(2026-08-03): 계약 `RoomView.md §G-261` 배너 색 규격 먼저 갱신(vgen 인디고틴트 #374C76·dub 바이올렛틴트 #55436F·대비 AAA 주기) → `ModeBanner.tsx` `bg-[#2563EB]`→`bg-[#374C76]`·`bg-[#9333EA]`→`bg-[#55436F]`. `rg '#2563EB|#9333EA' src` → **0**. `text-white` 유지. `check:all` **EXIT=0**(tests **183/183**·build 422ms·docs:check 계약 정합 PASS).

**CP3 — 토큰 승격** DONE(2026-08-03): 문서 먼저 `DESIGN-TOKENS.md §8.1`(목조 8+avatar-canvas+cta-ink 표) → `index.css @theme` 10토큰 정의 → 리터럴 치환(index.css 목조 16곳 var()·stage-base usage 1곳 var()·tsx `bg-[#f4f0e8]`×6→`bg-avatar-canvas`·`text-[#241605]`×3→`text-cta-ink`). `rg 'bg-\[#f4f0e8\]|text-\[#241605\]' src`→**0**. `check:all` **EXIT=0**(183/183·build 389ms). **값 불변 실측**: 산출 CSS `.text-cta-ink{color:var(--color-cta-ink)}`·`:root`가 `--color-avatar-canvas:#f4f0e8`·`--color-cta-ink:#241605`·`--color-wood-sign-bg:#241811`로 해석 = 원 hex 동일.

**CP4 — 회귀가드+죽은 팔레트 정리** DONE(2026-08-03): 가드 `tests/unit/colorTokenGuard.test.ts`(제거 구값 9 hex+2 임의클래스 부활 시 red·승격토큰 @theme 정의 유지 확인, 선례 edgeHostGuard 패턴) — 단독 2/2·전체 **185 passed**(183→185). `DESIGN-TOKENS.md` 상단에 flecto §1~§7 **DEPRECATED**(코드 미사용 실측 근거) 배너. `check:all` **EXIT=0**·docs:check contract PASS·docs:links 0 broken.

**골 C 완주**: CP1~CP4 전부 DONE, 게이트 green.

**CP3 후속(배포 중 발견·정수정)** — Tailwind v4 자동 소스탐지가 `docs/`(계약·스펙 md의 `className=` 예제)·`tests/`(가드의 탐지 문자열)·브리프의 `bg-[#f4f0e8]`·`bg-[#2563EB]` 텍스트까지 스캔해 **팬텀 유틸 클래스**(죽은 CSS)를 재생성 → 배포 번들에 구 색 hex가 되살아났다(라이브 실측 발견). 정수정: `src/index.css` `@import "tailwindcss" source(none); @source "../src";` 로 유틸 추출을 실소스(src)로 한정. 재빌드 실측: 죽은 `bg-[#2563EB]`·`#9333EA`·`#f4f0e8` **0**, 실사용(374C76·55436F·avatar-canvas·cta-ink·stage-*·FEE500 카카오) 전부 유지, CSS 86,085→81,689 bytes(팬텀 4.4KB 감량). 잠복 오염(골 이전부터)이라 향후 doc의 임의클래스 문자열도 무해화.

**배포(2026-08-03, `/배포`)** — 프론트 전용(마이그·Edge 0). CF Pages prod `--branch=main` 배포 `132fab19`(prod 별칭 `chatterbox-7r8.pages.dev` 동일 서빙, css `index-C1mIs7w0.css`). 라이브 실증: curl 3종 200 · 죽은 배너/캔버스 클래스 0 · 신 배너 2·신 토큰 6·신 장르 6색 존재 · **구 장르6+구배너2 = 0**. 번들 비밀키 감사 CLEAN(위험문자열 0·내 diff env/시크릿 0곳).
