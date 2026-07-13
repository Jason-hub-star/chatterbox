# GOAL-admin-selfpromo-lock — is_admin 셀프 승격 차단 + 어드민 콘솔 트리거 문서화

## 골 한 줄
일반 유저가 `users.is_admin` 을 스스로 true 로 못 바꾸게 차단(service_role/postgres 는 유지) verified by 프로드에서 authenticated 셀프 승격 시도 실패 + service_role 변경 성공 + 기존 프로필 업데이트(avatar_url) 무회귀 실측, while preserving 어드민 콘솔 UI 미구현(로드맵 defer) 유지. details in docs/goals/GOAL-admin-selfpromo-lock.md

## 1. Outcome
- 프로덕션 `public.users` 에 BEFORE UPDATE 트리거가 존재해, `current_user in ('authenticated','anon')` 인 세션이 `is_admin` 값을 변경하려 하면 예외로 거부한다.
- `service_role`(Edge)·`postgres`(psql/마이그레이션)는 `is_admin` 을 정상 변경할 수 있다 — 미래 GM 승격 경로 보존.
- 어드민 콘솔(`/admin`) UI·라우트·is_admin 배선은 **여전히 0** — 이 골은 자물쇠만 설치, 문 뒤 방은 안 짓는다.
- GAP-MATRIX 에 어드민 콘솔의 P1(GM CLI status 전이)·P2(콘솔 UI) 착수 트리거 조건이 명문화된다.

## 2. Verification surface
- 마이그: `supabase db push` 성공 → psql 로 트리거 실존 실측:
  `select tgname from pg_trigger where tgrelid='public.users'::regclass and tgname='guard_users_is_admin';` → 1행
- 프로드 실증 스크립트(`scratchpad/selfpromo-e2e.mjs`) — 3판정:
  1. 신규 authenticated 유저가 PostgREST 로 자기 행 `is_admin=true` UPDATE → **거부**(에러 또는 미반영, 재조회 시 is_admin=false)
  2. 같은 유저가 `avatar_url` UPDATE → **성공**(무회귀)
  3. service_role 로 그 유저 `is_admin=true` UPDATE → **성공**, 직후 false 로 원복
- 어드민 콘솔 부재 유지: `grep -r "/admin" src/app/App.tsx` → 0 매치
- `npm run docs:check && npm run docs:drift` → PASS, STALE/REGRESSION 0

## 3. Constraints (후퇴 금지)
- 기존 `users_update_own` 정책·`avatar_url`/`last_active_at` 클라 업데이트 경로 무회귀(프레즌스·아바타 착용 정상).
- `is_admin` 외 컬럼은 트리거가 건드리지 않는다 — 컬럼 화이트리스트 방식(REVOKE/GRANT 열거) 금지(누락 회귀 위험).
- 어드민 콘솔 UI 를 만들지 않는다(로드맵 defer 유지) — 이 골은 스키마+문서만.
- `npm run check:all` 그린 유지.

## 4. Boundaries
- 허용: `supabase/migrations/` 신규 파일 1개, `docs/GAP-MATRIX.md`, `docs/status/AGENT-OPS.md`(ISS-05 갱신), `scratchpad/` 검증 스크립트.
- 금지: `_shared/supa.ts`·Edge 함수·프론트 라우트·src/ 어드민 화면 신설. users 테이블의 다른 컬럼 권한 변경.

## 5. Iteration policy
- 패스 1: 트리거 마이그 작성 → push → psql 트리거 실존 → 3판정 스크립트. 실패 판정만 다음 패스 대상.
- 트리거 role 판정이 SECURITY DEFINER 함정(current_user=owner)에 걸리면 SECURITY INVOKER 로 수정 후 재검(known 함정).
- 무진전 3패스면 blocked.

## 6. Blocked stop condition
- PostgREST authenticated 세션에서 `current_user` 가 예상('authenticated')과 다르게 나와 role 게이트가 성립 안 하면 → 멈추고 보고(대안: 컬럼 REVOKE 방식 재평가).
- 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실 4분류.

## 7. 실행 기록
- 2026-07-13 Claude Code(Opus 4.8) — 패스 1 **DONE**: 마이그 `20260713150000_guard_is_admin.sql` push(prod, exit 0) → psql 트리거 실존 + prosecdef=false 확인 → 실증 스크립트(`scratchpad/selfpromo-e2e.mjs`) **6/6 PASS**(셀프승격 42501 거부·DB 미반영·avatar_url 무회귀·no-change 통과·service_role 성공·원복). `grep /admin src/app/App.tsx` = 0(콘솔 부재 유지). 재현됨: 자물쇠 3판정 전부. 근사됨: 없음. 막힘: 없음. 불확실: 없음.

## 참조 문서
- docs/ops/MODERATION-OPS.md — 어드민 역할·신고 처리 절차(G-147, 설계 완비)
- docs/specs/security/reporting-logging-feedback.md §16.6·§18 — 피드백/신고 데이터 계약
- docs/status/AGENT-OPS.md ISS-05 — 이 지뢰의 기원 기록
