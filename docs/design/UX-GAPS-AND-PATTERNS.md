---
tags: [design]
---

<!--
  dogfood-audit(2026-07-06) 산출물 — 6 페르소나 서브에이전트가 실코드를 걸어보고 발굴한 UX 갭을
  uiux-distilled.md 원칙으로 "만들 수 있는 스펙"으로 정리. 원칙(uiux-distilled) = 왜/무엇, 이 문서 = 어디를/어떻게.
  구현 착수 시 이 문서의 §1 프리미티브를 먼저 만들면 §2 갭 다수가 한 번에 닫힌다.
-->

# UX 갭 & 패턴 — 도그푸딩 감사 반영 (착수 전 선설계)

> **BLUF:** 아키텍처(auth·Realtime·에러 처리·a11y 시맨틱)는 견고하나, **1초 내 성공/진행 피드백**, **모바일/뷰어 경로**, **다국어 완성**이 비어 있다. 이 셋은 개별 화면 수정이 아니라 **§1의 재사용 프리미티브 6개**를 먼저 만들면 대부분 한 번에 닫힌다. 원칙 근거는 `uiux-distilled.md`(#번호로 참조), 여기선 ChatterBox 실코드에 **어디를 어떻게** 고칠지를 못 박는다.

관련: [uiux-distilled.md](./uiux-distilled.md) · [DESIGN-TOKENS.md](./DESIGN-TOKENS.md) · [../FEATURE-CONTRACT-MAP.md](../FEATURE-CONTRACT-MAP.md)

---

## §1. 먼저 만들 재사용 프리미티브 (이걸 만들면 갭 다수가 한 번에 닫힘)

| # | 프리미티브 | 무엇 | 닫는 갭 | uiux 원칙 | 노력 |
|---|---|---|---|---|---|
| P-1 | **Toast/피드백 시스템** | 성공/실패/정보 1초 내 표시(자동 소멸 + `role="status"`/`alert`). 전역 `useToast()` + `<ToastHost/>` 1개. | 채팅 전송·아바타 저장·방 생성·리액션·큐/공유 브로드캐스트 "먹혔는지" 무피드백 전부 | #20 #21 #19 | S |
| P-2 | **Progress + ETA 컴포넌트** | 3초↑ 작업에 진행바 + 남은시간. DubCompositor(`DubCompositor.tsx:91-94`)가 이미 phase+progress 패턴 보유 → 추출해 재사용. | VGEN "generating"만 표시·ETA없음(`VgenStatusTab.tsx:52-56`), DUB 업로드/STT/합성 진행도 없음 | #20 | S |
| P-3 | **Realtime 상태 훅** | `useRealtimeRow(table, id, onChange)`. `vgenStore.ts:47-54`(job 구독)·로비 broadcast가 이미 인프라 사용 → 동형 확장. | DUB 수동 새로고침(`DubPanel.tsx:98`)·DUB 트랙 상태 미실시간·로비 조용한 갱신 | #33 | S~M |
| P-4 | **Modal 프리미티브** | `<Modal role="dialog" aria-modal>` + 포커스 트랩 + Esc + 복귀 포커스. | 비번 오버레이 포커스 트랩 없음(`RoomPage.tsx:355-389`), 강퇴 확인이 버튼 토글(`HostConsole.tsx:167-186`), 위험액션 확인 없음 | #34 a11y | M |
| P-5 | **반응형 규약** | 앱 전체 `sm:`/`xl:` 사용 **0회**(현재 `lg:`5·`md:`1). 브레이크포인트 규약 + 무대 slot 동적 크기(`stageLayout.ts` SLOT_PX 고정 120px). | 모바일 레이아웃 깨짐·무대 3×3 압착·검색창 고정폭 | #38 | M |
| P-6 | **다크 elevation 그림자(폴리시·P2)** | 다크용 그림자 elevation 스케일 신설(현 DESIGN-TOKENS 그림자는 랜딩 그린틴트 → 플랫폼 `index.css` 미배선, 깊이는 전부 border). ⚠️ **대비 교정은 취소** — WCAG 실측 muted #9c9ca3 vs base=7.21:1·panel=6.49·elevated=5.80 전부 AA 통과(정찰 3.2:1은 오산). 그림자는 결함 아닌 폴리시라 P2. | 깊이감(카드/모달) — 폴리시 | #11 | S |

**착수 순서 권장:** P-1·P-2·P-6(전부 S) → P-3 → P-4·P-5. P-1~P-3만 해도 "잘 안 되는 것처럼 느껴지는" 체감 문제의 대부분이 사라진다.

---

## §2. 화면별 갭 → 수정 (프리미티브로 닫히면 P-n 표기)

| 화면 | 갭 (file:line) | 수정 | uiux | 노력 |
|---|---|---|---|---|
| **온보딩/Auth** | 비밀번호 찾기 경로 전무(`LoginPage.tsx`) | Supabase `resetPasswordForEmail()` + `/reset` 라우트 | #17 #36 | S |
| | 이메일 인증 재전송 버튼 없음(`RegisterPage.tsx:47-60` PENDING 화면) | resend 버튼 + 쿨다운 | #36 | S |
| | 실시간 검증/강도 미터 없음(제출 시에만) | 입력 중 인라인 검증 체크 | #36 #21 | M |
| | 가입 → 즉시 로비, 아바타 미선택 | 가입 직후 아바타 픽(활성화 시점에 "VTuber 됨" 경험) | #28 | M |
| **로비** | 조인 시 로딩 스피너 없음·목록 0→N 깜빡임 | P-1 + 스켈레톤 | #20 | S |
| | 초대링크 복사 없음(ponytail) | 클립보드 복사 버튼 | #30 | S |
| **룸 진입** | "Joining…" **타임아웃/취소 없음** → 무한대기(`RoomPage.tsx:66-93`) | `callFn`에 15s 타임아웃 + 취소 버튼 | #36 #20 | M |
| | 에러 상태 재시도 버튼 없음(로비로 가야 함) | 인라인 Retry | #36 | S |
| | 강퇴 후 재진입 안내 없음·사유 없음 | 사유 표시 + 재입장 링크 | #17 | S |
| **무대/리액션** | **리액션 우클릭 전용 → 터치 불가**(`RoomPage.tsx:455`, `ReactionWheel.tsx:44-45`) | touch 롱프레스(≥500ms) + 키보드 1~N 핫키 | #38 P-5 | M |
| | 무대 고정 120px·`max-w-3xl` 모바일 압착(`stageLayout.ts:4`, `Stage.tsx:39`) | 동적 SLOT_PX + 반응형 그리드 | P-5 | M |
| **채팅** | 타임스탬프·전송확인·타이핑·프레즌스 없음 | 타임스탬프 + P-1 전송 표시 | #19 | S~M |
| **DUB** | **수동 새로고침**(`DubPanel.tsx:98`)·트랙 상태 미실시간 | P-3 구독(`dub_sessions`·`dub_tracks`) | #33 | S |
| | 업로드/STT/합성 진행도·ETA 없음 | P-2 | #20 | S |
| **VGEN** | "generating"만·ETA 없음(`VgenStatusTab.tsx:52-56`) | P-2 + `estimated_duration_sec` | #20 | S |
| **호스트 콘솔** | 강퇴 2단 토글 불명확·사유 미저장(`HostConsole.tsx:167-186`; 계약서는 모달+사유 규정) | P-4 모달 + 사유 필드 | #34 | M |
| | 연결품질 이모지만(`HostConsole.tsx:156`) | 가시 텍스트 라벨 + RTT/loss(색맹·모바일 안전) | #8 #39 | S~M |
| | mute 낙관적 → 새로고침 시 desync(`HostConsole.tsx:31-33`) | 마운트 시 `muted_by_host` 로드 | #33 | S |
| | 호스트 이양 미배선(leave-room은 `new_host_id` 반환하나 UI 무시) | 호스트 변경 감지 + 컨트롤 토글 | — | M |
| **뷰어/모바일** | **ViewerGate·MobileViewer 구현 0**(계약서만 존재) | 라우트 가드 + 모바일 뷰 배선 | #38 | L |
| **a11y** | 비번 오버레이 포커스 트랩 없음(`RoomPage.tsx:355-389`) | P-4 | a11y | S |
| **다국어** | en/ja **각 33키 vs ko 216키(≈15%)** → 대부분 한국어 폴백 | 나머지 183키 번역 | #26 | L |

---

## §3. 우선순위 사다리

- **P0 (체감 결손 — 착수 즉시):** P-1 피드백 · P-2 진행/ETA · 룸 조인 타임아웃/취소. → "동작은 하는데 안 되는 것 같은" 인상을 없앤다. (P-6 대비교정은 WCAG 실측 7.2:1로 취소, 그림자는 P2.)
- **P1 (도달범위 — 성장 전제):** P-3 Realtime(DUB/VGEN) · P-5 반응형 + 터치 리액션 · 뷰어/모바일 경로 배선 · 다국어 완성.
- **P2 (프리미엄 폴리시):** P-4 모달 일원화 · 8px 그리드 정리 · 타입 스케일 1.25× · 그림자 elevation 전면 적용 · 라이트모드.

---

## §4. 이미 잘 됨 (회귀 금지)

- **a11y 시맨틱 기반**: `role="menu"/menuitem`(ReactionWheel), `role="radiogroup"/radio`(SettingsPage), `role="alert"`·`aria-live="polite"`(에러/조인 상태), label 결합, `focus:` 가시 스타일, 장식 이모지 `aria-hidden`.
- **auth/세션**: ProtectedRoute + 세션 자동복원, 로그인 후 원목적지 복귀, 구체적 에러 메시지.
- **VGEN 코스트 프리뷰**(생성 전 크레딧 명시) · **비번 락 set/remove 정합** · **2계층 mute**(DB + LiveKit 권한) · **DubCompositor phase+progress**(P-2 추출원).

---

## 한 줄 규칙

- **화면을 고치기 전에 프리미티브를 만든다(§1).** 같은 갭(무피드백·미실시간)이 여러 화면에 반복되므로, 컴포넌트 한 번이 표의 여러 행을 닫는다.
- **원칙은 `uiux-distilled.md`, 위치·방법은 이 문서.** 새 UX 결정은 여기 표에 한 줄로 추가하고 Feature ID/계약서에 연결한다.
