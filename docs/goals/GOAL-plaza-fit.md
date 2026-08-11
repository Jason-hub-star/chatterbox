<!--
  GOAL-plaza-fit.md — 광장 허브 프레이밍 골 브리프(6요소). 근거: 2026-08-11 로비 감사 실측(§0).
  런타임 중립 — Claude Code·Codex·OpenCode 어디서 실행하든 §2 명령이 완료를 판정한다.
-->

# GOAL-plaza-fit — 광장 가게가 어떤 화면비에서도 잘리지 않는다

## 골 한 줄

```
모든 월드의 광장 가게 7개와 호버 간판이 지원 화면비 전 구간에서 잘림 0 — verified by
`npm test -- plazaSafeArea` green + `node scripts/check-plaza-fit.mjs` PASS(전 월드 × 뷰포트 6종,
핫스팟 가시율 ≥99.5%·간판 4변 뷰포트 내), while preserving 컨테이너 3:2 정합(핫스팟 % 좌표 기준)과
서양 광장 16:10/16:9 프레이밍 무회귀와 `check:all` green. details in docs/goals/GOAL-plaza-fit.md
```

## 0. 왜 (감사 실측 — 2026-08-11, 헤드리스 Chrome 실렌더)

광장은 3:2 원화를 뷰포트에 **cover**(가득 채우고 넘치는 부분 자름)한다. 보이는 세로 구간 = `1.5 ÷ 화면비`. 16:9면 84.4%(7.8~92.2%)만 남는다. `EASTERN` 구도는 박스가 **t 15~98 / l 0~100**으로 캔버스 끝에 붙어 있어 잘린다(`WESTERN` 은 t 21~95 / l 3.5~98).

| 뷰포트 | eastern 실측 |
|---|---|
| 1920×1080 | 야외무대 77.6% 가시 · 대극장 간판 상단 36px 잘림 |
| 1512×945 | 야외무대 95.6% · 대극장 간판 19px |
| 1440×900 | 야외무대 95.6% · 대극장 간판 23px |
| 2560×1080 | 야외무대 37% · 대극장 박스 상단 58px 밖 |
| 1024×768 | 의상실 60.3% · 다관 51.7% · 야외무대 70.8% · 의상실 간판 70px |
| 768×1024 | 의상실·다관·야외무대 **0%(완전 소실)** · 대극장 53.5% · 공방 20.7% |

western 대조: 1280/1440/1512 잘림 0, 1920 야외무대 90.9%, 1024×768 은 3개 부분 잘림.

**근본 원인 1개** — 매니페스트에 "가게 박스가 지켜야 할 안전영역"과 그것을 막는 게이트가 없다. 새 구도를 캘리브할 때 원화에 맞춰 끝까지 붙여도 아무도 막지 않는다.

## 1. Outcome (완료 시 참)

1. **F1 종횡비 폴백** — 광장 컨테이너는 3:2를 유지한 채, 화면비 R 에 따라 프레이밍을 바꾼다:
   - `1.5 ≤ R ≤ 1.8` → cover(현행). 세로 잘림 최대 8.3%/변.
   - `R > 1.8`(울트라와이드) → 세로 기준 contain(좌우 필러박스). 잘림 0.
   - `R < 1.5`(4:3·세로 창) → 가로 기준 contain(상하 레터박스). 잘림 0.
   여백은 `bg-stage-base`. **핫스팟 % 좌표는 컨테이너 기준이라 컨테이너가 3:2를 유지하는 한 정합은 불변.**
2. **F2 안전영역 재캘리브** — `WORLDS` 전 월드의 `plazaShops` 박스가 `l ≥ 2 · t ≥ 10 · l+w ≤ 98 · t+h ≤ 90` 안에 든다(= 1.8 화면비 cover 가시대 8.3~91.7% + 여유 1.7%p). 최소 필요 이동: eastern practice(b 98→≤90)·profile(l 0→≥2)·social(r 100→≤98), western practice(b 95→≤90). 박스는 **건물 실루엣 위에 남아야 한다**(축소로 처리, 중심 이동 최소).
3. **F3 간판 아래 뒤집기** — `box.t < 18` 인 가게는 간판을 박스 **아래**로 펼친다(`hub-sign-below`). 기존 좌우 뒤집기(`hub-sign-right`)와 조합 가능. 어떤 뷰포트에서도 간판 4변이 뷰포트 안.
4. **F4 브레이크포인트** — 로비의 데스크톱 광장/모바일 분기를 `md`(768) → `lg`(1024)로 올린다. 768~1023px 는 모바일 경로(배경 + 하단 네비 4탭)로 간다(3:2 밴드가 세로 화면에서 띠로 쪼그라드는 구간).
5. **F5 게이트 2종 신설** — 정적(단위 테스트) + 실렌더(스크립트). 아래 §2.
6. **F6 문서** — `docs/design/WORLD-SYSTEM.md` 에 안전영역 규칙 + 확장 절차에 게이트 단계 추가. 같은 파일 §현재 월드 표의 stale 행(eastern = "광장·내부는 서양 폴백") 정정 — 실제로는 자체 에셋 풀 배선.

## 2. Verification surface

| # | 명령 | 기대 |
|---|---|---|
| V1 | `npm test -- plazaSafeArea` | green. `tests/unit/plazaSafeArea.test.ts` 가 **WORLDS 전 월드 순회**로 ①안전영역 ②박스 상호 배타(겹침 0 — 매니페스트 규칙인데 지금까지 테스트 없음) ③dest 7종 유일성 단언 |
| V2 | `npm run dev` 후 `node scripts/check-plaza-fit.mjs` | `== 광장 fit 게이트: PASS ==` · exit 0. 전 월드 × 뷰포트 6종(1920×1080·2560×1080·1512×945·1440×900·1366×768·1024×768)에서 (a) `.hub-shop` 7개 각각 가시면적 ≥99.5% (b) 호버 시 `.hub-sign` 4변이 뷰포트 안 (c) `scrollWidth ≤ viewport` |
| V3 | `npm run check:all` | green (기존 게이트 무회귀) |
| V4 | `ROUTES=/ node scripts/check-responsive.mjs` (dev 서버 필요) | 360/768/1440 PASS — F4 로 768 이 모바일 경로로 넘어간 뒤에도 가로 오버플로 0 |
| V5 | 아티팩트 | `eastern`·`western` × {1920×1080, 2560×1080, 1024×768} 스크린샷 6장 — 재캘리브한 박스가 **건물 위에 남아 있는지** 육안 확인(좌표를 안전영역에 넣느라 허공을 가리키면 F2 실패) |

V1·V3 은 브라우저 불필요(CI 가능). V2·V4·V5 는 로컬 dev 서버 + `playwright-core` + 시스템 Chrome(레포 관례: 검증 후 `npm uninstall --no-save playwright-core`).

## 3. Constraints (후퇴 금지)

- **컨테이너 3:2 불변.** 핫스팟 % 는 컨테이너 기준이고 원화는 그 안에서 `object-cover` 다 — 컨테이너 비율을 깨면 전 월드 좌표가 원화와 어긋난다(가장 비싼 회귀).
- **서양 광장 무회귀**: 1440×900·1512×945 에서 현행과 동일한 cover 프레이밍(주력 해상도는 지금 멀쩡하다 — 고치는 게 아니라 지키는 대상).
- 원화 에셋(`public/scenes/**`) **무수정·무재생성**. 이 골은 좌표·CSS·게이트만 만진다.
- 광장 상시 UI(칩 클러스터·`LiveRail`·초대 배너·온보딩) 겹침·가림 회귀 0.
- 가로등(`plazaLamps`)·하늘 밴드(`plazaSky`)는 장식이라 안전영역 대상이 아니지만, 컨테이너 분기와 **함께** 움직여야 한다(원화 등화구 정합).
- `check:all` green 유지 · i18n 3언어 완역 유지(신규 문자열 발생 시).

## 4. Boundaries

- **허용**: `src/scenes/manifest.ts` · `src/components/shared/HubMap.tsx` · `src/pages/LobbyPage.tsx` · `src/index.css` · `tests/unit/plazaSafeArea.test.ts`(신규) · `scripts/check-plaza-fit.mjs`(신규) · `package.json` scripts 1줄 · `docs/design/WORLD-SYSTEM.md`
- **금지**: `public/scenes/**`(아트) · `interiorAnchors`·`InteriorShell`·내부 4관 페이지(내부 씬은 이미 letterbox 라 잘림 0 — 실측 확인됨, 이번 골 범위 밖) · 백엔드/Edge/마이그레이션 · 룸 코드 · 월드 갤러리 UI

## 5. Iteration policy

- 순서: **F1 → F3 → F2 → F4 → F5 → F6.** F1(폴백)이 먼저 들어가야 F2 재캘리브를 좁은 화면 기준까지 과하게 하지 않는다. F5 게이트는 F2 확정 뒤 작성해 **게이트가 현재 상태를 통과시키지 않고 결함을 재현**하는지 먼저 확인(게이트 신설 시 red→green 을 반드시 본다).
- 각 패스: V1~V4 전부 실행 → 실패 항목만 최소 변경으로 재시도. 좌표를 만졌으면 V5 스크린샷으로 건물 정합 확인 후 확정.
- 무진전 3패스 → blocked 판정.

## 6. Blocked stop condition

- **좌표로 못 푸는 경우**: 박스를 안전영역 안에 넣으면 원화 건물 실루엣의 60% 미만만 덮게 된다(= 아트가 캔버스 끝에 그려져 있다). 그 월드·그 가게는 "아트 재생성 필요"로 기록하고 멈춘다 — 아트 수정은 이 골의 경계 밖.
- F1 폴백이 `LiveRail`·칩 클러스터와 구조적으로 충돌해 겹침을 못 없애는 경우(레터박스 여백에 UI 가 떠서 원화 밖에 뜨는 문제) → 레이아웃 재설계는 별도 골.
- 보고 형식: **재현됨 / 근사됨 / 막힘 / 불확실** 4분류.

## 7. 실행 기록 (실행 에이전트가 기록)

- 2026-08-11 Claude Code — 감사 패스(구현 전): 실렌더 3회(핫스팟 가시율·간판 rect·내부관/모바일 오버플로)로 §0 표 확보. 내부 4관은 `.interior-stage`(`width: min(100vw, 100vh*1.5)`, aspect 3/2 letterbox)라 잘림 0 확인 — 범위에서 제외. 착수 전.
- 2026-08-11 Claude Code — **F1~F6 완주. 판정 PASS.**
  - **F1** `.plaza-fit`(index.css) 3분기 + LobbyPage 인라인 style 제거 → 21:9·4:3·세로에서 가게 7/7 회복, 서양 주력(1440·1512·1280) 프레이밍 무회귀 실측.
  - **F3** 간판 축 2개를 CSS 변수(`--sx`/`--sy`)로 조합화 + `hub-sign-below`(`box.t<22`)·`hub-sign-left`(신설, 우측의 거울이 없었다). 기준선은 18→22 로 정정 — 간판이 px 고정이라 **작은 화면일수록 씬 대비 %가 커진다**(1366×768 eastern troupe 5px 잘림으로 발견).
  - **F2** 안전영역 `{l:2,t:10,r:98,b:90}` 상수화(`SHOP_SAFE_AREA`) + 재캘리브 5건: eastern profile(l0→2)·social(r100→98)·practice(w19→17·h26→18), western practice(t64→65·w21→20·h31→25). **코어는 원화 절대위치 보존**(재계산해 넣음). 박스 정합은 오버레이 실렌더 2장으로 육안 확인.
  - **F4** 로비 광장/모바일 분기 `md`→`lg`. 1023↔1024 에서 정확히 전환(핫스팟 0↔7·하단네비 ON↔off) 실측.
  - **F5** 게이트 2종. **둘 다 red→green 실증**: ①단위 게이트가 내가 못 본 겹침 `western troupe×create 10%²`를 잡아 w18.5→18 로 수정 ②실렌더 게이트가 `eastern troupe 간판 5px`를 잡아 F3 기준선 정정. 추가로 안전영역 규칙 자체도 구 좌표 주입 → FAIL, 되돌림 → PASS 확인.
  - **F6** WORLD-SYSTEM.md 안전영역 절 + 확장 절차 4단계(게이트) + stale 3건 정정(eastern 완성·Step 3 완료·`.hub-cloud--night` 미존재 표기).
  - **증거**: V1 `plazaSafeArea` 9/9 · V2 `check:plaza` **월드 2 × 뷰포트 7 = 14/14 PASS** · V3 `check:all` green · V4 `ROUTES=/ check-responsive` 360/768/1440 PASS · V5 오버레이 2장(eastern·western 1920×1080).
  - 남은 불확실: 실기기 검증은 안 함(헤드리스 Chrome). 21:9 이상·초고DPI 실물에서의 체감(필러박스 여백 폭)은 배포 후 확인 대상.
- 2026-08-11 Claude Code — **프로덕션 배포 완료**(프론트 전용, DB·Edge 변경 0이라 백엔드 단계 생략).
  - CF Pages `chatterbox-7r8.pages.dev` — 번들 비밀키 감사 CLEAN(서버키 6종·`service_role` 0, grep 미사용 node 감사) · curl root/asset/deep 200 · **프로덕션 별칭이 신규 번들 `index-CLbiaTtC.js` 서빙 확인**(해시 일치).
  - **프로덕션 실증**: `BASE=https://chatterbox-7r8.pages.dev npm run check:plaza` → **월드 2 × 뷰포트 7 = 14/14 PASS**(로컬과 동일). 헤드리스 실렌더 콘솔에러 0·React 마운트 확인. 브레이크포인트 프로드 실측 768/1023 = 핫스팟 0·네비 ON / 1024 = 핫스팟 7·네비 off.
  - **판정: 재현됨**(로컬에서 세운 판정이 프로덕션에서 그대로 성립). 근사·막힘 없음.

## 참조 문서

- `docs/design/WORLD-SYSTEM.md` — 월드/구도 SSOT(안전영역 규칙이 들어갈 자리)
- `src/scenes/manifest.ts` — `Composition.plazaShops` 좌표 SSOT
- `docs/plan/ROADMAP-LOBBY-V4.md` — 로비 v4 광장 홈 설계
- `scripts/check-responsive.mjs` — 반응형 게이트(신규 `check-plaza-fit.mjs` 의 형식·관례 원본)
