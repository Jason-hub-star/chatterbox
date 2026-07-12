---
name: session-handoff
description: 세션 종료 또는 pause 직전 다음 에이전트/다음 날을 위한 캡슐(진입점·블로커·미완결정·첫 검증)을 남기는 스킬. ChatterBox 문서망에 맞춰 커스터마이징됨.
user_invocable: true
tags: [handoff, session, continuity]
trigger: "세션 종료 직전, 큰 작업 중단 시"
version: 2
---

<!-- jason-agent-harness-template의 session-handoff 스킬을 ChatterBox 문서망에 맞춰 이식. -->

# Session Handoff

## Use When

- 세션 종료 직전
- blocker 때문에 중단할 때
- parent agent가 서브에이전트 결과를 다음 세션으로 넘겨야 할 때
- OpenCode SCOUT 배턴을 넘길 때는 이 스킬 대신 `docs/status/SCOUT.md`의 `state:` 한 줄 갱신 규칙(전역 CLAUDE.md 참조)을 따른다 — 혼동 금지

## Inputs

- current phase
- changed files
- blockers
- next recommended entrypoint

## Steps

1. 다음 세션의 첫 문서 또는 첫 파일을 `next entrypoint`로 적는다 (예: `docs/status/AGENT-OPS.md`, 또는 작업 중이던 `docs/contracts/<X>.md`).
2. `read first` 순서를 1~3개 적는다.
3. blocker와 unfinished decisions를 적는다.
4. 다시 시작할 때 돌릴 첫 verify를 적는다 (`npm run docs:check` 등).
5. 결과를 `docs/status/AGENT-OPS.md`의 `## § 현재 열린 이슈` 표에 남긴다 (랜딩페이지 작업이면 `docs/status/PROJECT-STATUS.md`에 남긴다 — 둘은 서로 다른 프로젝트 스코프이므로 섞지 않는다).

## Outputs

- handoff capsule
- blocker summary
- next verify

## Verify

- `next entrypoint`가 실제 존재하는 경로다.
- blocker가 있으면 다음 행동이 안전하게 이어진다.
- first verify가 기존 검증 명령과 모순되지 않는다.

## Failure / Fallback

- blocker가 없으면 `blocker: none`으로 명시한다.
- entrypoint가 여러 개면 읽기 순서를 적고 1순위를 `next entrypoint`로 고정한다.
