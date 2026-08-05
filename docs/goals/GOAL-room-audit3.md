---
tags: [goals]
---

<!--
  GOAL-room-audit3.md — 룸페이지 감사 3(2026-08-05, DOGFOOD §0 A-P1h) 후속 골 사다리 브리프.
  실행: phase-loop("이 골 실행해" / /phase-loop docs/goals/GOAL-room-audit3.md).
  상태판(영구 인덱스)은 GOAL-LADDER.md "사다리 D" 표 — 완료 시 이 브리프는 archive/ 이관.
  승격 모델 결정(2026-08-05 AskUserQuestion): 호스트 직접 초대 — invite-to-stage 손들기 무관화,
  stage_invited_at 영속, accept-stage-invite 게이트, 손들기 뷰어 버튼은 폐기 유지.
-->

# GOAL-room-audit3 — 룸페이지 감사 3 사다리 (D1~D7)

## 골 한 줄

룸페이지 5페르소나 감사(보안 3트랙·UX 2트랙)에서 확정한 P1 보안 구멍 1 + P2 하드닝 3 + UX Blocker/High 7 + a11y 4를 D1~D7 직렬 phase 로 완결 — verified by 각 phase 체크리스트 전항 [x] + `npm run check:all` green + 신규/수정 Edge `deno check` clean + 마이그 db reset·psql 실측 + §0 probe 등재(docs:drift 앵커), while preserving 기존 스위트 green·room-authority 스푸핑 방어(SEC-RA-1)·i18n 3국어 완역. details in docs/goals/GOAL-room-audit3.md

## 1. Outcome (완료 시 참)

DOGFOOD-AUDIT §0 **A-P1h 전 항목 [x]**. phase 별 이진 판정:

- **D0 문서화 선행**: §0 A-P1h(SEC 5·UX 11·반증 요약) 등재 + 이 브리프 + GOAL-LADDER 사다리 D 표. `docs:check`·`docs:links` PASS.
- **D1 SEC-1 무대 승격 구멍(P1 크럭스 · 승격 모델=호스트 직접 초대)**:
  - 마이그: `room_participants.stage_invited_at timestamptz` 신규 컬럼(`if not exists`, schema split 게이트 동기 — `docs/schema/01-core-tables.md` 모듈+legacy 스냅샷+manifest 3종).
  - `invite-to-stage`: `raise_hand_at` 필수 검사 **삭제**(손들기 무관화) → 호스트가 활성 viewer 를 직접 지목, `stage_invited_at = now()` 영속 후 broadcast.
  - `accept-stage-invite`: `promote_viewer_to_actor` 호출 **전** 본인 행 `stage_invited_at` non-null + 신선도(예: ≤120s) 검사 → 없거나 만료면 403. 승격 성공 시 `stage_invited_at = null` 클리어.
  - `promote_viewer_to_actor` RPC: 초대 게이트를 호출 Edge 에 위임한다는 주석은 유지하되, 계약 실현(SSOT 주석 정정).
  - HostConsole: "손든 관객 큐"(영구 빈) → **활성 viewer 목록에서 직접 [무대 초대]** UI 로 교체(raisedHands 의존 제거).
  - i18n: 신규/변경 카피 ko/en/ja 동시.
  - **판정**: 초대 없는 `accept-stage-invite` 직접 호출 → 403(자가승격 차단). 호스트 초대 후 수락 → 승격 성공. 손들기 UI 부활 0.
- **D2 SEC 잔여 하드닝**:
  - **SEC-2**: `list-room-members` 자기 멤버십 조회가 공유 `isActiveParticipant()` 재사용(또는 `is_disabled_by_host` 필터 추가) → 강퇴 유저 명단 조회 차단.
  - **SEC-4**: room-authority 발신자 검증에 `authority_epoch` 반영 — `transfer-host`/`leave-room` 승계 시 epoch 증가분을 수신측이 대조(또는 주기적 hostAuthId 재조회)해 ex-host stale 권한 창 축소.
  - **SEC-5**: 초대 레이트리밋 버킷 키를 엔드포인트별 네임스페이스 분리(`invite-create:` vs `invite-verify:`) — 호스트 자기제한 버그 해소.
- **D3 승계·종료 실시간 통지**:
  - **UX-HOST-SUCCESSION**: `_shared/roomLeave.ts` 호스트 승계 경로에 `host_change` broadcast(명시 `transfer-host` 가 이미 쓰는 payload 재사용) → 새 호스트 즉시 통지(toast) + 콘솔 탭 갱신.
  - **UX-ROOM-ENDED**: 최후 배우 퇴장 → `room_update`(ended) broadcast → 남은 뷰어 `RM-DEADROOM` 모달 재사용(얼어붙은 화면 해소).
  - SEC-RA-1 준수: 신규 broadcast 타입은 서버릴레이(participant=undefined)만 수신 수락.
- **D4 녹화 신뢰**:
  - **UX-CONSENT-DECLINE**: `useRoomRecording` 수신부 else 분기 — 거절/잔여 인원 호스트에 toast(현재 `all_consented===true`만 처리).
  - **SEC-3 late-joiner consent**: 녹화 중 신규 입장자에게 동의 재요청 broadcast → 거절 시 호스트 통지(자동 캡처 제외 렌더링은 defer, 통지+호스트 판단까지). 최소범위: 미동의 입장자 발생을 호스트가 인지.
  - **UX-UPLOAD-PROGRESS**: 녹화 업로드를 XHR `onprogress` 로 → 기존 ProgressBar(P-2) 재사용, 3초↑ 침묵 해소.
- **D5 발견성·조인·초대피드백**:
  - **UX-REACT-DISCOVER**: 기존 고아 키 `reaction.hint` 를 무대에 렌더(solo-invite 힌트 옆 pill·localStorage seen 게이트).
  - **UX-KBD-WHEEL**: 하단바 포커스 가능 버튼 1개로 리액션 휠 sticky 오픈(휠·로드아웃 키보드 도달) — 키보드/SR 진입 경로.
  - **UX-JOIN-TIMEOUT**: `useRoomJoin` 조인 fetch 에 `AbortSignal.timeout(15000)` 병합 → 기존 `joinError`/'error' 단계로 수렴(무한 "입장 중" 회귀 복구).
  - **UX-INVITE-FEEDBACK**: 무대초대 버튼 즉시 busy+"초대함" 배지(연타 가드) + 정원초과 실패를 호스트에도 통지.
- **D6 a11y·모바일**:
  - **UX-ARIA-BOTTOMBAR**: 하단바 아이콘버튼 4개(마이크·믹서·녹화·나가기) `aria-label`(상단바 패턴) + 모바일 터치타깃 `min-h-11`(44px).
  - **UX-MIXER-MODAL**: `AudioMixerPanel` 을 기존 `Modal` 프리미티브로 래핑(포커스트랩·Esc·복귀).
  - **UX-AVATAR-KBD**: `StageSlot` 좌석 클릭 확대에 `role="button" tabIndex={0}` + Enter/Space.
  - **UX-HOST-TOASTS**: 강퇴·음소거·채팅클리어에 성공 toast(콘솔 내 피드백 규약 일관).
- **D7 실증·마감**: 통합 실렌더(승격 초대 왕복·승계 통지·녹화 동의 거절·리액션 힌트) + 비회귀(기존 룸/더빙 무대) + §0 [x]+probe + 사다리 D DONE + GAP-MATRIX.

## 2. Verification surface (도구 중립 — 어느 런타임이든 동일)

- 공통(매 phase): `npm run check:all` → tsc 0·lint clean·test 전체 green·build PASS·docs:check PASS·docs:drift STALE/REGRESSION 0·docs:links 0 broken.
- Edge 신규/수정(D1·D2·D4): `deno check supabase/functions/<fn>/index.ts` clean.
- 마이그(D1): 로컬 `supabase db reset` 적용 + psql 로 `stage_invited_at` 컬럼 실측 1회 + schema split 게이트(docs:check byte-for-byte).
- 실렌더(D1·D3·D4·D5·D6): 헤드리스 Chrome 스팟 — 자가승격 403·초대 왕복·승계 toast·동의 거절·리액션 힌트 pill·360px 오버플로 0.
- 문서 앵커(매 phase): DOGFOOD §0 해당 행 [x] + `<!-- probe: <파일> :: <마커> -->` 등재 → `docs:drift` 회귀 감시.
- i18n: 신규 키 en/ja ⊆ ko·orphan 0(i18nCoverage green).
- 아티팩트: §7 실행 기록에 phase 별 실행 명령·결과 1줄.

## 3. Constraints (후퇴 금지 — phase 마다 누적)

- 이전 phase 검증 표면 green 유지(사다리 규칙) + 착수 시점 테스트 수 이상 유지.
- **room-authority 수신 방어 유지(SEC-RA-1)**: 신규 broadcast 타입(host_change 승계·room_update ended·late-joiner consent 등)은 서버릴레이(participant=undefined)만 수락 목록에 추가 — 클라 발행 수락 금지.
- 호스트 전용 쓰기는 전부 서버 재검증(requireHostRoom 패턴)·`check_rate_limit` 재사용(신규 무제한 쓰기 Edge 금지).
- **승격 게이트 무결성**: `accept-stage-invite` 는 서버측 `stage_invited_at` 없이 절대 승격 금지(D1 이후 회귀 시 SEC-1 재개방).
- i18n: JSX 하드코딩 한글 금지(lint 게이트)·신규 키는 ko/en/ja 동시.
- 마이그 시 schema split 게이트 준수(docs/schema 모듈+legacy 스냅샷+manifest 3종 동시 — docs:check 강제)·기존 마이그레이션 파일 수정 금지.
- stores barrel export 금지 · ponytail 미니멀리즘(새 패널·추상화 최소, 기존 프리미티브 재사용: Modal·toast·broadcast·ProgressBar·check_rate_limit).
- **손들기 뷰어 버튼 부활 금지**(2026-08-05 주인님 결정 — 호스트 직접 초대 모델).

## 4. Boundaries

- 허용: `src/features/{room,chat,script,dub,reaction,stage}/` · `src/pages/RoomPage.tsx` · `src/lib/rooms.ts` · `src/hooks/{useLiveKitRoom,useRoomJoin}.ts`(존재 위치대로) · `src/i18n/locales/` · `supabase/functions/`(invite-to-stage·accept-stage-invite·list-room-members·transfer-host·leave-room·record-recording-consent 최소 수정, `_shared/*`) · `supabase/migrations/`(신규 1: stage_invited_at) · `docs/`(§0·schema·contracts·goals).
- 금지: 크레딧/결제 RPC · 아바타 rig/pixi(`src/lib/pixi/`) · `.env`(grep 전면 금지 — awk/cut만) · 기존 마이그레이션 파일 수정 · 무관 로비/의상실 모듈 · 손들기 UI.

## 5. Iteration policy (phase-loop 계약)

- phase 순서 D0→D1→D2→D3→D4→D5→D6→D7. 각 phase: 구현 → §2 검증 전체 실행 → **§1 해당 체크리스트 대비 자기리뷰(누락 대조 — 메인 모델 직접)** → PASS 면 §7 기록 후 자동 진행, FAIL 이면 실패 항목만 최소 변경 재시도.
- 같은 phase 무진전 3패스 → blocked 판정.
- 배포·커밋·push 는 골 밖(기존 게이트) — phase 완료는 로컬 증거로 판정, 라이브 실측(승격 2탭·승계 broadcast·webhook)은 배포 후 체크리스트로 §7 에 이월.

## 6. Blocked stop condition

- 마이그가 schema split 게이트와 충돌(모듈/스냅샷/manifest 동기 실패 반복) · 게이트 flaky 재현 불가(2회 시도) · 무진전 3패스.
- 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실 4분류.

## 7. 실행 기록 (실행 에이전트가 기록)

- **✅ 프로드 배포 완료(2026-08-05, /배포)**: 마이그 2 push(prod psql 실측 — stage_invited_at 컬럼·promote RPC #variable_conflict 반영 `t`) → 함수 전체 배포(_shared 수정, exit0·functions list 대상 9종 ACTIVE·오늘 07:06 갱신 — accept-stage-invite v10·invite-to-stage v11·list-room-members v14·leave-room v18·livekit-webhook v6·record-recording-consent v8·create-room-invite v14·verify-invite-code v10·accept-invite v11) → CF Pages(`index-BZQgInkT.js`·비밀키 감사 6종 clean·curl root/asset/deep 200·#root) → **프로드 라이브 실증 SEC-1 10/10 + SEC-2 2/2**(자가승격 403·신선초대 승격 성사·강퇴자 명단차단). ⚠️ 수동 잔여: 없음(webhook URL 은 R5서 등록됨). 커밋·push 는 아래 마감서.
- (대기) 2026-08-05 브리프 작성 — 착수 전(주인님 "ㄱ" 승인 대기).
- 2026-08-05 Claude(Fable)/phase-loop — **D0 PASS**: 브리프+§0 A-P1h(SEC5·UX11·반증)+GOAL-LADDER 사다리 D 표. docs:check(schema 144)·docs:links(0 broken).
- 2026-08-05 Claude(Fable)/phase-loop — **D1 PASS(패스 1)**: SEC-1 무대 자가승격 정수정. 마이그 `20260805120000_stage_invite`(stage_invited_at, schema 모듈+legacy 스냅샷+manifest sha256 재동결) · `invite-to-stage`(raise_hand_at 검사 삭제=손들기 무관화, 대상 viewer 행에 `stage_invited_at=now()` 영속 후 broadcast) · `accept-stage-invite`(승격 전 본인 stage_invited_at non-null+≤120s 게이트, 없으면 403, 승격 성공 시 null 클리어) · `useRoomMembers` viewers 파생 + HostConsole "관객 무대 초대"(손든큐→활성 viewer 직접초대) · i18n host.inviteViewersTitle ×3. 검증: deno check ×2 clean · check:all exit0(185 tests·build·docs:check·drift 0·links 0). 자기리뷰: 초대 없이 accept→403(자가승격 차단)·정원초과 409 시 invited_at 미클리어(재시도)·더블수락 클라 가드·SEC-RA-1 신규 broadcast 0·손들기 버튼 부활 0. 이월: 라이브 2탭(자가승격 403·초대 왕복) 배포 게이트.
- 2026-08-05 Claude(Fable)/phase-loop — **D2 PASS(패스 1)**: SEC 잔여 하드닝 3. SEC-2(`list-room-members` me 쿼리 `.not(is_disabled_by_host,is,true)` — 강퇴자 명단 차단, isActiveParticipant 동일 게이트·익명 게스트 무회귀) · SEC-4(`useRoomMembers` 연결 중 30s 주기 재동기 nonce → hostAuthId 서버 진실 재조회로 ex-host stale 창 ≤30s) · SEC-5(초대 레이트리밋 버킷 create=`invite-create:`/verify·accept=`invite-verify:` 분리). 검증: deno check ×4 clean · check:all exit0(185). probe 정정: SEC-4 마커를 실제 위치(useRoomMembers::periodicNonce)로 이동(초기 useLiveKitRoom 마커는 orphan).
- 2026-08-05 Claude(Fable)/phase-loop — **D3 PASS(패스 1)**: 승계·종료 실시간 통지. `_shared/roomLeave.ts` 에 broadcastAuthority 헬퍼 도입(단일 지점 — leave-room·livekit-webhook 양 경로 커버) · UX-HOST-SUCCESSION(승계 분기에 `host_change` broadcast, 새 호스트 auth_id 룩업·transfer-host 동일 payload → 기존 useRoomAuthority 핸들러 toast+재조회 재사용) · UX-ROOM-ENDED(종료 분기에 `room_ended` broadcast → useRoomAuthority 신규 핸들러 setRoomEnded → RoomPage 데드룸 모달 room.roomEndedTitle/Body ×3 [로비로]). 검증: SEC-RA-1 게이트 확인(useLiveKitRoom:247 server-relay=participant undefined 는 임의 타입 통과 — room_ended/host_change load-bearing 실측) · deno check ×2 clean · check:all exit0(185·drift STALE0) · i18n 2키×3. probe 정정: D3 마커를 실제 코드 문자열(host_change·room_ended)로. 이월: 라이브 2탭(호스트 퇴장→승계 toast·최후 배우 퇴장→뷰어 모달) 배포 게이트.
- 2026-08-05 Claude(Fable)/phase-loop — **D4 PASS(패스 1)**: 녹화 신뢰 3. UX-CONSENT-DECLINE(record-recording-consent broadcast 에 `declined`+`declined_name` 추가·거절 경로만 이름 룩업 → useRoomRecording else 분기서 호스트 `room.recConsentDeclined` toast, 동의대기 무한멈춤 해소) · SEC-3(늦입장 동기 effect `recording` 분기서 비호스트·미동의자 동의 재요청 → 거절 시 위 declined 경로로 호스트 통지, 자동 캡처 제외 렌더 defer) · UX-UPLOAD-PROGRESS(uploadAndComplete fetch→XHR upload.onprogress→uploadPct, RoomBottomBar 라벨 "업로드 중 N%"). 검증: deno check clean · check:all exit0(185·drift STALE0) · i18n 2키×3(recConsentDeclined 보간·someone). 자기리뷰: recomputeConsent 진행 중 자동중지 없음(통지 범위 일치)·host auto-start 는 consentPending 게이트라 미발화. probe 정정 3(SEC-3·recConsentDeclined·uploadPct 실제 문자열). 이월: 라이브 3인(늦입장 거절→호스트 toast·대용량 업로드 % ) 배포 게이트.
- 2026-08-05 Claude(Fable)/phase-loop — **D5 PASS(패스 3)**: 발견성·조인·초대피드백 4. UX-REACT-DISCOVER(무대 reaction.hint pill·localStorage 1회·✕ dismiss) · UX-KBD-WHEEL(useReactionWheel openStickyWheel + RoomBottomBar 😊 버튼 aria/min-h-11) · UX-JOIN-TIMEOUT(AbortSignal.any+timeout(15s)·timeout.aborted 분기→error·room.joinTimeout) · UX-INVITE-FEEDBACK(HostConsole doInvite busy Set+stageInviteSent/Failed toast+정원참 actorIds≥6 비활성+host.stageFull). 검증: check:all exit0(185·drift STALE0). 패스 1 FAIL(i18n 중복키 host.inviteSent/Failed 기존재 → stageInvite* 개명)·패스 2 FAIL(set-state-in-effect lint: reactionOrigin 감시 이펙트 → localStorage-only 이펙트+dismiss 이벤트 핸들러로 분리). i18n 신규 7키×3(joinTimeout·openReactions·inviteSending·stageInviteSent·stageInviteFailed·stageFull). probe 정정 2(openStickyWheel·doInvite). 이월: 라이브(느린 조인 15s·정원참 초대) 배포 게이트.
- 2026-08-05 Claude(Fable)/phase-loop — **D7 PASS(마감·개발서버 실검증 포함)**: 전체 회귀 + 로컬 동적 검증 + 문서 마감. check:all exit0(tsc·lint·**185 tests**·build·docs:check·drift STALE0/REG0·links0)·§0 A-P1h **17항목 전부 [x]**(SEC-1b 추가)·GAP-MATRIX 1행. **로컬 supabase(OrbStack+db up+PostgREST 리로드)+functions serve 로 실측**: ①SEC-1 무대초대 게이트 통합 **10/10**(초대없이 403·만료 403·invite-to-stage 영속·신선 accept→200 승격+클리어·비viewer 409) ②SEC-2 강퇴자 명단차단 **2/2** ③vite dev(로컬 supabase)+헤드리스 Chrome 360px 하단바 실렌더 **5/5**(문서/하단바 가로 오버플로 0·리액션 버튼 렌더·콘솔 pageerror 0). **⚠️ 실검증이 잠복 버그 발견·수정 = SEC-1b**: `promote_viewer_to_actor` RPC 가 OUT 파라미터명 충돌로 "column reference ambiguous" 항상 500 — 손들기 폐기로 정규 승격이 프로드서 실행된 적 없어 잠복(D1 코드리딩 미포착). 마이그 `20260805130000`(`#variable_conflict use_column`)로 정수정 → 수정 전 7/10→수정 후 10/10. **골 종결(D1~D7 = 7/7 PASS + SEC-1b)** — 커밋·배포는 /마감·/배포 게이트. **여전히 배포 이월(프로드 필수)**: 라이브 2탭/3인(승계 toast·방종료 모달·동의거절·업로드%·믹서 Esc — LiveKit 실연결 필요)·함수 배포(accept-stage-invite·invite-to-stage·list-room-members·leave-room·livekit-webhook·record-recording-consent·create-room-invite·verify-invite-code·accept-invite)·마이그 2 push.
- 2026-08-05 Claude(Fable)/phase-loop — **D6 PASS(패스 1)**: a11y·모바일 4. UX-ARIA-BOTTOMBAR(마이크·믹서·녹화·나가기·리액션 5버튼 aria-label+min-h-11) · UX-MIXER-MODAL(**의도적 편차**: 🎧 앵커 팝오버 유지+role=dialog·aria-modal·Esc·오픈 포커스 — 중앙 Modal 전환은 상호작용 퇴행이라 미채택) · UX-AVATAR-KBD(StageSlot role=button·tabIndex·Enter/Space·label aria) · UX-HOST-TOASTS(kick/mute/unmute/clearChat toast.success 규약 통일). 검증: check:all exit0(185·drift STALE0)·i18n 4키×3. probe 정정 4(aria-label·aria-modal·UX-AVATAR-KBD·host.kickDone). **이월(D7 배치)**: 하단바 버튼 증가로 360px 오버플로 실렌더 검증.

## 참조 문서

- [DOGFOOD-AUDIT-2026-07.md](../DOGFOOD-AUDIT-2026-07.md) §0 A-P1h (발견 원본·file:line)
- [GOAL-LADDER.md](./GOAL-LADDER.md) 사다리 D 상태판
- `contracts/HostConsole.md` · `state-machines/HostAuthority.md` · `contracts/ReactionWheel.md` · `contracts/RightPanel.md`
