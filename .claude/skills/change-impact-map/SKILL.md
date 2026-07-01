---
name: change-impact-map
description: route/schema/env/worker/UI 변경 영향 범위를 먼저 그려야 할 때 쓰는 스킬. ChatterBox 문서망에 맞춰 커스터마이징됨.
user_invocable: true
tags: [impact, planning, pre-edit]
trigger: "큰 스키마/route/env 변경 전 영향범위를 먼저 그려야 할 때"
version: 2
---

<!-- jason-agent-harness-template의 change-impact-map 스킬을 ChatterBox 문서망에 맞춰 이식. PRD/PROJECT-PLAN/ARCHITECTURE 같은 제네릭 경로를 실제 경로로 교체함. -->

# Change Impact Map

## Use When

- DB 테이블/컬럼명 변경
- env var 신설/변경
- Edge Function 경로 추가
- 컴포넌트 계약(Props/Store 의존성) 변경
- 상태머신 상태/전이 변경

## Inputs

- requested change
- `docs/IMPLEMENTATION-ORDER.md` (Feature 의존성 DAG)
- `docs/PLATFORM-ARCHITECTURE.md`
- `docs/GAP-MATRIX.md` (현재 진행상황 — `docs/PROJECT-STATUS.md`는 랜딩페이지 전용이므로 앱 변경 영향 판단엔 쓰지 않는다)

## Steps

1. 변경 축을 `schema`, `state-machine`, `contract`, `env`, `edge-fn`, `mixed` 중 하나로 적는다.
2. core paths를 repo-relative path로 적는다 (예: `docs/DATA-SCHEMA.md §1.13`, `docs/contracts/DubRecorder.md`).
3. companion docs와 verify matrix를 적는다.
4. naming contract token이 바뀌면(예: DB 컬럼명, DataChannel payload 필드) `docs/DATA-SCHEMA.md §0 Naming SSOT` 및 관련 `docs/contracts/*.md`, `docs/state-machines/*.md`에서 같은 token을 바꿔야 하는지 적는다.
5. 결과를 `docs/GAP-MATRIX.md`의 `## 진행 로그`에 남긴다.

## Outputs

- impact map summary
- companion docs list
- verify matrix
- residual risk

## Verify

- `core paths`가 `docs/FEATURE-CONTRACT-MAP.md` 또는 doc-sync 대상과 연결된다.
- verify matrix가 최소 1개 이상 있다 (`npm run docs:check` 필수 포함).
- naming contract이 바뀌면 `DATA-SCHEMA.md`, 관련 `contracts/*.md`, `state-machines/*.md` 중 필요한 문서가 포함된다.

## Failure / Fallback

- 경로를 아직 특정 못 했으면 `candidate:` 접두사로 적는다.
- 영향 범위가 너무 넓으면 `big-task`로 phase를 자르고, 조사만 서브에이전트에 넘긴다.
