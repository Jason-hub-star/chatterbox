# GOAL-room-audit2 — 룸페이지 감사 2: 새드패스 + 저강도 하드닝 (사다리 N)

## 골 한 줄
룸페이지가 세션 중 방종료·입장실패·카메라거부를 우아하게 안내하고(새드패스), 호스트 조작 피드백·연결배지·반응형을 갖추며, 저강도 보안 3건(강퇴토큰창·초대 알림폭탄·reaper 타이밍)을 하드닝한 상태 — verified by `npm run check:all` + phase 별 실렌더(연결끊김·카메라거부 주입·프로드 시딩) + 보안 phase 격리 pg/deno, while preserving Edge 계약 무약화·인증 모델 무회귀·비더빙/기존 룸 무회귀. details in docs/goals/GOAL-room-audit2.md

## 배경 (2026-07-21 dogfood 4차)
정찰3(인벤토리·보안표면·UX여정)+6페르소나(보안3·UX3)+메인 원본대조. **보안은 견고(P0/P1 0)** — 권한상승 6종·웹훅위조·경로traversal·RLS우회 전부 Refuted, 정찰 부풀림은 실임팩트로 강등. 실수확은 **UX 새드패스/피드백 공백**과 **저강도 보안 하드닝 3건**. §0 A-P1f(트랙 A) + 룸 UX 델타 2026-07-21(트랙 B) 등재 완료. 대부분 프론트 전용, N1만 Edge 3함수 소폭.

## 1. Outcome / 5. Phases (이진·검증 명령)
| # | 항목 | Outcome(완료 시 참) | 검증 |
|---|---|---|---|
| N0 | 문서화 | §0 A-P1f+트랙B + 브리프 + 사다리 N 표 | docs:check·links 0 |
| N1 | 보안 하드닝 | ①`livekit-token` ttl 600→**300**(정상 join·재접속 무영향 — 매 connect 새 토큰·순단 resume / 120 은 하드드롭 full-reconnect 회귀 위험이라 실측 후 300) ②`create-room-invite` 게이트 뒤 `check_rate_limit('invite:${userId}',20,3600)` — 21번째 429 ③`reap-stale-rooms` bearer 비교 `timingSafeEqual`(fail-closed 불변) | deno check ×3 clean + 시딩 통합(invite 21회째 429·reaper 유효/무효 bearer 200/401) + ttl 값 grep |
| N2 | 세션 중 새드패스 | `RoomPage` !connected 분기에 방종료 모달(로비 버튼)·네트워크 순단(reconnecting)과 방종료(ended·재조인 404 catch) 구분 + 입장 실패 인라인 [다시 시도]+원인별 카피 | check:all + 실렌더(연결 강제 끊김→모달 노출·재시도 클릭→재조인) |
| N3 | 입장 온보딩 | `RoomJoinGate` [📹배우]/[👀관전] 선택(기존 joinRoom/joinRoomAsViewer) + 카메라 거부 시 처방(허용 후 새로고침/관전 전환) | check:all + 실렌더(권한 거부 주입→처방 노출·관전 버튼→viewer 입장) |
| N4 | 호스트 콘솔 폴리시 | 채팅정책 클라 검증(단어≤50·슬로 0-3600s)+인라인 힌트·무효 시 저장 비활성 + 이양 후 옛 호스트 toast + 시간제 음소거 남은시간 표기 | check:all + 실렌더 스팟(무효 입력→힌트·이양→양측 toast·mute 카운트) |
| N5 | 가시성·a11y·반응형(트랙B) | 연결/음소거 배지 가시 텍스트·리액션 숫자키 힌트·뷰어 VGEN 안내·360px 룸 패널 오버플로 0·배경 업로드 인라인 표시 | check:responsive(360/768/1440) + 실렌더 + i18nCoverage |
| N6 | 실증·마감 | 통합 실렌더 + 비회귀(기존 룸/더빙 무대) + §0 [x]+probe·사다리 DONE·GAP-MATRIX·AGENT-OPS | check:all + 통합 실렌더 |

## 2. Verification surface
`npm run check:all`(165+α) · phase 별 실렌더 하네스(프로드 시딩·무과금 — 기존 룸 E2E 골격 재사용·2탭 관례) · N1 은 deno check + 시딩 통합(invite 레이트·reaper bearer) + ttl grep · N5 는 `check:responsive`. 유료 API 0.

## 3. Constraints (후퇴 금지)
Edge 계약 무약화(N1 은 하드닝만·게이트 강화 방향) · **인증/인가 모델 무회귀**(requireHostRoom/participants 체인·SEC-8 revoke·서명검증) · 사다리 R/F/U/W 검증 표면 green(호스트 이양·더빙 무대·recEngine) · 비더빙 무대·기존 룸 무회귀 · i18n 3국어 · 360px · check:all 그린.

## 4. Boundaries
허용: `src/pages/RoomPage`·`src/features/{room,stage,chat,reaction,tracking}`·`supabase/functions/{livekit-token,create-room-invite,reap-stale-rooms}`(하드닝만)·i18n·docs·실렌더 스크래치. 금지: 새 마이그(N1 무마이그)·인증 게이트 약화·새 의존성. 범위 밖: R6 RM-SCRIPT 대본 시스템(별도 정본 설계·HOLD)·SEC-KICK-TOKEN 정본 webhook 검증(N1 은 ttl 레버만·webhook 은 후속 골)·anon 뷰어·MobileViewer 전용 뷰(P2 기능).

## 6. Blocked stop condition
N1 ttl 축소가 정상 세션 중 재접속을 끊으면(라이브 재접속 회귀) → blocked·webhook 정본 설계로 승급 질문. N2 방종료 모달이 네트워크 순단을 오탐해 정상 재접속 중 뜨면 → blocked(ended vs reconnecting 판별 재설계). 무진전 3패스 → blocked(재현/근사/막힘/불확실 4분류).

## 8. N6/후속 주의 (하네스 트랩)
- **RM-JOIN-ROLE choose 게이트**: 룸 진입이 이제 배우/관전 선택 화면을 먼저 띄운다(?watch=1 딥링크만 건너뜀). 기존 2탭/E2E 하네스는 navigate 후 `getByRole('button',{name:/배우로 참여/}).click()` 선행 필요. `chatterbox-e2e-traps` 계열에 추가.

## 7. 실행 기록
- 2026-07-21 Opus — N0 완료: dogfood 4차 감사(정찰3+6페르소나+메인 원본대조) → §0 A-P1f(보안 반증 대량·신규 저강도 보안3·UX High4)+트랙B(프레젠테이션7) 등재·브리프·사다리 N 표. docs:check·links 0.
- 2026-07-21 Opus — N1 완료: 3편집 — livekit-token ttl 600→**300**(useLiveKitRoom 재접속 경로 성역 검증: 매 connect 새 토큰·순단 resume → 정상 무영향, 120 은 하드드롭 full-reconnect 회귀라 300 채택) · create-room-invite requireHostRoom 뒤 check_rate_limit('invite:${userId}',20,3600)+429(8사이트 미러) · reap-stale-rooms timingSafeEqual(외부의존 0·길이가드·fail-closed 불변). 검증: deno check ×3 clean · timingSafeEqual 순수로직 4/4 · ttl grep 300 · check:all 0(프론트 무변경). 라이브 통합(invite 21회째 429·reaper bearer 200/401)은 `/배포` 게이트. 정본(webhook token_version)은 후속 골.
- 2026-07-21 Opus — N2 완료: RoomJoinGate onRetry(error 단계 [다시 시도])+RoomPage rejoinNonce(멱등 재조인 effect 재발화)·leaving 가드·retryJoin·친화 에러 매핑(Room ended/not found/full→i18n) + RM-DEADROOM Modal(ready&&!kicked&&!leaving&&DISCONNECTED — RECONNECTING 순단 제외·재연결/Esc=멱등 재조인이 방종료면 'Room ended' error 수렴) + i18n 4키×3. 검증: check:all 165/165·build·docs 0. 실렌더(연결끊김 주입)는 NR 후 통합 실증에서.
- 2026-07-21 Opus — **배포 완료(bepo·주인님 승인)**: 프리플라이트(check:all·deno×3 exit0·_shared 무변경) → Edge 3 배포(livekit-token v16·create-room-invite v11·reap-stale-rooms v6, 오늘 05:51 ACTIVE 실측) → CF Pages(`index-D2hMaF2n.js` 프로드 별칭 해시일치·curl root/asset/deep 200·번들 시크릿 6종+service_role+DEV훅 4종 clean). **프로드 라이브 실증**: `live-verify-n1.mjs` — SEC-INVITE-FLOOD 21회째 429·SEC-REAPER-TIMING 잘못된/빈 bearer 401 fail-closed(2/3, ttl 디코드만 auth 레이트리밋 아티팩트로 차단) + `room-n3-spot.mjs` BASE=프로드 **3/3**(choose 게이트·배우→무대[=livekit-token 유효토큰 발급 실증]·?watch=1 건너뜀). ttl 300 은 배포 v16 소스+deno+함수건전으로 확인. 정본(webhook token_version 검증)은 후속 골.
- 2026-07-21 Opus — **N6 완료·골 종결**: 통합 회귀 — `dub-w2-spot.mjs`(choose 게이트 클릭 패치)로 리팩터된 RoomPage+choose 게이트 통과 dub 완성동선 **4/4**(녹음→Space중지→Enter제출→솔로 자동확정→자동 다음 이동 8.33s→전부확정) = NR 3훅+N1~N5 상호작용 무회귀. 통합 커버리지: N3 조인 3/3 + N5 360px 3/3 + dub 4/4. §0 A-P1f 7 + 트랙B 7 = 14항목 [x]+probe(반증 2: RM-XFER-FEEDBACK·RM-PANEL-360). docs 게이트 3종 0 · GAP-MATRIX 1줄 · AGENT-OPS ISS-10 HANDOFF. 배포는 골 밖(/배포 승인 게이트: Edge 3 보안 + CF Pages 프론트).
- 2026-07-21 Opus — N5 완료(트랙B): RM-STATUS-TEXT(Stage SlotStatus 배지 pill+text-[8px] 라벨·HostConsole qualityText poor/lost 가시텍스트 — 아이콘+색상 단독 스캔부담 완화) · RM-REACT-HINT(reaction.wheelLabel aria 에 "숫자키 1~9·화살표·Enter·Esc" 병기) · RM-VIEWER-VGEN(VgenStatusTab isViewer prop+관전 안내 배너·RoomPage 전달) · RM-BG-PROGRESS(bg 적용중 role=status 텍스트) · RM-PANEL-360(검증). i18n 5키×3(bgApplying/viewerHint/wheelLabel 확장/mutedRemaining은 N4). 검증: check:all 165/165 · **360px 실렌더 `room-360-spot.mjs` 3/3**(무대·DUB탭·VGEN탭 scrollWidth=360 오버플로 0 → RM-PANEL-360 "Likely" 반증).
- 2026-07-21 Opus — N4 완료: RM-POLICY-VALIDATE(금지어 입력 밑 라이브 카운트 "n/50 단어"·>50 경고색+"50개까지만 저장" — slowSec 은 select라 이미 bounded, 검증 불필요) + RM-MUTE-REMAIN(mutedUntilLabel 절대시각 HH:MM → "약 N분 남음"; 렌더 중 Date.now() 금지·effect 동기 setState 금지 두 순수성 룰 우회 = now 상태 30s 틱·초기값 setTimeout(0)) + i18n 3키×3(mutedRemaining/bannedCount/bannedOver). **RM-XFER-FEEDBACK 반증**: `HostConsole.doTransfer` 가 이미 성공 시 `toast.success(t('host.transferDone'))`="방장을 넘겼어요" 를 옛 호스트에 표시 — 정찰의 "무피드백"은 과대(확인모달 오판과 동류). 검증: check:all 165/165·build·docs 0(순수성 lint 2건 정정 후).
- 2026-07-21 Opus — N3 완료: useRoomJoin `roleChoice`(?watch=1→관전 자동·else null→choose 게이트, 자동 배우입장 제거) + `chooseRole` + gatePhase 'choose' · RoomJoinGate choose 단계(배우 primary/관전 secondary 2버튼·백드롭) · SelfAvatar 카메라 불가(ERROR/UNSUPPORTED)시 [관전으로 참여] 버튼(title 처방·?watch=1 window.location.assign 재진입) · i18n 5키×3(chooseRolePrompt/joinAsActor/joinAsViewer/cameraDeniedHint/watchInstead). 검증: check:all 165/165·build·docs 0 · **실렌더 `room-n3-spot.mjs` 3/3**(choose 게이트 노출+자동입장 0·배우→data-stage-area·?watch=1 게이트 건너뜀+관전 도달). 카메라 처방은 동일 ?watch=1 경로(N3c 검증) 재사용이라 구조 검증. 주의: choose 게이트로 기존 하네스 배우클릭 선행(§8).
- 2026-07-21 Opus — **NR 완료(주인님 지적 "RoomPage 너무 큼")**: 3훅 verbatim 추출 — `useRoomJoin`(조인 상태머신·재조인·방종료 판별·140 LOC)·`useReactionWheel`(우클릭/롱프레스/숫자키·82 LOC)·`useRoomAuthority`(broadcast 스위치·dubEditBadgeTimer 흡수·105 LOC). RoomPage **1086→868**(−218·−20%). 안전장치: object-shorthand 로 동일타입 setter 스왑 봉쇄·모듈 임포트(vodSync/stores/toast)는 훅이 직접 써 주입 파라미터 최소화·훅 호출순서 정적. 검증: tsc 0·lint 0·test 165/165·build·docs 0. 2탭 런타임 무회귀는 N6 통합실증. **~600 미달**(estimate 낙관) — 도달하려면 렌더 조립부(topBar/leftDock/rightDock/bottomBar ~250 LOC) 컴포넌트 추출 필요(별도 여지, 이번 스코프 밖).
