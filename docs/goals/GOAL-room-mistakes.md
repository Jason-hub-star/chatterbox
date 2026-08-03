---
tags: [goals]
---

# GOAL-room-mistakes — 룸페이지 실수 시나리오 P0 수복 (사다리 AB)

## 골 한 줄

룸페이지 실수 시나리오 감사(2026-08-02, A-P1g)의 P0 5건(게스트 크래시·잠금방 역할·FAILED 데드엔드·생성 더블클릭·강퇴 카피)이 실브라우저 재현 스크립트로 소멸 verified by `npm run check:all` + 헤드리스 재현 스크립트 그린 while preserving 기존 스위트 green·SEC 방어·i18n 완역. details in docs/goals/GOAL-room-mistakes.md

## 1. Outcome (phase별 이진 판정)

- **AB1 RM-GUEST-CRASH**: 익명 게스트 방 입장 시 pageerror 0 · `list-room-members`가 익명 참가자에게 200(비멤버는 여전히 차단) · DUB 탭 크래시 없이 로드.
- **AB2 RM-LOCK-ROLE**: 뷰어 의도(?watch=1)로 잠금방 진입 시 비번 게이트 미노출·"초대로만 관전" 안내 노출·배우 승격 0 · 배우 의도 비번 경로는 기존 유지 · 비번 실패 사유 분기(오답/429/기타)가 다른 문구.
- **AB3 RM-FAILED-DEADEND**: livekit-token 5xx 시 로컬라이즈 모달([재연결]/[로비로]) 노출·영문 원문 미노출(콘솔만) · [재연결]로 정상 복구.
- **AB4 RM-CREATE-DBL**: 방 생성 더블클릭 → rooms 1행 · 무대초대 수락·배경 적용 연타 → 요청 단발.
- **AB5 RM-KICK-COPY**: kickConfirmBody 3로케일이 실동작(재입장 불가)과 일치·i18nCoverage 완역.
- **AB6 마감**: 재현 스크립트 일괄 그린 + §0 [x]+probe + 사다리 표 DONE.

## 2. Verification surface

- 공통: `npm run check:all` → exit 0 (tsc·lint·test·build·docs:check·docs:drift·docs:links).
- Edge 변경 phase: `deno check supabase/functions/<fn>/index.ts` → clean.
- 실렌더: 헤드리스 Chrome(playwright-core)+로컬 livekit-server(`tests/integration/helpers/livekit-local.mjs`) 재현 스크립트 — 감사와 동일 하네스. 각 phase Outcome의 어서션 전부 PASS. 스크립트는 스크래치(레포 외)에서 실행하되 §7에 어서션·결과를 기록.
- 클라우드 LiveKit 차감 0 유지(routeLiveKitLocal 필수 — CLAUDE.md LiveKit 한도 보호).

## 3. Constraints (후퇴 금지)

- 기존 테스트 스위트·build·docs 게이트 green 유지(이전 phase 검증 표면 누적).
- SEC 방어 후퇴 금지: `list-room-members` 익명 옵트인 시에도 **참가자(멤버십) 게이트 유지** — 비참가자 익명 403 불변. 잠금방 배우 비번 검증(PBKDF2·레이트리밋) 불변.
- i18n DoD: 신규 문구는 ko/en/ja 3로케일 동시(i18nCoverage 게이트).
- 감사에서 "잘 처리됨" 실증 항목(역할선택 멱등·2탭·XSS 차단 등) 회귀 금지.
- 배포는 골 밖(`/배포` 승인 게이트) — 이 골은 소스+로컬 실증까지.

## 4. Boundaries

- 허용: `src/features/room/`·`src/features/dub/DubPanel.tsx`·`src/pages/RoomPage.tsx`·`src/pages/lobby/TheaterPage.tsx`·`src/hooks/useLiveKitRoom.ts`·`src/i18n/locales/*`·`supabase/functions/list-room-members/`·docs(§0·사다리·이 브리프)·tests.
- 금지: 스키마 마이그레이션(이번 P0에 불필요) · `join-room-with-password` 서버 역할 파라미터 신설(설계 SSOT "잠금방 뷰어는 초대로만" 준수 — 클라 분기로 해소) · 손들기 부활(A-P1e 폐기 결정, defer 대장) · 밴 해제 기능 신설(defer 대장).

## 5. Iteration policy

- 각 phase: 구현 → §2 검증 전체 실행 → 브리프 체크리스트 대비 자기리뷰(메인 직접) → PASS면 §7 기록 후 자동 진행 / FAIL이면 실패 항목만 최소 변경 재시도.
- 무진전 3패스 → blocked 판정.

## 6. Blocked stop condition

- 재현 스크립트가 코드 문제 아닌 하네스 한계(프로드 LiveKit 브로드캐스트 등)로 판정 불가 → 해당 어서션을 "프로드 재검증 필요"로 분리 기록 후 진행, 근본 막힘이면 4분류(재현/근사/막힘/불확실) 보고.
- 설계 결정 필요 지점(예: 잠금방 뷰어 정책 변경 요구) 발견 시 정지·질문.

## 7. 실행 기록 (실행 에이전트가 기록)

- 2026-08-03 Claude(Fable 5) — AB0 **PASS**: §0 A-P1g 등재(P0 5·P1 5·Low 6·반증 12·미실행 1) + 브리프 + 사다리 AB. 검증: docs:check(schema 144·contract PASS)·docs:links(0 broken).
- 2026-08-03 Claude(Fable 5) — AB6 **PASS·골 종결**: 재현 스크립트 4종 일괄 재실행 **20/20 그린**(AB1 2·AB2 9·AB3 6·AB4 3) · §0 A-P1g 5항목 [x]+probe · docs:check PASS·docs:drift probe 88(STALE 0/REGRESSION 0)·docs:links 0 broken · GAP-MATRIX 진행 로그 1행. **잔여(골 밖)**: ①/배포 — list-room-members 함수 + CF Pages(게스트 403 잔재 4건 소멸) ②프로드 재검증 2건(acceptStage 연타·이양 즉시반영 — 하네스 한계 분류) ③defer 대장(ROOM-21 승격 시작점 부활 결정·밴 해제 기능·P1/Low 배치).
- 2026-08-03 Claude(Fable 5) — AB5 **PASS**: kickConfirmBody 3로케일을 실동작(영구밴·재입장 불가)과 일치로 정정 — "다시 입장할 수 있어요"류 거짓 약속 제거. 밴 해제 기능 신설은 defer 대장 유지. 검증: check:all EXIT=0(183 tests — i18nCoverage 포함).
- 2026-08-03 Claude(Fable 5) — AB4 **PASS**: 동기 ref 가드 4곳 — TheaterPage onCreate(+onReserve 동형 형제)·HostConsole applyBackground·RoomPage acceptStage. disabled/busy state 는 리렌더 커밋 전 연타에 무력(방 2개·요청 6발 실측)이 근본원인 — ref 가 동기 차단. 검증: 실렌더 **3/3**(생성 더블클릭 rooms 1행[전 2]·호스트 입장·배경 6연타 요청 1발[전 6]) · check:all EXIT=0(183 tests). acceptStage 는 동형 코드로 수정·라이브 트리거는 하네스 한계(서버 broadcast=프로드 LiveKit)로 **프로드 재검증 필요** 분류.
- 2026-08-03 Claude(Fable 5) — AB3 **PASS**: deadRoom 모달 조건에 FAILED 합류(useRoomJoin) + FAILED 전용 타이틀/본문(`room.connFailTitle/Body` ×3) + 인라인 기술 원문 렌더 제거(RoomPage — 원문은 useLiveKitRoom console.error 보존, 고아 셀렉터 정리). 검증: 실렌더 **6/6**(토큰 500 → 모달 타이틀·본문·원문 미노출·[재연결] 존재·500 해제 후 재연결 입장 복구·pageerror 0) · check:all EXIT=0(183 tests).
- 2026-08-03 Claude(Fable 5) — AB2 **PASS**: 뷰어 의도+잠금방 → 비번 게이트 대신 `room.lockedViewerOnly` 안내(useRoomJoin roleChoice 분기 — join-room-with-password 의 무조건 배우 좌석 점유로부터 관전 의도 보호) + RoomJoinGate 실패 사유 3분기(오답/429 pwTooMany/기타 joinError, callFn 에 status 동봉으로 서버 문구 매칭 제거) + i18n 2키×3. 검증: 실렌더 **9/9**(뷰어 안내·비번 input 0·참가자 행 0·게스트 동일 안내·배우 게이트 유지·오답 문구·정답 배우 입장 회귀·DB role=actor·6번째 429 문구) · check:all EXIT=0(183 tests).
- 2026-08-03 Claude(Fable 5) — AB1 **PASS**: list-room-members `allowAnonymous`(멤버십 게이트 유지) + DubPanel IIFE 2곳 catch 가드(lint set-state-in-effect 회피 위해 IIFE 형태 유지). 검증: deno check clean · REST 실측 2/2(로컬 deno 서빙 수정본 — 익명 참가자 200 members 2·익명 비참가자 403 불변·프로드 구버전 403 대조) · 게스트 실렌더 2/2(입장 성공·**pageerror 0**, 수정 전 2) · check:all EXIT=0(183 tests·docs 3종). 프로드 403 잔재 4건은 함수 배포 시 소멸(골 밖 /배포).

## 참조 문서

- `docs/DOGFOOD-AUDIT-2026-07.md` §0 A-P1g — 발견 SSOT(file:line 근거)
- `docs/goals/GOAL-LADDER.md` 사다리 AB — 상태판
- `docs/goals/GOAL-room-gaps.md`·`GOAL-room-audit2.md` — 선행 룸 사다리(R·N) 실례
- `.claude/skills/supabase-slice-verify` — 실렌더 하네스 함정 모음
