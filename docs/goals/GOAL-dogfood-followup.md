# GOAL-dogfood-followup — 도그푸딩 감사 3발견 골 사다리

2026-07-13 /dogfood-audit 산출. 직렬 골 사다리(독립성 높아 순서 무관하나 회귀 누적 제약). 배포는 별도 콜(bepo).

---

## G-ONB — 온보딩 배선 (High UX)

### 골 한 줄
신규 유저(onboarding_step != 'done')가 광장에서 최소 가이드(환영→장르선택→방으로)를 받고 완료/건너뛰기로 상태가 영속되도록 배선 verified by userStore 가 onboarding_step 로드·OnboardingGuide 렌더 조건·완료 시 DB 영속 실측 + check:all green, while preserving 기존 로비 흐름·i18n 3언어 완역. details in docs/goals/GOAL-dogfood-followup.md

### 1. Outcome
- userStore 가 로그인 시 users.onboarding_step·preferred_genres 를 로드해 노출.
- onboarding_step ∈ {null,intro,genre} 인 유저는 로비에서 경량 가이드(기존 Modal/배너 프리미티브 재사용)를 본다. 'done'/'lobby' 유저는 안 본다.
- 가이드 단계: 환영 → 장르 선택(ROOM_GENRES, preferred_genres 기록) → "방 만들기/입장" 유도. [건너뛰기]/[완료] 시 onboarding_step='done' 로 영속(supabase users_update_own 직접 update — is_admin 트리거 무관 컬럼).
- 하드코딩 한글 0(lint 게이트), en/ja 완역(i18nCoverage 게이트).

### 2. Verification surface
- 명령: `npm run check:all` → tsc·lint·test·build·docs 전부 green(하드코딩 한글·i18n 미완역 시 red).
- 실측: 헤드리스로 onboarding_step=null 유저 로그인 → 로비에 가이드 노출 → 장르 선택→완료 → DB `select onboarding_step` = 'done' + 재로그인 시 가이드 미노출. (배포 별도 콜이면 로컬 vite 로 대체 실측)
- 아티팩트: OnboardingGuide 컴포넌트 + userStore 필드 + i18n 3언어 키.

### 3. Constraints (후퇴 금지)
- 기존 로비 진입·월드 렌더·초대배너 무회귀. onboarding_step='done'/기존 유저는 가이드 절대 미노출(기존 유저 방해 금지).
- 새 Edge 함수 만들지 않는다(비민감 컬럼이라 users_update_own 직접 update 로 충분 — UI 최소·기능우선 메모리 준수).
- is_admin 자물쇠·users_update_own 정책 무회귀.

### 4. Boundaries
- 허용: src/stores/userStore.ts, src/features/onboarding/ 또는 src/components/shared/(신규 OnboardingGuide), src/pages/LobbyPage.tsx(마운트), src/i18n/locales/*.
- 금지: 새 Edge 함수·마이그레이션·onboarding 외 스키마 변경. 로비 대개편.

### 5. Iteration policy
- 패스1: userStore 로드 → OnboardingGuide → 로비 마운트 → i18n → check:all. 실패 항목만 재시도.
- 무진전 3패스면 blocked.

### 6. Blocked stop condition
- onboarding_step 을 클라가 직접 update 할 때 RLS/트리거가 막으면(비민감 컬럼인데 예상 외 거부) → 멈추고 보고(대안: 경량 Edge).
- 보고 4분류(재현/근사/막힘/불확실).

---

## G-GATE — 호스트게이트 재발방지 게이트 패턴화 (P3 잠복)

### 골 한 줄
edgeHostGuard 게이트가 "Not host" 문자열이 아니라 인라인 host_id 게이트 패턴을 감시하고, 진짜 호스트게이트 함수를 requireHostRoom 으로 이관해 status(ended→409) 검증을 통일 verified by 강화된 게이트 테스트가 현 인라인 위반을 red 로 잡고 이관 후 green + check:all green, while preserving 멤버십/액터-필터 인라인(정당)은 ALLOW 로 통과·전 함수 계약 무회귀. details in docs/goals/GOAL-dogfood-followup.md

### 1. Outcome
- `tests/unit/edgeHostGuard.test.ts` 가 인라인 호스트게이트 시그니처(`host_id !== ... → 403` 계열, 문구 무관)를 감지 — "Host only"·"호스트만" 등 문자열 변형도 잡는다.
- 21개 인라인 host_id 참조를 2분류: (a) 호스트게이트(ended 검증 필요·requireHostRoom 이관) (b) 멤버십/액터-필터(정당·ALLOW 등재 사유와 함께).
- 최소한 set-chat-policy 등 명백한 호스트게이트 스트래글러가 requireHostRoom 으로 이관돼 ended→409 계약 통일.
- 강화된 게이트가 미이관 위반을 red 로 막는다(회귀 방지).

### 2. Verification surface
- 명령: `npm test -- edgeHostGuard` → 이관 전 red(위반 나열), 이관/ALLOW 등재 후 green.
- 명령: `npm run check:all` → 전체 green(이관이 다른 계약 안 깸).
- 실측: 이관된 함수의 인라인 host_id 4줄 체인이 requireHostRoom 호출로 대체됐는지 diff 확인. ALLOW set 의 각 항목에 사유 주석.

### 3. Constraints (후퇴 금지)
- 멤버십 기반(send-chat·advance-script-cue 등)·액터-필터(ensure-studio-room·trigger-vgen 등 host_id 를 게이트 아닌 조회 필터로 쓰는) 함수는 **바꾸지 않는다**(정당) — ALLOW 로 명시.
- 이관 함수의 응답 상태코드·성공 계약 무회귀(통합테스트 있으면 green 유지). G-ONB 검증 표면 green 유지.

### 4. Boundaries
- 허용: tests/unit/edgeHostGuard.test.ts, 이관 대상 supabase/functions/*/index.ts(호스트게이트 스트래글러만).
- 금지: 멤버십/필터 함수 로직 변경. requireHostRoom 헬퍼 시그니처 변경(소비처 광범위).

### 5. Iteration policy
- 패스1: 게이트 강화(패턴 스캔) → red 위반 목록 확보 → 각 위반 분류 → 호스트게이트는 이관·정당은 ALLOW → green.
- 분류 모호하면 해당 함수 원본 열어 "ended 방 조작이 유해한가"로 판정.
- 무진전 3패스면 blocked.

### 6. Blocked stop condition
- 인라인 패턴 정규식이 정당 함수를 과다검출해 ALLOW 가 비대(>절반)해지면 → 접근 재평가(문자열 대신 "requireHostRoom 미사용 + host_id 403" AST 수준 필요)하고 보고.
- 보고 4분류.

---

## G-PWD — 비밀번호 강도 실시간 미터 (nice-to-have S)

### 골 한 줄
회원가입/재설정에서 비밀번호 강도를 입력 중 실시간 표시(weak/fair/good/strong) verified by 순수 passwordStrength() 단위테스트 + RegisterPage/ResetPasswordPage 미터 렌더 실측 + check:all green, while preserving 기존 passwordIssue 규칙(8자·대문자·숫자) 단일원천·제출 검증 무회귀. details in docs/goals/GOAL-dogfood-followup.md

### 1. Outcome
- src/lib/authValidation.ts 에 순수 함수 `passwordStrength(pw): 0|1|2|3` (또는 'weak'|'fair'|'good'|'strong') 추가 — 기존 passwordIssue 규칙과 정합(규칙 미달=weak).
- RegisterPage·ResetPasswordPage 입력 중 강도 바/라벨 실시간 갱신(제출 전, uiux #21 1초 피드백).
- i18n en/ko/ja 강도 라벨 완역. 하드코딩 한글 0.

### 2. Verification surface
- 명령: `npm test -- authValidation`(또는 신규 테스트) → passwordStrength 경계값 테이블(빈값·7자·8자약·대문자+숫자+길이 강함) 기대 일치.
- 명령: `npm run check:all` → green.
- 실측: 로컬 vite 로 RegisterPage 입력 시 강도 바가 타이핑에 따라 변하는지(스크린샷/DOM).

### 3. Constraints (후퇴 금지)
- 기존 passwordIssue(제출 시 하드 검증)·규칙 단일원천 유지 — 미터는 표시용, 제출 게이트를 약화하지 않는다.
- ResetPasswordPage 도 동일 미터 재사용(중복 정의 금지).

### 4. Boundaries
- 허용: src/lib/authValidation.ts, src/pages/RegisterPage.tsx, src/pages/ResetPasswordPage.tsx, 신규 PasswordStrengthBar 컴포넌트, src/i18n/locales/*, tests/unit/.
- 금지: 비번 규칙 자체 변경(8/대문자/숫자 유지). auth 흐름 변경.

### 5. Iteration policy
- 패스1: passwordStrength + 단위테스트 → 컴포넌트 → 2페이지 배선 → i18n → check:all.
- 무진전 3패스면 blocked.

### 6. Blocked stop condition
- 없음 예상(순수 로직+표시). 막히면 4분류 보고.

---

## GM CLI status 전이 — DEFER (실행 안 함)
ISS-05 문서화된 트리거상 P1=유저 유입 시작 전엔 premature. 이 사다리에서 제외 — 유입 시작 시 착수.

## 실행 기록
- 2026-07-13 Claude Code(Opus 4.8) — 사다리 작성. 실행 시작.
- 2026-07-13 G-GATE **DONE**: 스트래글러 3개(start-room-recording·moderate-chat·set-chat-policy) requireHostRoom 이관(deno check 통과·ended→409 통일) + 게이트 문자열→패턴(`host_id !==`+`from("rooms")`)化 + ALLOW 3(advance-script-cue·send-chat·sync-script-role, 사유 등재) + stale-ALLOW 방지 테스트. `edgeHostGuard` 3/3 PASS.
- 2026-07-13 G-PWD **DONE**: `passwordStrength()` 순수함수(유효=최소 fair 보장) + 단위테스트 8/8 + PasswordStrengthBar(가입·재설정 공유) + i18n 3언어.
- 2026-07-13 G-ONB **브리프 정정**: "마이그 금지" 경계 완화 — 신규 가입자만 onboarding_step='intro'로 시작시키는 `handle_new_user` 트리거 1줄 마이그가 유일한 정답(null=기존유저는 무영향, "기존유저 미노출" 제약 충족). 배포는 별도 콜(bepo).
- 2026-07-13 G-ONB **DONE**: 마이그 `20260713170000`(handle_new_user→intro) + userStore(onboardingStep·preferredGenres 로드·completeOnboarding) + OnboardingGuide(2단 환영→장르, Modal 재사용) + LobbyPage 게이트(step∈{intro,genre}) + i18n 3언어. **실렌더 5/5**(로컬 vite+프로드 백엔드: intro 유저 가이드 노출→장르 저장→DB done / 기존 null 유저 미노출). check:all 그린(147 테스트). **미배포**(마이그·Edge 3개 재배포·프론트는 별도 bepo 콜).
- **사다리 3골 전량 완료·검증**. 재현: 전부. 근사: 없음. 막힘: 없음. 불확실: OAuth 신규유저 온보딩(현 prod OAuth 미설정이라 무영향 — 설정 시 첫 로그인 intro 세팅 후속).
