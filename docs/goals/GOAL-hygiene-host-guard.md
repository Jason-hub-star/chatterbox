# GOAL-hygiene-host-guard — Edge 호스트게이트 중복 제거 + 위생 잔재 정리

> 근거: 2026-07-12 "사람이 유지보수할 것처럼" 위생 스캔 — host_id 검증이 34파일·84곳에 산개,
> 그중 텍스트 동일한 4줄 체인(rooms fetch→404→409→403)이 7~8개 함수에 복사됨.
> 공유 헬퍼 부재 = 다음 신규 함수가 복사본을 또 늘리는 구조. 이 골이 그 사슬을 끊는다.

## 골 한 줄 (Codex 투입 시 `/goal ` 접두 그대로 사용)

```
/goal Edge 호스트게이트 중복 제거: _shared/supa.ts에 requireHostRoom 신설·동일패턴 함수 치환(아래 목록) + _grid_poc.mjs 삭제 + CLAUDE.md Edge 함수 수 정정 — verified by 게이트 4종 green + 로컬 serve 404/409/403 프로브 치환함수 전수 일치, while preserving 응답 계약(status·error 문자열) 불변·범위 외 함수 무수정·push/deploy 금지. details in docs/goals/GOAL-hygiene-host-guard.md
```

## 1. Outcome (완료 시 참이어야 할 것)

- `supabase/functions/_shared/supa.ts`가 `requireHostRoom(service, roomId, userId, extraCols?)`를 export:
  - room 없음 → `{ error: "Room not found" }` **404**
  - `room.status === "ended"` → `{ error: "Room ended" }` **409**
  - `room.host_id !== userId` → `{ error: "Not host" }` **403**
  - 통과 시 room 행 반환 (`extraCols`로 함수별 추가 컬럼 select 지원)
- 아래 **치환 대상** 함수의 인라인 4줄 체인이 0벌 — 전부 헬퍼 import 로 대체:
  1. `set-script-mode` 2. `set-room-background` 3. `set-room-mode` 4. `kick-participant`
  5. `set-participant-mute` 6. `invite-to-stage` 7. `set-room-password`
  8. `create-room-invite` (select 에 `title` 추가 변형 — `extraCols`로 흡수 가능할 때만, 아니면 제외·보고)
- 루트 `_grid_poc.mjs` 삭제됨 (미추적 파일, 주석에 "삭제 예정" 명시).
- `CLAUDE.md`의 "Edge 함수 33" → 실측값으로 정정 (`ls supabase/functions | grep -v _shared | wc -l` = 65, 실행 시점 재실측). 같은 괄호의 "마이그 14"도 `ls supabase/migrations | wc -l` 실측과 다르면 함께 정정.

## 2. Verification surface

- 게이트 4종: `npm run lint` · `npm run type-check` · `npm run test`(현 112개 기준, 감소 금지) · `npm run docs:check` → 전부 green.
  (주의: eslint 는 supabase/functions 를 ignore, tsc 는 src/ 만 커버 — Edge 코드의 실검증은 아래 프로브가 담당. `deno check`는 `npm:` import 로컬 미해결로 요구하지 않음.)
- **로컬 serve 프로브**: `supabase functions serve` 후 치환된 각 함수에 3케이스 호출 —
  ① 존재하지 않는 roomId → 404 ② ended 방 → 409 ③ 비호스트 토큰 → 403.
  status 코드와 `error` 문자열이 치환 전과 **바이트 동일**해야 PASS.
  프로브 스크립트는 `tests/integration/` 기존 .mjs 관례를 따라 존치하거나, 임시 파일이면 실행 후 삭제.
- 아티팩트: 치환 전후 diff 요약(함수별 삭제 줄 수)과 프로브 결과표를 완료 보고에 포함.

## 3. Constraints (후퇴 금지)

- 응답 계약 불변: 치환 함수의 status 코드·에러 문자열·성공 응답 shape 을 한 글자도 바꾸지 않는다.
- 치환은 **응답 계약이 완전 동일한 곳만**. 의미가 갈라진 변형(예: `advance-script-cue` — select 필드·메시지 상이)은 치환하지 말고 제외 목록으로 보고.
- 기존 테스트 112개 green 유지, 신규 실패 0.
- 커밋은 작업 단위별 허용하되 `git add`는 **명시 파일 목록만** (같은 워크트리 병행 세션 있음 — 스윕 add 금지). **push · `supabase functions deploy` · DB 마이그레이션 금지** (배포는 골 밖 승인 게이트).
- `.env` 값을 콘솔/로그에 출력 금지 (grep 대신 awk/cut).

## 4. Boundaries

- 허용: `supabase/functions/_shared/supa.ts` · 위 치환 대상 8개 함수의 `index.ts` · `CLAUDE.md`(함수/마이그 수 한 줄) · `_grid_poc.mjs`(삭제) · `tests/integration/`(프로브).
- 금지: `livekit-token`(의도적 격리 — 공개 배포 함수) · `vgen-webhook` · 그 외 미치환 함수 57개 · `src/`(RoomPage 분해는 명시적 범위 제외) · `supabase/migrations/` · `docs/`(본 파일 제외).
- 새 파일 최소: 헬퍼는 새 파일이 아니라 기존 `_shared/supa.ts`에 추가 (circular import 발생 시에만 `_shared/roomGuard.ts` 분리 허용).

## 5. Iteration policy

- 매 패스: 게이트 4종 + 프로브 전체 실행 → 실패 항목만 최소 변경으로 재시도.
- 함수 1개 치환 → 프로브 → 다음 함수 순서 (일괄 치환 후 일괄 검증 금지 — 실패 지점 격리).
- 무진전 3패스 → blocked 판정.

## 6. Blocked stop condition

- `supabase functions serve` 로컬 기동 불가(키/환경) → 멈추고 환경 상태 보고.
- 치환 대상이 텍스트 동일하지 않고 의미 분기 발견 → 그 함수는 건너뛰고 제외 사유 보고 (골 실패 아님).
- 게이트 red 가 본 작업과 무관한 원인 → 고치지 말고 멈춰서 보고 (범위 밖 수리 금지).
- 완료 보고 형식: **재현됨(치환+프로브 PASS) / 근사됨 / 막힘 / 불확실** 4분류.

## 7. 실행 기록

- **2026-07-12 Claude Code(Fable 5) — 패스 1: 완료(재현됨).**
  - ① `_shared/supa.ts`에 `requireHostRoom`(+`HostRoom` 타입) 신설, 8함수 전수 치환(set-script-mode·set-room-background·set-room-mode·kick-participant·set-participant-mute·invite-to-stage·set-room-password·create-room-invite[extraCols "title"]). 함수별 `deno check --node-modules-dir=auto` 8/8 클린. ② `_grid_poc.mjs` 삭제(헤더 "임시 PoC" 실확인). ③ CLAUDE.md "Edge 함수 33·마이그 14"→"65·35"(양쪽 `ls | wc -l` 실측).
  - **프로브(로컬 serve): 24/24 PASS** — 비호스트 토큰으로 8함수 × {없는방→404 "Room not found" · ended방→409 "Room ended" · live방→403 "Not host"}, status·error 문자열 치환 전 리터럴과 동일. 시드(유저2·방2)는 finally 정리. 스크립트는 스크래치 임시(host-guard-probe.mjs, 세션과 함께 소멸).
  - 게이트: lint PASS · test **131/131** · docs:check PASS · **type-check red = 범위 밖(막힘 아님·보고)** — 병행 세션의 G3 녹화 작업 미완 상태(src/ 7파일 수정 중, HEAD엔 `loadRecordings` 부재 확인)로 인한 오염. 본 변경은 src/ 무접촉이라 인과 없음.
  - 미치환 잔여: `advance-script-cue`(select 필드·활성체크 상이 — 브리프 계약대로 제외), 조인 경유 변형(dub 계열)은 후속.
  - 배포/푸시 안 함(골 경계). 라이브 반영은 치환 8함수 `functions deploy` 필요.

- **2026-07-12 Claude Code(Fable 5) — 패스 2: 재발 방지 게이트 추가(재현됨).**
  - `tests/unit/edgeHostGuard.test.ts` 신설 — `"Not host"` 계약 리터럴은 `_shared/supa.ts`(requireHostRoom)에서만 허용, Edge 함수 인라인 복사 부활 시 test red. 정당 변형은 사유와 함께 ALLOW 등재(현재 sync-script-role 1건 — 호스트체크가 assign 액션 조건부라 통째 치환 불가, 스캔이 놓친 9번째 후보를 게이트 설계 중 발견·판정).
  - test 133/133(+2). "Room not found"+"Room ended"만 쓰는 참가자 게이트 10함수는 별도 체인(후속 골 후보 — requireActiveRoom)으로 오탐 없이 구분됨.

## 범위 제외 (후속 골 후보)

- RoomPage(1065줄) 분해 — 다음 룸 기능 세션에서 부위별.
- broadcastData try/catch 8벌 · TextEncoder 인코딩 13벌 · `.neq("state","left")` 26벌 — requireHostRoom 정착 후 같은 패턴으로.

## 참조 문서

- `docs/DOGFOOD-AUDIT-2026-07.md` §0 (현 최우선 백로그 — 이 골은 보안 하드닝 트랙의 위생 보강)
- `supabase/functions/_shared/supa.ts` (getAppUser·json·cors 기존 헬퍼)
- `.claude/skills/supabase-slice-verify/` (로컬 serve 함정: 재시작·키 파일화 등)
