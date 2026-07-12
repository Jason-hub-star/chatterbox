---
name: thin-doc-update
description: 문서 업데이트 요청 시 상태판을 얇게 유지해야 할 때 쓰는 스킬. 상세 이력은 GAP-MATRIX 진행 로그로, 최신 사실만 상태판에 남긴다. ChatterBox 문서망에 맞춰 커스터마이징됨.
user_invocable: true
tags: [docs, status, cleanup, doc-sync]
trigger: "문서 업데이트, 상태 문서 정리, 진행 로그 누적"
version: 2
---

<!-- jason-agent-harness-template의 thin-doc-update 스킬을 ChatterBox에 맞춰 이식. 이 프로젝트엔 docs/daily·docs/weekly가 없고, GAP-MATRIX.md의 "N차 분석" 섹션 + "## 진행 로그"가 이미 그 역할을 겸하므로 새 폴더를 만들지 않고 기존 관례를 재사용한다. -->

# Thin Doc Update

## Use When

- 사용자가 "문서 업데이트"를 요청한다.
- `docs/status/AGENT-OPS.md`의 `## § 현재 열린 이슈` 표가 긴 작업 로그처럼 쌓이고 있다.
- 랜딩페이지 작업이면 `docs/status/PROJECT-STATUS.md`가 같은 증상을 보일 때.
- 해소된 GAP, 폐기된 실험, 오래된 Phase가 상단 상태판에 남아 있다.

## Rules

1. 상태판은 최신 사실만 남긴다.
2. 상세 변경 이력과 근거는 `docs/GAP-MATRIX.md`의 `## 진행 로그` + 각 "N차 분석" 섹션에 기록한다(이 프로젝트의 daily/weekly 역할 — 새 `docs/daily/` 폴더를 만들지 않는다).
3. `docs/status/AGENT-OPS.md`의 `§ 현재 열린 이슈` 표는 5건 이하로 유지한다. 해소된 이슈는 지우지 말고 GAP-MATRIX.md로 옮긴다.
4. 코드/런타임 truth(`npm run docs:health` 출력)가 문서보다 우선한다.

## Steps

1. 현재 상태 문서를 읽는다:
   - `docs/status/AGENT-OPS.md` (§ 현재 열린 이슈)
   - `docs/GAP-MATRIX.md` (진행 로그, GAP 상태)
   - 랜딩페이지 작업이면 `docs/status/PROJECT-STATUS.md`
2. `npm run docs:health` 출력과 대조해 실제로 바뀐 사실을 확인한다.
3. 해당 상태판을 얇은 대시보드로 재작성한다: 현재 Phase, 열린 이슈(≤5), 다음 액션, 검증 명령.
4. 상세 내용은 `docs/GAP-MATRIX.md`의 `## 진행 로그`에 옮긴다(N차 분석 신설이 필요하면 새 섹션으로).
5. 해소된 리스크는 표에서 제거하고 GAP-MATRIX 상태를 `DONE`으로 갱신한다.
6. `npm run docs:check` 실행.

## Verify

- [ ] 상태판이 한 화면 가까이에서 스캔 가능하다
- [ ] 오래된/최신 사실 충돌이 없다
- [ ] 상세 근거가 `docs/GAP-MATRIX.md`에 존재한다
- [ ] `npm run docs:check` 통과 (실패 시 원인 기록)

## Failure / Fallback

- GAP-MATRIX에 해당 배치 섹션이 없으면 새 "N차 분석" 섹션을 신설한다(요약 한 줄로 퉁치지 않는다 — 과거 라운드에서 이 실수로 진행률 집계가 깨진 적 있음).
- 상태 진실이 불명확하면 추측 대신 `npm run docs:health`로 실측 후 기록한다.
