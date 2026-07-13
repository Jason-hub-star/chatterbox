# GOAL-g8-harness-template — 하네스 템플릿화 (사다리 8/8)

## 골 한 줄
ChatterBox 검증 하네스 4종(backlog-drift·bepo·goal-backlog·slice-verify)이 jason-agent-harness-template 에 범용화 이관·REGISTRY 등재 — verified by `scripts/check-harness.sh` PASS + 이관 파일·행 실존 실측, while preserving 템플릿 기존 계약(required_files·기존 문서) 무손상 + ChatterBox 원본 무변경. details in docs/goals/GOAL-g8-harness-template.md

## 1. Outcome
- `~/jason/jason-agent-harness-template`(비-git 로컬 레포)에 신규 하네스 문서 4개 + REGISTRY 활성 표 4행(candidate·ChatterBox 자산화 2026-07-13):
  1. `harnesses/backlog-drift-probe.md` — probe 주석 규약(STALE/REGRESSION 표식만·자동 [x] 금지) + 범용 스크립트 `scripts/check-backlog-drift.mjs`(신규 이식 — 기본 문서 인자만 일반화, 로직 무수정).
  2. `harnesses/deploy-verify-close.md` — bepo 골격(프리플라이트→백엔드→프론트→라이브 실증→문서+명시 커밋) + 함정 일반화(파이프 exit 삼킴·배포성공=목록 실측·시크릿 grep 금지·DEV 훅 프로드 부재·별칭 전파 지연).
  3. `harnesses/goal-backlog-ladder.md` — 백로그→골 사다리 규약(유닛당 골 1·6요소 매핑표·골 경계 승인 게이트·상태판(LADDER)·브리프 §7 실행기록 인터페이스·페이즈 돌입 전 플랜모드).
  4. `harnesses/supabase-slice-verify.md` — 슬라이스 실측 하네스(통합 .mjs + 헤드리스 E2E) 골격 + **환경 함정 22** 전량(프로젝트 특정 표현만 일반화).
- 각 문서에 원천 포인터(ChatterBox 경로·실전 증거) 명시 — keep-discard-with-evidence 관례.

## 2. Verification surface
- `bash ~/jason/jason-agent-harness-template/scripts/check-harness.sh` → `Harness check passed.` (사전 기준선 PASS 실측 2026-07-13 — 회귀 0).
- 실존 실측: 신규 4 md + 이식 스크립트 존재, `REGISTRY.md`에 4행(grep).
- 이식 스크립트 스모크: 템플릿 레포에서 `node scripts/check-backlog-drift.mjs <더미문서>` 실행 — probe 행 파싱·exit 코드 실측.
- ChatterBox 측: `npm run docs:check && npm run docs:drift && npm run docs:links` 그린(문서 마감 후).

## 3. Constraints (후퇴 금지)
- 템플릿 기존 계약 무손상: `HARNESS-MANIFEST.yaml`·`check-harness.sh` required_files **무수정**(신규 하네스는 REGISTRY가 인덱스 — 기존 관례), 기존 하네스 문서 무수정(REGISTRY는 행 append만).
- ChatterBox 원본(스킬 4종·scripts/check-backlog-drift.mjs) **무변경** — 이관은 복사·범용화, 이동 아님.
- G1~G7 검증 표면 green 유지.

## 4. Boundaries
- 허용: 템플릿 레포 `harnesses/*.md`(신규 4)·`harnesses/REGISTRY.md`(append)·`scripts/check-backlog-drift.mjs`(신규) + ChatterBox `docs/goals/`·`docs/GAP-MATRIX.md`.
- 금지: 템플릿 `scaffold/`·`docs/`·`templates/`·기존 스킬·manifest, ChatterBox `src/`·`.env`.
- 템플릿 레포는 git 아님 — 커밋은 ChatterBox 문서만.

## 5. Iteration policy
- 패스마다 check-harness + 실존 실측 재실행, 실패 항목만 수정. 무진전 3패스 = blocked.

## 6. Blocked stop condition
- check-harness 가 내 변경과 무관한 사유로 FAIL(기준선 재현 불가) · REGISTRY 편집 충돌.
- 보고: 재현/근사/막힘/불확실 4분류.

## 7. 실행 기록 (실행 에이전트가 기록)
- 2026-07-13 Claude Code(Fable) — **패스 1 완주**: 하네스 문서 4개 신규(하우스 스타일 frontmatter+When/Rules/Flow/Verify/Failure Mode, 원천 포인터 명시) + `scripts/check-backlog-drift.mjs` 이식(로직 무수정·기본 인자 제거→usage exit 2) + REGISTRY 활성 표 4행 append(candidate). slice-verify 는 ChatterBox G7 실측 함정(+23 후보: 룸 진입 후 waitForFunction 불안정→evaluate 폴링)까지 반영.
- 검증 실측: `check-harness.sh` → `Harness check passed.`(기준선 회귀 0) · 4 md+스크립트 ls · REGISTRY grep 4행 · 스모크(더미 3행: STALE 1·REGRESSION 1·정상 무표식·exit 1, 무인자 usage exit 2) · ChatterBox docs 게이트 그린.
- 4분류: 재현됨 = §2 전 항목. 근사/막힘/불확실 = 없음. (함정: 스모크 더미의 `../../..` 상대경로는 4단계 필요 — 레포 내 더미로 대체.)

## 참조 문서
- `docs/goals/GOAL-LADDER.md` G8 행 · 원천: `scripts/check-backlog-drift.mjs`(51줄) · `.claude/skills/bepo/SKILL.md`(52) · `~/.claude/skills/goal/SKILL.md`(163) · `.claude/skills/supabase-slice-verify/SKILL.md`(79·함정 22) · 대상: `~/jason/jason-agent-harness-template/harnesses/REGISTRY.md`
