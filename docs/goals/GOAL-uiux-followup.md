---
tags: [goals]
---

<!--
  GOAL-uiux-followup.md — UIUX 도그푸딩 감사(2026-08-08, DOGFOOD §0 트랙 B "UX 완료축") 후속 골 사다리 브리프.
  실행: phase-loop("이 골 실행해" / /페이즈루프 docs/goals/GOAL-uiux-followup.md).
  상태판(영구 인덱스)은 GOAL-LADDER.md "사다리 U" 표 — 완료 시 이 브리프는 archive/ 이관.
-->

# GOAL-uiux-followup — UIUX 감사 16건 사다리 (U0~U6)

## 골 한 줄

UIUX 감사 확정 16건을 U0~U6 직렬 phase 로 완결 — verified by 각 phase 체크리스트 전항 [x] + `npm run check:all` green + 신규/수정 Edge `deno check` clean + 백엔드 phase 는 로컬 supabase 실동작 실측 + §0 probe 등재(docs:drift 앵커), while preserving 기존 스위트 green·notifications RLS(INSERT 는 service_role 만)·i18n 3국어 완역. details in docs/goals/GOAL-uiux-followup.md

## 0. 감사 판정 (이 골이 존재하는 이유)

4개 페르소나 정찰 + 원본 대조로 18건 확정. 한 줄 판정:

> **이 앱은 "실패"는 잘 다루는데 "완료"를 다루지 않는다.**

에러 경로엔 원인별 문구·재시도·대안이 촘촘하다(`useRoomJoin.ts:83-101` 5분기 · `LobbyPage.tsx:30` 5분기 ·
`Modal.tsx:20-39` 포커스 프리미티브를 11개 화면이 재사용). 반면 **오래 걸리는 일이 끝났을 때 사람에게
닿아 다음 행동으로 잇는 배선**은 아바타 커미션 하나만 완성돼 있고(`20260713180000_avatar_job_notify.sql`),
영상생성·더빙·녹화는 완료 통지가 아예 없으며, 발행되는 알림 9종 중 5종은 눌러도 아무 데도 가지 않는다.

**범위 밖(주인님 결정 2026-08-08):**
- `PUSH-CHANNEL` (#4) — 탭을 닫으면 도달 경로 0(웹푸시·이메일·타이틀 뱃지 전무). 별도 골.
- `HAND-RAISE` (#5) — 관전자 손들기. `RoomBottomBar.tsx:49` 의 ROOM-21 defer 유지 → defer 대장.

## 1. Outcome (완료 시 참)

phase 별 이진 판정:

- **U0 문서화 선행**: 이 브리프 + `GOAL-LADDER.md` 사다리 U 표 + DOGFOOD §0 에 16건 probe 마커 등재.
- **U1 완료 통지 배선** (`NOTI-VGEN`·`NOTI-DUB`·`NOTI-REC`·`REC-CONSENT-N`): 영상생성·더빙 합성·방 녹화가
  끝나면 **화면을 떠나 있어도** `notifications` 행이 남고 벨에서 목적지로 이동된다. 녹화 동의 대기가 `n/N` 로 보인다.
- **U2 알림 라우팅·수납** (`NOTI-FRIEND`·`NOTI-PAGE`): 발행되는 모든 type 이 클릭 목적지를 갖는다
  (라우팅 없는 type **0개**를 테스트가 강제). 벨이 10개 벽을 넘어 열람된다.
- **U3 예약↔방 연결** (`RES-ROOM`): 예약 알림에 갈 방이 **존재**한다 — 호스트는 알림에서 방을 열고,
  초대자 알림은 그 방으로 이동한다.
- **U4 피드백 채널·이탈 보호** (`FB-TOAST`·`FB-CHAT-DUP`·`FB-MIC-DUP`·`LEAVE-GUARD`): 에러 토스트가 저절로
  사라지지 않고, 토스트가 다음 액션 버튼을 실을 수 있으며, 연타로 중복 요청이 나가지 않고,
  브라우저에서 도는 작업(더빙 합성·방 녹화) 진행 중 탭을 닫으려 하면 경고가 뜬다.
- **U5 팝오버 접근성·터치** (`A11Y-POPOVER`·`TOUCH-44`): 팝오버 4종이 Esc 로 닫히고 열 때 포커스가
  안으로 들어간다. 터치 타겟 3곳이 44px 이상.
- **U6 첫인상·발견성** (`REG-FROM`·`HUB-SIGN`·`ETA-COMMISSION`·`SLOT-AFFORD`·`HINT-SEEN`·`ONB-BACK`):
  초대 링크로 온 신규 유저가 **회원가입을 거쳐도 초대를 잃지 않는다**(Blocker).

## 2. Verification surface

| phase | 명령 | 기대 |
|---|---|---|
| 전 phase 공통 | `npm run check:all` | green (tsc·lint·test·build·docs:check·docs:drift·docs:links) |
| U1·U3 (백엔드) | `npx supabase db reset` + psql 실측 · 로컬 `functions serve` 통합 | 트리거 발화로 `notifications` 행 생성 · **재PATCH 중복 0**(대조군) |
| U1·U3 (Edge) | `deno check supabase/functions/<name>/index.ts` | clean |
| U2 | 신규 unit — 발행 type 전수 배열 대 `onItem` 매칭 | 라우팅 없는 type **0개** |
| U4 | 신규 unit | error 토스트가 4초 후 잔존 · 연타 시 `onSend` 1회 · 진행 중일 때만 `beforeunload` 등록 |
| U5 | 신규 unit + `npm run check:responsive` | 팝오버 4종 Esc 닫힘·포커스 진입 · 360/768/1440 오버플로 0 |
| U6 | 신규 unit + 헤드리스 실렌더 | `?invite=` → 회원가입 → 초대 배너 생존 |

**정적 게이트만으로 phase 를 닫지 않는다** — 백엔드 phase 는 로컬 supabase 실동작 실측이 완료 조건이다.

## 3. Constraints (후퇴 금지)

- 기존 스위트 green 누적 — 각 phase 는 이전 phase 의 검증 표면을 깨지 않는다.
- `notifications` 는 INSERT 정책이 없다 — 쓰기는 **service_role / SECURITY DEFINER 트리거**만.
  클라이언트 INSERT 경로를 만들지 않는다.
- 기존 room-authority broadcast(`recording_done` 등)는 **유지**한다 — 방 안 즉시성은 그쪽 담당이고
  알림은 이탈자용 이중화다. 하나로 합치지 않는다.
- i18n 3국어 완역(`i18nCoverage` 테스트가 강제) · JSX 하드코딩 한글 금지(lint 차단).
- 반응형 DoD — 새 UI 는 360px 실렌더.

## 4. Boundaries

- 허용: `src/components/shared/` · `src/features/` · `src/stores/` · `src/pages/` ·
  `supabase/functions/{create-room,submit-dub-output,complete-room-recording}` · `supabase/migrations/`(신규 2) ·
  `docs/goals/` · `docs/status/DOGFOOD-AUDIT-2026-07.md` · `tests/unit/`
- 금지: `_shared/*` 수정(전 함수 재배포 유발 — 이번 범위에 불필요) · 기존 마이그레이션 파일 편집(신규만) ·
  `.env` · 웹푸시/서비스워커 도입(#4 는 범위 밖)

## 5. Iteration policy

각 패스: 해당 phase 의 검증 표면 전체 실행 → 실패 항목만 최소 변경으로 재시도 → 메인 모델 자기리뷰
(전역 규칙상 리뷰는 위임하지 않는다) → §7 기록. **무진전 3패스면 blocked.**

## 6. Blocked stop condition

- 로컬 supabase 스택이 안 뜨거나 트리거 실측이 재현 불가 → blocked(추측으로 닫지 않는다).
- U3 에서 예약↔방 연결이 기존 "빈 방 ended" 로직과 충돌 → 멈추고 설계 재수렴(`수렴`).
- 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실 4분류.

## 7. 실행 기록

- 2026-08-08 Claude Opus 5 — **U0 PASS**: 브리프·사다리 U 표·§0 트랙B-2 등재(probe 19행/16발견).
  `docs:check` PASS · `docs:links` 0 broken · `docs:drift` 138행 STALE 0/REG 0.
  ⚠️자기점검서 **발견 #8(LEAVE-GUARD)이 사다리에서 누락된 것을 잡아 U4 에 추가** — 플랜이 16건이라 쓰고
  15건만 배치했었다.
- 2026-08-08 Claude Opus 5 — **U1 PASS**: `NOTI-VGEN`·`NOTI-DUB`·`NOTI-REC`·`REC-CONSENT-N` 4건 [x].
  - 실측(로컬 supabase, psql 트랜잭션 rollback): 트리거 5/5 — INSERT 무발화 / generating→done 발화
    (room_id·job_id 일치) / **done→done 재PATCH 중복 0**(fal 10회 재전송 대비 멱등) / 스튜디오 방
    failed(is_studio=true·failure_reason) / generating→flagged 무발화. 계약 4/4 — dub 대상에서 이탈자
    제외(2명) · 삽입 형태 2종 · 벨 SELECT 컬럼 실재.
  - 게이트: `deno check` ×4 clean · 유닛 4/4 신규 · `check:all` **exit 0 (47 files / 195 tests)**.
  - 설계 판정 2개: ①`_shared/recordingConsent` 를 고쳐 tally 를 서버 단일 지점에서 계산(임포터 2개뿐).
    클라가 참가자를 세면 SEC-KICK-3 강퇴자 분모 규칙이 복제돼 서버 게이트와 어긋난다.
    ②`vgen-webhook` 은 손대지 않았다 — status 를 쓰는 경로가 웹훅 하나가 아니라 트리거가 근본 지점.
  - 자가수정 2개: `supabase-js` 는 throw 하지 않아 내가 처음 쓴 `try/catch` 가 무소음이 되는 것 →
    반환 `error` 명시 로깅으로 교체. `supabase start` 생성물(`supabase/.temp`)이 lint 를 189건 오염 →
    eslint/gitignore 무시(로컬 스택 켤 때마다 재발할 함정이라 근본 처리).

- 2026-08-08 Claude Opus 5 — **U2 PASS**: `NOTI-FRIEND`·`NOTI-PAGE` 2건 [x].
  - 설계 판정: 라우팅을 컴포넌트 밖 순수 모듈 `src/components/shared/notifRouting.ts` 로 뺐다
    (`NOTIF_TYPES` 13종 + `resolveNotifTarget`). 분기가 컴포넌트 안에 있으면 type 이 늘 때마다
    데드클릭이 조용히 재발한다 — 그게 이번 감사 발견 그 자체였다.
  - **테스트가 손목록을 믿지 않는다**: `NOTIF_TYPES` 도 결국 사람이 관리하는 목록이라 같은 실패
    모드를 갖는다 → 유닛 테스트가 `supabase/functions/**` 와 `migrations/*.sql` 에서 발행 type 을
    직접 긁어 대조한다. **positive-control**: 가짜 발행 지점(`brand_new_thing`)을 심으니 실제로
    FAIL(가짜 초록 아님), 제거 후 그린.
  - 예약 3종은 U2 시점에 이미 목적지를 준다(`/lobby/theater` — 예약 목록). U3 에서 room_id 가
    생기면 invite/reminder 를 방 직행으로 승급한다. **데드클릭을 다음 phase 로 미루지 않았다.**
  - 실렌더(로컬 supabase + dev, 25건 시드) **6/6**: 열어도 뱃지 20 유지(자동읽음 소멸) ·
    [모두 읽음]·[더 보기] 렌더 · [더 보기]→25 도달·버튼 소멸 · 친구 알림→친구 패널(role=dialog)
    열림+그 항목만 읽음(25→24) · [모두 읽음]→뱃지 0·**DB read_at 25/25** · 예약 알림→`/lobby/theater`.
  - 게이트: `check:all` **exit 0 (205 tests, +10)** · `docs:drift` 138행 STALE 0/REG 0.
  - ⚠️**로컬 DB 함정(제품 결함 아님)**: 로컬 `notifications`·`rooms`·`friendships` 에
    `authenticated`/`service_role` 테이블 그랜트가 없어 PostgREST 가 403(`permission denied`).
    프로덕션은 정상(벨이 실동작 중)이라 로컬 상태 드리프트다. 원인 미확정 — U3 의 로컬 Edge 통합
    전에 `grant select on <table> to authenticated` 로 보정하거나 원인을 먼저 잡아야 한다.

- 2026-08-08 Claude Opus 5 — **U3 PASS**: `RES-ROOM` 1건 [x].
  - 설계 판정: 원 설계의 "방은 시작 때 만드는 것"을 **뒤집지 않았다**. 방을 미리 만들면 빈 방 ended·
    reaper 와 충돌한다(그 판단은 지금도 옳다). 대신 **사후 연결** — 호스트가 그 예약으로 방을 열 때
    `room_reservations.room_id` 를 채운다. 브리프 §6 의 "기존 로직과 충돌 시 재수렴" 조건에 걸리지 않았다.
  - `ON DELETE SET NULL`(설계 SQL 은 CASCADE): 방이 지워졌다고 예약 행까지 지우면 취소 통지·리마인더
    **원장이 사라진다**. 실측으로 확인 — 방 삭제 후 예약 생존·room_id 만 null.
  - 레포의 위생 테스트가 내 코드를 잡았다(`edgeHostGuard`: `from("rooms")` + `host_id !==` 인라인 게이트).
    비교 대상이 rooms 가 아니라 room_reservations 라 위양성이지만, ALLOW 등재로 게이트를 무르게 하는 대신
    **쿼리 필터(`.eq("host_id", userId)`)로 바꿨다** — 테스트가 정당하다고 명시한 형태이고, 덤으로
    남의 예약은 행 자체가 안 나와 존재 여부도 새지 않는다.
  - `callFn` 이 에러에 응답 본문을 동봉하게 했다(status 동봉과 동형). 409("이미 열린 예약")가 기존
    room_id 를 실어 보내는데 호출부가 그걸 못 읽으면 사용자는 다시 데드엔드에 선다.
  - 실측: 로컬 Edge 통합 **20/20** · 실렌더([방 열기]→`/rooms/:id`·DB 연결·초대자 알림) · deno clean ·
    `check:all` exit 0 · `docs:drift` 138행 STALE 0.
  - 하네스 자가수정: 첫 실행 5 FAIL 은 제품 결함이 아니라 **테스트가 `SEC-RES-1`(예약 초대는 "함께 방에
    있던 적 있는 동료"만)을 안 만족시킨 것** — 공유 참가 이력을 심고 재실행해 20/20.
  - ⚠️**환경 이슈 재현 확정**: `db reset` 직후 public 테이블에 anon/authenticated/service_role 테이블
    그랜트가 **붙지 않는다**(`messages` 만 예외). 프로덕션은 정상이라 제품 결함이 아니지만,
    **새 환경을 마이그레이션만으로 재구축하면 전 경로가 42501 로 죽는다** — 백로그 후보.
    로컬은 프로드 기본권한 재현 스크립트로 우회(레포 마이그의 좁히는 문장은 재적용해 관대해지지 않게).

- 2026-08-08 Claude Opus 5 — **U4 PASS**: `FB-TOAST`·`FB-CHAT-DUP`·`FB-MIC-DUP`·`LEAVE-GUARD` 4건 [x].
  - **positive-control(가드 선택의 근거)**: 채팅 연타 가드를 `sendingRef` → `sending` state 로 바꿔
    같은 테스트를 돌리니 `onSend` 가 **2회**로 샜다(ref 면 1회). "state 는 리렌더 커밋 전 두 번째
    이벤트를 못 막는다"는 RM-CREATE-DBL 의 근본원인을 믿음이 아니라 측정으로 확인하고 원복했다.
  - 마이크 가드는 버튼(`RoomBottomBar`)이 아니라 **공유 함수 `useLiveKitRoom.toggleMic`** 에 넣었다 —
    호출부가 늘어도 한 곳에서 막힌다(전역 규칙: 형제 호출처 수술). 버튼 쪽엔 위치를 가리키는 주석만.
  - **액션 슬롯에 실제 소비처를 함께 붙였다**: 슬롯만 만들면 쓰는 데가 0인 사변 코드가 된다.
    녹화 업로드 실패 토스트에 [재시도] — 기존 키 `room.ctrlRecordRetry` 재사용이라 신규 i18n 0.
  - 컴파일러 lint 와 3번 부딪혔다(`react-hooks/refs`·`immutability`: catch 안에서 자기 자신을
    재호출하려면 ref 브리지가 필요한데 그 변형이 막힌다). **규칙을 우회하지 않고 구조를 고쳤다** —
    실패 토스트를 catch 가 아니라 `phase === 'uploadFailed'` 전이 이펙트에서 띄우니 브리지가 사라졌다.
  - `useLeaveGuard` 는 **작업 중일 때만** 등록한다(평시 상시 등록이면 아무 일 없는 이탈까지 막는다) —
    유닛이 "비활성이면 addEventListener 0회"를 강제. 천장 명시: 경고지 복구가 아니다.
  - 게이트: `check:all` **exit 0 (215 tests, +10)** · lint 0 · `docs:drift` 138행 STALE 0.

- 2026-08-08 Claude Opus 5 — **U5 PASS**: `A11Y-POPOVER`·`TOUCH-44` 2건 [x].
  - 설계 판정: 훅을 새로 만들고 **`Modal.tsx` 도 그 훅을 쓰게 바꿨다**. 계획은 "Modal 의 로직을 추출해
    팝오버에 이식"이었는데, Modal 을 그대로 두면 같은 로직이 두 벌 남아 언젠가 갈린다. 11개 화면이
    쓰는 프리미티브라 위험은 있었지만 충실 추출이라 기존 스위트 그대로 그린(220).
  - 믹서는 `aria-modal="true"` 를 선언해 놓고 트랩이 없어 **Tab 이 뒤 화면으로 새고 있었다** —
    "Esc·포커스 있음"으로 분류돼 있던 항목이 실제로는 선언과 동작이 어긋난 상태였다.
  - **게이트가 내 변경을 안 본다는 걸 먼저 확인했다**: `check:responsive` 기본 ROUTES 는
    `/login,/register,/reset` 이라 이번에 고친 컴포넌트가 하나도 없고, 팝오버를 열지도 않는다.
    그대로 돌리면 빈 초록이라 **팝오버를 연 상태로 360px 을 재는 실렌더**를 따로 붙여 9/9 확인.
  - 휠 편집 버튼은 `.touch-target` 만 얹으면 폭이 는 만큼 중심이 오른쪽으로 밀린다 → 좌표를 44 기준으로
    재계산해 중심을 보존했다(클래스만 붙이고 끝냈으면 조준점이 6px 어긋난 채 "고쳤다"가 됐다).
  - 한계(그대로 적는다): 믹서 팝오버는 방 세션이 필요해 실렌더에 못 넣었다 — 로직은 같은 훅이고
    유닛으로 잠갔지만 라이브 확인은 배포 후 방 안에서 해야 한다.
  - 게이트: `check:all` **exit 0 (220 tests, +5)** · lint 0 · `check:responsive` 9/9 · `docs:drift` STALE 0.

- 2026-08-08 Claude Opus 5 — **U6 PASS**: `REG-FROM`·`HUB-SIGN`·`ETA-COMMISSION`·`SLOT-AFFORD`·
  `HINT-SEEN`·`ONB-BACK` 6건 [x]. **사다리 U 완주(16/16).**
  - **REG-FROM(Blocker)**: 착지 URL 만 보면 오판한다 — 로비가 초대코드를 소비하며 쿼리를 지우기 때문에
    성공해도 `/` 로 보인다. **항해 이력**으로 "가입 직후 첫 이동이 `invite=` 였는가 / `/lobby` 로
    튕기지 않았는가"를 갈라 판정했다.
  - **유닛을 포기한 판단**: REG-FROM 유닛을 3번 시도했다(소셜우선 토글·jsdom matchMedia 결손·
    폼 제출이 store 목을 안 타는 문제). 비용이 값어치를 넘어 **실렌더로 대체**했다.
    대가는 명확하다 — **CI 자동 회귀가 없다**. 이 경로를 건드리면 실렌더를 다시 돌려야 한다.
  - **ETA-COMMISSION 은 새 코드를 안 썼다**: `lib/vgenEta.etaProgress` 가 이미 같은 "경과 대 추정"
    문제를 푼다(0 하한·캡). 상수 하나(p50 33분)만 얹었다.
  - **HINT-SEEN 은 기록 조건과 렌더 조건을 같은 식으로 묶었다**. 둘을 따로 쓰면 "안 보였는데 봤다고
    기록"이 그대로 재발한다 — 원래 결함이 정확히 그것이었다.
  - 실측: **실렌더 13/13**(REG-FROM 5 · HUB-SIGN 2 · 360/1440 × 3라우트 6) · `check:all` exit 0(220).
  - 라이브 미검증(그대로 적는다): `SLOT-AFFORD`·`HINT-SEEN` 은 방 안, `ETA-COMMISSION` 은 진행 중
    커미션이 있어야 보인다 — 배포 후 확인 대상.

## 8. ⚠️ 배포 필요 (사다리 종료 후 일괄)

- **마이그레이션 2**: `20260808120000_vgen_job_notify.sql` · `20260808140000_reservation_room_link.sql` (db push)
- **Edge 5**: `create-room`(U3 — reservation_id) + `submit-dub-output`·`complete-room-recording` (직접 수정) +
  `record-recording-consent`·`start-room-recording` (**`_shared/recordingConsent.ts` 임포터** —
  `_shared/*` 는 번들 타임 인라인이라 재배포 안 하면 tally 가 프로드에 안 걸린다, [[deployed-fn-drift]])
- **프론트**: CF Pages (벨 라우팅·라벨·i18n)

## 참조 문서

- `docs/status/DOGFOOD-AUDIT-2026-07.md` §0 트랙 B — 16건 원장(probe 앵커)
- `docs/design/uiux-distilled.md` — UX 원칙 SSOT
- `docs/design/UX-GAPS-AND-PATTERNS.md` — UX 선설계 패턴
- `supabase/migrations/20260713180000_avatar_job_notify.sql` — U1 트리거 형판
- `src/components/shared/Modal.tsx` — U5 포커스 로직 원본
