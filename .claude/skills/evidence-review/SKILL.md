---
name: evidence-review
description: 완료 선언 전에 실행한 검증 명령·바뀐 문서·가정·잔여 리스크를 점검하는 스킬. ChatterBox 게이트(docs:check 등)에 맞춰 커스터마이징됨.
user_invocable: true
tags: [verification, evidence, release]
trigger: "완료 선언 직전, 리뷰 요청 전"
version: 2
---

<!-- jason-agent-harness-template의 evidence-review 스킬을 ChatterBox 검증 게이트에 맞춰 이식. -->

# Evidence Review

## Use When

- 완료 선언 직전
- 리뷰 요청 전
- 문서만 바뀌었더라도 verify와 근거를 남겨야 할 때

## Inputs

- executed commands (`npm run docs:check`, `npm run docs:check:strict`, `npm run docs:health`, 코드 생긴 후엔 `type-check`/`lint`/`build`/`test`)
- changed docs
- assumptions
- residual risks
- current phase (`docs/GAP-MATRIX.md` 기준)

## Steps

1. 실제로 실행한 verify 명령만 적는다 — 돌리지 않은 명령을 "통과"로 적지 않는다.
2. 바뀐 문서와 왜 바뀌었는지 적는다.
3. 아직 확인 못 한 가정과 남은 리스크를 적는다.
4. `release verdict`를 `not-ready`, `ready-for-review`, `ready-to-share` 중 하나로 정한다.
5. 결과를 `docs/status/AGENT-OPS.md`의 `## § 현재 열린 이슈` 또는 `docs/GAP-MATRIX.md`의 `## 진행 로그`에 남긴다.

## Outputs

- evidence checklist
- release verdict
- residual risk summary

## Verify

- `executed verify` 명령이 실제로 이번 세션에서 실행됐다 (터미널 출력 근거 존재).
- changed docs가 실제 변경 축과 맞는다.
- evidence가 없으면 `release verdict`는 `not-ready`다.
- `npm run docs:check`가 FAIL 상태로 남아있는데 `ready-to-share`로 판정하지 않는다.

## Failure / Fallback

- verify를 안 돌렸으면 완료 선언 대신 `not-ready`로 남긴다.
- docs가 밀렸으면 먼저 `doc-sync`로 닫고 다시 evidence review를 한다.
