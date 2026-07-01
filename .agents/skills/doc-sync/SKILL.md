---
name: doc-sync
description: 코드 변경 후 어떤 문서를 같이 고쳐야 하는지 change class 기준으로 좁혀주는 점검 스킬. ChatterBox 문서망(contracts/state-machines/specs/GAP-MATRIX)에 맞춰 커스터마이징됨.
user_invocable: true
tags: [documentation, drift, post-edit, ssot]
trigger: "코드 변경 후 문서 누락이 걱정될 때"
version: 2
---

<!-- jason-agent-harness-template의 doc-sync 스킬을 ChatterBox 문서망(docs/contracts, docs/state-machines, docs/GAP-MATRIX)에 맞춰 이식. 제네릭 경로(PRD.md/ARCHITECTURE.md/DECISION-LOG.md 등)를 실제 경로로 교체함. -->

# Doc Sync

문서를 많이 쓰게 만들기보다, 꼭 고쳐야 할 문서를 빠르게 찾는 데 목적이 있다.

## Use When

- 코드 변경 직후 (Phase 0 착수 이후부터 유효 — 그 전엔 설계 문서만 있어 `gap-find`가 대신함)
- 큰 작업 마무리 전
- "GAP-MATRIX만 고치면 되나?"가 헷갈릴 때

## Inputs

- working tree 변경사항 (`git diff --name-only HEAD`, `git status --porcelain` — ChatterBox가 git repo가 되면)
- 새로 추가된 파일
- ChatterBox SSOT 문서 세트: `docs/FEATURE-SPEC.md`, `docs/DATA-SCHEMA.md`, `docs/contracts/*.md`, `docs/state-machines/*.md`, `docs/GAP-MATRIX.md`

## Steps

### Step 1: 변경 파일 수집

```bash
git diff --name-only HEAD
git diff --name-only --cached
git status --porcelain
```

### Step 2: trivial 변경 필터

아래만 바뀌면 문서 갱신이 불필요할 수 있다.

- 오탈자/포맷팅
- 테스트 fixture/log/generated 파일
- 주석만 수정

단, 동작이나 경계가 바뀌면 trivial이 아니다.

### Step 3: change class 분류 (ChatterBox 매핑)

| Class | Example | Must Update | Maybe Update |
|---|---|---|---|
| UI 컴포넌트 | React 컴포넌트 신설/props 변경 | `docs/contracts/<Component>.md` | `docs/FEATURE-CONTRACT-MAP.md`, `docs/STORE-DEPENDENCY-MATRIX.md` |
| schema/model | DB 테이블·컬럼, Zustand store 타입 | `docs/DATA-SCHEMA.md` | `docs/GAP-MATRIX.md` (결정 이력) |
| state/flow | 상태머신, Edge Function 로직 | `docs/state-machines/*.md`, 관련 `docs/specs/*.md` | 연관 `docs/contracts/*.md` |
| automation/prompt | 스킬, 훅, 운영 루틴 | `docs/status/AGENT-OPS.md` | `.claude/skills/*/SKILL.md` |
| design/token | UI 토큰, 애니메이션 | `docs/design/DESIGN-TOKENS.md` | 관련 contracts |
| config/infra | env, build, 배포 | `docs/PLATFORM-ARCHITECTURE.md`, `docs/VITE-CONFIG.md` | `docs/DEPLOY.md`, `docs/DEPLOY-PLATFORM.md` |

> **주의**: `docs/PROJECT-STATUS.md`는 **랜딩 페이지(snack-web) 전용**이다. ChatterBox 앱 자체의 구현 진행상황은 `docs/GAP-MATRIX.md`(진행 로그 + GAP 상태)와 `npm run docs:health`가 담당한다. 둘을 혼동하지 말 것.

### Step 4: 필수 문서 누락 판정

각 문서에 대해 `updated` / `not needed` / `missing` 중 하나로 판정한다. `missing`이면 이유와 섹션 힌트를 같이 적는다.

### Step 5: companion checks 제안

| 상황 | Companion Check |
|---|---|
| 계약서/스키마 변경 | `npm run docs:check`, `npm run docs:check:strict` |
| 코드 변경 (Phase 0 이후) | `npm run type-check`, `npm run lint`, `npm run build`, `npm run test` |
| 큰 변경 | `gap-find` 또는 `doc-health-audit` |

## Output Format

```markdown
## Doc Sync Report

### Change classes
- UI 컴포넌트
- schema/model

### Must update
| 문서 | 이유 | 상태 | 섹션 힌트 |
|---|---|---|---|
| docs/contracts/DubRecorder.md | Props 변경 | missing | Props Interface |
| docs/DATA-SCHEMA.md | 컬럼 추가 | updated | §1.13 dub_tracks |

### Companion checks
- npm run docs:check
- npm run type-check

### Verdict
- ⚠️ 1 doc needs update
```

## Verify

- [ ] 변경 파일이 모두 최소 한 class에 분류되었다
- [ ] 필수 문서 누락 여부가 판정되었다
- [ ] `docs/GAP-MATRIX.md` 진행 로그 갱신 필요 여부가 검토되었다 (구조/원칙 변경 시)
- [ ] `npm run docs:check` 통과 확인

## Failure / Fallback

- class가 애매하면 가장 가까운 두 class에 모두 걸친다
- 시간이 없으면 최소 관련 `docs/contracts/*.md` 또는 `docs/state-machines/*.md`만 우선 맞춘다
- 문서 자체가 아직 없으면 `docs/GAP-MATRIX.md`에 신규 G-ID로 등록 후 `gap-find`로 채운다
