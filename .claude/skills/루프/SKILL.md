---
name: 루프
description: 감사·백로그 발견 묶음을 골 사다리(GOAL-LADDER 표 + 6요소 브리프)로 조립하고, 주인님 승인 후 phase-loop 로 "원래 플랜과 대조하며" 누락 없이 완주하는 파이프라인. "루프 돌려", "골로 다 묶어서 진행", "사다리 완주", "발견한 것들 묶어서 개발", "/루프" 요청 시. 한 개씩 확인하며 갈 거면 /다음, 시간 간격 반복 실행은 built-in /loop(영문 — 딴 물건).
user_invocable: true
tags: [pipeline, goals, loop]
trigger: "여러 발견/백로그를 하나의 골 사다리로 묶어 자동 완주하고 싶을 때."
version: 1
---

# 루프 — 발견 묶음 → 골 사다리 → phase-loop 완주

2026-07-17 룸 감사 세션에서 확립한 파이프라인의 캡슐. **누락 방지 3중 앵커**가 핵심:
①브리프 체크리스트(플랜 사본) 대비 phase 별 자기리뷰 ②`docs:drift` probe 기계 대조 ③완료 판정은 주장이 아닌 §2 증거 명령.

## Use When

- `/감사`·`/gap-find` 발견이나 DOGFOOD §0 백로그 여러 건을 **한 번에 묶어** 연속 개발하고 싶을 때
- "계속 원래 플랜과 비교하면서 누락 없이" 요구가 있을 때 (플랜 대조가 이 스킬의 존재 이유)
- `/다음`(한 개씩·매 턴 주인님 확인)보다 긴 자율 주행이 필요할 때

## Steps

1. **대상 확정** — 인자 해석: DOGFOOD §0 서브섹션 ID(예: `A-P1e`) / 감사 발견 목록 / 기존 브리프 경로(`docs/goals/GOAL-*.md`). 무인자면 §0 최신 미완 트랙 A 묶음. **기존 브리프가 오면 5로 점프(재개)** — 단 Boundaries·Constraints 를 현재 코드와 대조해 stale 감지 먼저.
2. **등재 확인** — 발견이 §0 에 없으면 등재(체크박스 + file:line + 정수정 1줄, thin-doc 원칙). 폐기 결정된 항목은 폐기 사유와 잔여 리스크를 같이 기록.
3. **골 사다리 조립** — `goal` 스킬 계약(6요소) 그대로:
   - 브리프 `docs/goals/GOAL-<slug>.md`: phase 별 **이진 Outcome** · **도구 중립 검증 명령**(check:all·deno check·db reset/psql·i18nCoverage) · **누적 Constraints**(이전 phase green 유지·SEC 방어·i18n·schema split 게이트) · **대형/스키마 phase 앞 승인 게이트** · 무진전 3패스 blocked · `## 7. 실행 기록`.
   - `GOAL-LADDER.md`: 사다리 표(R/N 행 PENDING) 등재 + defer 대장 정리(부활/폐기 반영).
   - 게이트: `npm run docs:check` + `npm run docs:links` PASS.
4. **승인 게이트** — 브리프·사다리 표를 제시하고 **주인님 승인 전 실행 금지**(phase-entry 플랜 승인 규칙). 승인 문구 예: "ㄱ", "실행해".
5. **phase-loop 완주** — 각 phase: 구현 → 브리프 §2 검증 전체 실행 → **브리프 체크리스트 대비 자기리뷰(메인 모델 직접 — 전역 에이전트 모델 규칙)** → PASS 면 §7 기록 후 자동 진행 / FAIL 이면 실패 항목만 최소 변경 재시도. 브리프 내 승인 게이트 phase 에선 정지하고 질문. 무진전 3패스 → blocked 보고(재현/근사/막힘/불확실 4분류).
   - **동적 검증은 성역 — 정적 게이트로 phase 를 닫지 않는다(2026-08-05 주인님 지시).** `check:all`·`deno check`·tsc·코드리딩은 **무회귀·타입 확인일 뿐 신규 로직의 실동작 증거가 아니다.** 브리프 §2 가 실렌더/통합/E2E 를 걸었으면 **로컬에서 실제로 돌린다**: 개발서버(`vite dev`)+헤드리스로 프론트 실렌더(리액션·모달·360px 등), 로컬 supabase(`db reset`+`functions serve`)로 Edge 통합 실호출(게이트가 실제 403/200 내는지) — `supabase-slice-verify` 하네스 사용. **`라이브 실측은 배포 후`로 미룰 수 있는 것은 오직 프로드 백엔드가 반드시 있어야 하는 것(예: 배포판 2탭 라이브)뿐** — dev/로컬로 검증 가능한 것을 배포로 이월하면 안 된다.
6. **닫기** — §0 해당 행 [x] + `<!-- probe: 파일 :: 마커 -->`(docs:drift 앵커) · 사다리 표 DONE(증거 1줄) · 배포·커밋은 골 밖(`/배포`·`/마감` 승인 게이트). 배포 종결된 브리프는 `goals/archive/` 이관.
   - **사다리 종료 phase(실증)에서 반드시 개발서버 실검증을 돌린다.** 최소: 신규 프론트 표면 헤드리스 실렌더 + 신규/수정 Edge 로컬 통합 1회. 못 돌린 항목은 "미검증"으로 명시(통과로 적지 않는다) — 산술 예측은 예측으로만 적는다.

## /다음 과의 구분

| | `/다음` | `/루프` |
|---|---|---|
| 단위 | 백로그 1개 | 묶음(사다리 전체) |
| 정지점 | 매 항목 끝 | 승인 게이트·blocked 만 |
| 플랜 대조 | 항목 DoD | phase 별 체크리스트 자기리뷰 + docs:drift |

## Verify

- [ ] 브리프에 phase 별 이진 Outcome·실행 가능한 검증 명령이 있다(형용사 금지)
- [ ] GOAL-LADDER 표 등재 + docs:check·docs:links PASS
- [ ] 실행은 주인님 승인 후에만 시작됐다
- [ ] 매 phase §7 실행 기록이 남았다(명령·결과·판정)
- [ ] **브리프 §2 의 실렌더/통합/E2E 를 로컬(개발서버·supabase serve)에서 실제로 돌렸다 — 정적 게이트+코드리딩만으로 PASS 판정하지 않았다**
- [ ] **미검증 항목은 "미검증"으로 명시했다(예측을 통과로 위장하지 않음)·배포 이월은 프로드 필수 항목만이다**
- [ ] 종료 시 §0 [x]+probe 로 docs:drift 가 회귀를 감시한다

## Failure / Fallback

- 브리프-코드 stale(경계·전제 어긋남) → 실행 전 보고·브리프 갱신 승인 후 진행.
- 스키마 phase 가 schema split 게이트와 충돌 반복 → blocked, 마이그 설계 재승인 요청.
- 게이트 flaky → 2회 재현 시도 후 blocked 4분류 보고(무한 재시도 금지).

## 참조

- `~/.claude/skills/goal/SKILL.md` — 6요소 골 계약(조립 규칙 SSOT)
- `.claude/skills/phase-loop`(전역) — phase 실행 루프
- `docs/goals/GOAL-LADDER.md` — 사다리 상태판(영구 인덱스)
- `docs/goals/GOAL-room-gaps.md` — 이 파이프라인의 첫 실례(R1~R7)
- `docs/DOGFOOD-AUDIT-2026-07.md` §0 — 발견·백로그 SSOT
