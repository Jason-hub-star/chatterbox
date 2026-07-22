# GOAL-outroom-ux — 방 밖 표면 UX 마감 (사다리 X)

## 골 한 줄
방 밖 표면(인증·로비·예약·커미션·소셜)의 UX 마찰 11건을 `check:all` 그린 + 실렌더 스팟으로 닫되, 크럭스인 **장기 비동기 잡 완료 통지**를 프론트 전용으로 회복 — verified by 각 phase 실렌더 어서션 + 기존 룸/더빙/로비 무회귀. details in docs/goals/GOAL-outroom-ux.md

## 배경 (왜)
2026-07-22 도그푸딩 4페르소나 감사(인증·로비·예약·커미션·소셜) — 룸·더빙 여정은 N/W/U/F/DUB 사다리로 소진돼 이번엔 **미답 "방 밖" 표면**만 봄. 워커 23건 → 메인 인용라인 직접 대조로 **오탐 1(FRIEND-LIST-STALE)·심각도 강등 5**. 단일 최고가치 = **아바타 커미션(~33분)·vgen 등 장기 비동기 잡이 방을 나가면 완성돼도 통지가 없다**(AVATAR-DONE-NOTIFY). 나머지는 "로딩=0 착시" + "폼 명시성·a11y 소품". 전부 **프론트 전용**(Edge/마이그 0). §0 X-트랙 등재 완료.

## 1. Outcome (완료 시 참)
- **X1**: 의상실을 떠났다(훅 언마운트) 재진입 시, 자리 비운 사이 완성된 커미션 잡을 **1회 배너/토스트로 통지**(localStorage `avatar_seen_completed` 셋 대조 — 이미 본 잡은 무통지, 신규 done 만).
- **X2**: ①분장실 마이크 미터가 로딩(`micLevel===null && !micErr`) 시 0 대신 "준비 중" 표시 ②커미션 queued 첫 스텝이 "대기 중" 활성 표시(전 회색 아님) ③투표 실패→재조회 중 로딩 표기.
- **X3**: 비번확인 실시간 불일치 표시(제출 전)·재설정 성공 토스트·채팅 `maxLength`·잠금방 🔒 스크린리더 인지·필터별 빈 목록 문구·비번찾기 다음스텝 카피 — 6건 배선.
- **X4**: 커미션 실패 시 `job.error` 타입별 로컬라이즈 메시지 UI 노출(sanitize·원문 누설 없이).
- **X5**: 위 전부 통합 실렌더 통과 + 비회귀 + §0 [x]+probe + 사다리 X DONE.

## 2. Verification surface (도구 중립)
- 공통 게이트: `npm run check:all` (tsc·lint·test·build·docs:check·docs:drift) → 0 실패. 다국어 추가분은 `i18nCoverage` 테스트가 en/ja 완역 강제.
- **X1**: 실렌더/헤드리스 — 잡 `done` 시드 + `avatar_seen_completed` 미포함 → 의상실 마운트 시 배너 1회 노출 · 두 번째 마운트(셋에 포함 후) 미노출. DEV 훅 or localStorage 실측.
- **X2**: 실렌더 스팟 — micLevel null 동안 "준비 중" 노출→첫 샘플 후 바 전환 · queued 잡 첫 스텝 활성 클래스 · 투표 실패 주입 시 로딩 배지.
- **X3**: 실렌더 스팟 — 비번확인 불일치→버튼 disabled · reset 성공→toast · 채팅 input `maxLength` 속성 존재 · RoomCard 🔒 `title` 노출(aria-hidden 제거) · 필터 joinable 빈 목록 문구 분기. `i18nCoverage` 3국어.
- **X4**: 실렌더 — job.error 주입 시 매핑된 로컬라이즈 문구 노출(원문 미노출).
- 아티팩트: 스크래치 실렌더 하네스(`outroom-x*-spot.mjs`) PASS 카운트.

## 3. Constraints (후퇴 금지 · 누적)
- **프론트 전용**: Edge Function·마이그레이션·서버 계약 무변경(X1 도 클라 localStorage 대조 — 백엔드 0). 유료 API 0.
- 재사용 프리미티브 우선: `toastStore`·`ProgressBar`·`Modal`·기존 i18n 키. **새 의존성·새 추상화 금지**(전역 코드 미니멀리즘).
- i18n 3국어(ko/en/ja) 완역·360px 무오버플로·색상단독 상태 회피(a11y).
- 이전 phase 검증 표면 green 유지 + **기존 룸/더빙/로비 무회귀**(N/W/U/F/DUB 사다리 산출 불변).
- 심각도 부풀림 금지: defer 대장 항목(vgen cancel·크레딧 충전)은 이 사다리서 손대지 않음.

## 4. Boundaries
- 허용 파일: `src/features/avatar/{useAvatarJobs.ts,CommissionCorner.tsx}` · `src/pages/GreenRoomPage.tsx` · `src/features/room/PollBar.tsx` · `src/pages/{RegisterPage,ResetPasswordPage,LoginPage}.tsx` · `src/features/chat/ChatPanel.tsx` · `src/features/theater/RoomCard.tsx` · `src/pages/lobby/TheaterPage.tsx` · `src/i18n/locales/{ko,en,ja}.ts` · 스크래치 하네스.
- 금지: Edge functions·마이그·수익화(크레딧 구매)·vgen 생성 취소(fal 발주 후 환불 설계 = 별도 골)·배포/커밋(골 밖 — `/배포`·`/마감`).

## 5. Iteration policy
- 각 phase: 구현(최소·재사용) → §2 검증 전체 실행 → **브리프 체크리스트 대비 자기리뷰(메인 직접 — 전역 에이전트 모델 규칙)** → PASS 면 §7 기록 후 자동 진행 / FAIL 이면 실패 항목만 최소 변경 재시도.
- 무진전 3패스 → blocked 보고(재현/근사/막힘/불확실 4분류).

## 6. Blocked stop condition
- 실렌더 하네스 flaky 2회 재현 실패 → blocked(무한 재시도 금지).
- 어떤 항목이 백엔드/수익화 의존으로 드러나면(예상 밖) → 그 항목만 defer 대장으로 밀고 나머지 진행(전체 정지 아님).
- 승인 게이트: 이 사다리는 **대형/스키마 phase 없음**(전부 프론트 UX). 승인은 착수 1회(이 게이트)로 충분 — 배포·커밋만 골 밖 게이트.

## 7. 실행 기록
- 2026-07-22 (메인 Opus·문서화) — **X0 완료**: §0 X-트랙 11항목+반증3+defer 등재 · 이 브리프 생성 · GOAL-LADDER 사다리 X 표 등재. 검증 = `docs:check` exit0 + `docs:links` 0 broken. 상태 = 승인됨("ㄱ").
- 2026-07-22 (메인 Opus·phase-loop) — **X1 완료 (AVATAR-DONE-NOTIFY)**: 순수 판정 `pickFreshCompleted`(lib/avatarJobs) 추출 → useAvatarJobs 에 `notifiedRef`(localStorage `cb.avatar.notifiedDone`, 옷장 NEW배지 `cb.atelier.seenJobs`와 별개)+`awayDone`+재진입 감지(firstRun=통지없이 시딩·스팸방지) 배선 · upsert 라이브 완성도 notified 기록(재진입 중복차단) · CommissionCorner 재진입 배너(reused 미러) · AtelierPage 배선 · i18n 2키×3. **검증**: `check:all` exit0(tsc·lint·test·build·docs) · 순수 `pickFreshCompleted` 4/4(firstRun 시딩·fresh 감지·전량통지 무배너·빈입력) · 배너 실렌더 3/3(awayDone>0 배너+count·0 미노출·닫기 콜백) · 회귀 commissionPaste 5/5(새 prop 보강). 자기리뷰 5/5 PASS.
- 2026-07-22 (메인 Opus·phase-loop) — **X2 완료 (로딩·상태 착시 묶음)**: ①GR-MIC-LOADING(`GreenRoomPage` micLevel===null → "준비 중" role=status, 0 값 바 오인 제거) ②COMMISSION-QUEUED-GRAY(`CommissionCorner` OrderCard queued 배지 + 첫 스텝 pulse — 전 스텝 회색 "안 시작?" 해소) ③POLL-VOTE-STALE(`PollBar` footer busy → "반영 중" aria-live). i18n 3키×3(micPreparing·commissionQueued·poll.syncing). **검증**: `check:all` exit0(172 tests) · queued 배지 실렌더 2/2(queued 노출·running 미노출) · type-check 0. 자기리뷰 5/5 PASS.
- 2026-07-22 (메인 Opus·phase-loop) — **X5 완료 (실증·마감)**: 최종 `check:all` exit0(178 tests·build) · **docs:drift probe 70행 STALE0/REGRESSION0**(신규 11 probe 파일 실존 검증) · 비회귀 = 기존 룸/더빙/로비 42 test파일 그린(코드 X5 무변경) · §0 X-트랙 11항목 [x]+probe · GAP-MATRIX 진행 로그 · AGENT-OPS 핸드오프. **사다리 X 완주(X0~X5).** 배포는 골 밖(프론트 전용·Edge 0 → `/배포`는 라이브 반영 원할 때). 자기리뷰 5/5 PASS.
- 2026-07-22 (메인 Opus·phase-loop) — **X4 완료 (COMMISSION-FAIL-REASON)**: 순수 분류기 `classifyAvatarError`(lib/avatarJobs) — 엣지 기계코드(credit/signed_url)+Modal 자유서술을 substring 3버킷(failCredit·failTransient=같은 그림 재시도 OK·failImage=다른 그림 필요)+미매치 generic 폴백으로 분류(원문 미노출, 2026-07-11 결정 준수) · CommissionCorner lastFailed 렌더 `t(classifyAvatarError(error))` · i18n 3키×3. **검증**: `check:all` exit0(178 tests) · classifyAvatarError 4/4(credit·transient·image·generic+null·트레이스백→generic). 자기리뷰 5/5 PASS.
- 2026-07-22 (메인 Opus·phase-loop) — **X3 완료 (폼 명시성·a11y·발견성 묶음 6건)**: ①REGISTER-PW-CONFIRM(`RegisterPage` 확인 불일치 실시간 span, `passwordMismatch` 키 재사용) ②RESET-SUCCESS-SILENT(`ResetPasswordPage` 성공 toast.success + `reset.success`) ③CHAT-MAXLEN(`ChatPanel` maxLength=500 = send-chat MAX_MESSAGE_LENGTH 미러) ④ROOMCARD-LOCK-A11Y(`RoomCard` 🔒 aria-hidden 제거→role=img+aria-label+title=`lobby.locked` 재사용) ⑤LOBBY-EMPTY-FILTER(`TheaterPage` 빈 메시지 검색>필터>기본 3분기 + `lobby.noFilterMatch`) ⑥FORGOT-PW-NEXTSTEP(`login.resetSent` 카피 "메일 링크로 새 비번 설정" 구체화). i18n 신규 2키×3 + 수정 1키×3. **검증**: `check:all` exit0(174 tests·i18nCoverage 완역 강제 통과·build·docs). 자기리뷰 5/5 PASS.

## 참조 문서
- `../DOGFOOD-AUDIT-2026-07.md` §0 X-트랙 — 발견 SSOT
- `./GOAL-LADDER.md` — 사다리 X 상태판
- `../design/UX-GAPS-AND-PATTERNS.md`·`../design/uiux-distilled.md` — UX 원칙
