---
tags: [status]
---

<!--
  2026-07-07 (Opus 4.8) 작성. 트랙 A(로직·보안·seam) 완료 → 트랙 B(UIUX) 를 Fable 모델에 인계.
  진입점: 이 문서 → docs/design/uiux-distilled.md(원칙) → UX-GAPS-AND-PATTERNS.md(위치/방법) → DESIGN-TOKENS.md.
-->

# 인계 — 트랙 B (UIUX 프레젠테이션) · 담당: Fable

> **BLUF:** 도그푸딩 감사 백로그의 **트랙 A(로직·보안·seam)는 12항목 전부 완료**(SEC-1~6 + A-SEAM-1~5 + A-FUNC-1~3, `docs/DOGFOOD-AUDIT-2026-07.md §0`). 남은 건 **트랙 B(UIUX 1회 패스)뿐**. 트랙 A가 **seam(채널·데이터·권한·훅)을 이미 심어놨으니**, 트랙 B는 그 위에 **표현(컴포넌트·스타일·레이아웃)만 얹는다** — "나중 연결"이 "나중 재작성"이 되지 않게 설계됨. 로직을 다시 짜지 말 것.

## 0. 먼저 읽기 (순서)

1. **이 문서** — 트랙 B 진입점 + seam→표현 매핑.
2. `docs/design/uiux-distilled.md` — UX 40원칙(왜/무엇). #번호로 참조됨.
3. `docs/design/UX-GAPS-AND-PATTERNS.md` — 화면별 갭 + 프리미티브(어디를/어떻게). §1 프리미티브 표가 핵심.
4. `docs/design/DESIGN-TOKENS.md` — 색·타이포·간격 토큰. **토큰 먼저 고치고 코드 동기화.**
5. `docs/DOGFOOD-AUDIT-2026-07.md §0` — 백로그 SSOT(트랙 B 체크리스트 원천).

## 1. 트랙 A가 심은 seam → 트랙 B가 얹을 표현 (핵심)

| seam (트랙 A, 이미 있음) | 위치 (file : symbol) | 트랙 B가 만들 표현 |
|---|---|---|
| **피드백 채널** | `stores/toastStore.ts`(큐+4s 자동소멸 store 소유) · `hooks/useToast.ts`(`toast`/`useToast()`) | ~~ToastHost 마운트~~ **완료(2026-07-08)** — `components/shared/ToastHost.tsx`(하단 중앙·의미색 고정·체크 드로우/쉐이크 0-dep·실렌더 5/5). emit = cue+리액션 릴레이 실패. **잔여:** 채팅전송·방생성·아바타저장 성공/실패 `toast.*` 호출 추가. |
| **진행/ETA 데이터** | `stores/vgenStore.currentJobEtaSec` + `currentJob.createdAt` · `lib/vgenEta.estimateVgenSeconds`/`etaProgress` · `DubCompositor` 로컬 `phase`/`progress` | ~~VGEN 진행바·DUB phase 바~~ **완료(2026-07-08)** — 공유 `components/shared/ProgressBar.tsx`(`--scene-accent` 연동·불씨 선단·불확정 흐름) + `VgenProgress`(95% 캡) + DUB 합성 바(실렌더 4/4). **잔여:** DUB 업로드/STT 진행도(ProgressBar 재사용). |
| **Realtime 갱신** | `hooks/useRealtimeRow(table,col,value,onChange)` — DUB 2구독 배선됨(수동 새로고침 버튼 이미 제거) | B는 로딩 스켈레톤/부드러운 전환만. 필요 시 다른 화면에도 동형 확장. |
| **뷰어 권한** | `stores/roomStore.myRole`(actor·viewer) + `lib/roomPermissions.roomPermissions(role)`(`{canPublish}`) | 뷰어모드 RoomView·MobileViewer의 **컨트롤 노출 판정**에 이 헬퍼 사용(마이크·표정 버튼 숨김 등). 규칙 하드코딩 금지 — 헬퍼 경유. |
| **i18n 키 구조** | `i18n/coverage.missingKeys(ko, target)` / `orphanKeys` + `tests/unit/i18nCoverage.test.ts`(en/ja ⊆ ko 가드) | `missingKeys(ko, en)`/`(ko, ja)`로 **번역 대기 목록** 뽑아 en/ja 채우기. 오펀 가드 테스트가 오타 키를 막아줌. |
| **조인 타임아웃/취소** | `lib/edgeFn.callFn(..., {signal})` — 15s 타임아웃 + 외부 `signal` 지원 | ~~취소 버튼~~ **완료(2026-07-08)** — `joinRoom` signal 관통 + RoomPage 취소 고스트 버튼 + 대기 글리프 + 진입 카피(실렌더 4/4). **글리프 교체(G7 2026-07-13):** `CampfireGlyph`(모닥불) → `NeonOnAir.tsx`(네온 On Air, 로딩 red 지지직→입장 green `entering` phase, spritegen 교체 seam 유지). **잔여:** 조인 에러 단계 인라인 재시도 버튼. |
| **인증 복구** | `userStore.requestPasswordReset/resendVerification/updatePassword` + `/reset` 페이지(기능만) | LoginPage 비번찾기·RegisterPage 재전송·`ResetPasswordPage`의 **스타일링**(현재 최소 폼). |

## 2. 트랙 B 백로그 (DOGFOOD-AUDIT §0 트랙 B)

- [x] **Toast/피드백 UI** — 완료(2026-07-08, 실렌더 5/5)
- [x] **Progress/ETA 바** — 완료(2026-07-08, 실렌더 4/4 + 조인 취소·모닥불 동반)
- [x] **반응형 레이아웃 + 터치 롱프레스 리액션 + 무대 동적 크기** — 완료(2026-07-08, 헤드리스 9/9·360px 스크린샷)
- [ ] **모바일 뷰어 레이아웃** — ⚠️ 기능 게이트(뷰어 입장 경로 미구현 — invite Edge·viewer 조인·anon). 해당 기능 슬라이스와 함께.
- [x] **다국어 번역 채우기** — 완료(2026-07-08, 232키 완역·coverage 0/0). **이후는 게이트가 강제**(CODING-CONVENTIONS §6.1: lint 한글차단 + i18nCoverage 완역 테스트).
- [ ] **모달 일원화**(P-4 focus-trap·Esc·복귀포커스 — 강퇴 확인·비번 오버레이가 소비처) · **다크 elevation 그림자**(index.css 미배선, 깊이 전부 border) · **라이트모드**
- ~~대비 교정~~ — 취소(WCAG 실측 muted 7.2:1, AA 통과 — 정찰 오탐).

사다리 현좌표(`UX-GAPS §3`): ~~P0~~·~~P1~~ 완료 → **잔여 = P2 폴리시(모달·그림자·라이트모드) + emit 확장 + §2 개별 잔여행**(Reset 표현·DUB 스켈레톤·채팅 타임스탬프·연결품질 라벨·호스트 이양 UI·인라인 재시도).

## 3. 제약 (성역·규칙)

- **seam 계약 유지.** `toastStore`/`useToast`/`useRealtimeRow`/`roomPermissions`/`estimateVgenSeconds`/`callFn` API 를 바꾸지 말 것. 트랙 B는 **스타일·레이아웃·컴포넌트만** — 로직 재작성 금지.
- **i18n 하드코딩 금지.** 모든 사용자대면 문자열 `t('area.key')`(CODING-CONVENTIONS §9). 새 키는 `src/i18n/locales/ko.ts`(flat dotted `<area>.<descriptor>`, `keySeparator:false`).
- **검증은 성역.** `type-check`+`lint`+`test`+`build`+`docs:check` 그린 + **UI는 실렌더/비주얼 스모크 필수**(`npm run dev` 육안 or playwright-core). 반응형은 **360px 깨짐 확인**(CODING-CONVENTIONS §6). 증거 없이 완료 표시 금지.
- **디자인은 토큰 먼저.** 색/간격/그림자는 `DESIGN-TOKENS.md` 갱신 후 코드 동기화. 다크 elevation 그림자 스케일은 신설 대상(P-6).
- **아이콘 소싱(주인님 정책 2026-07-07).** ① Reicon(reicon.dev) 우선 — MIT·개인/상용 무료·2,700+ 수작업 SVG·24×24 그리드·outline/fill·React 패키지 트리셰이킹. ② 없으면 커스텀 — 단 24px급 UI 아이콘은 래스터 생성(Codex) 리사이징 시 화질 저하라 SVG 직접 제작 우선, Codex 생성+리사이징은 장식·일러스트성 그래픽에만. DESIGN-DIRECTION "Heroicons 기본세트 그대로 금지"와 합치.
- **배포·커밋·push는 승인 게이트.** 임의 실행 금지.
- **모델 분담.** Fable(상위)이 설계·리뷰·플랜 직접. 넓은 탐색·독립작업만 서브에이전트(`Explore`/`general-purpose`).
- **폴더 규칙.** `features/*`는 컴포넌트 1~2개면 안 만듦(components/에 직접, PLATFORM-ARCHITECTURE §12.1). `stores/index.ts` barrel 금지(§12.3). alias `@/`=`src/`.

## 4. 현재 배포/커밋 상태 (주의)

- 트랙 A 전 항목 **미커밋·미배포**(로컬 working tree). B의 UI가 라이브되려면:
  - **프론트(CF Pages 재배포)** — A-SEAM/A-FUNC 프론트 + B 작업 (`chatterbox-7r8.pages.dev`).
  - **Edge/마이그(supabase 배포)** — SEC-1~6 + `list-room-members`(mute) + `advance-script-cue` 등.
- 따라서 **B 작업은 로컬 기준으로 진행**하고, 라이브 검증은 배포 후. mute 배지·DUB realtime은 옵셔널 처리라 stale 배포본에서도 안 깨짐.

## 5. 검증 하네스

```bash
npm run type-check && npm run lint && npm run test && npm run build && npm run docs:check
npm run dev          # localhost:5173 실렌더 육안(반응형 360px 포함)
```

## 6. 현황 참고

- **제품 화면 6개**(인앱 Landing 폐지 2026-07-08 — 마케팅은 snack-web, `/`=세션 리다이렉트): Login·Register·Reset(LoL식 AuthShell 공유)·Lobby·Room·Settings. Room = 무대(`features/stage`) + RightPanel(chat·dub·vgen 탭) + HostConsole(host 탭).
- **목업**: `docs/design/stitch-mockups/`(mobile-viewer·obs-viewer PNG + prompt).
- **계약(구현 입력)**: `contracts/`(MobileViewer·ViewerGate·ScriptPanel·DubCompositor 등). 계약 ≠ 구현완료(대부분 설계).
- **트랙 A 상세**: `docs/DOGFOOD-AUDIT-2026-07.md`(§0 체크리스트 + 진행 로그 + §1 보안표) · `docs/design/UX-GAPS-AND-PATTERNS.md`.
