# Skills Index

> 스킬 정본(SSOT) = `.claude/skills/`. `.agents/skills/`는 미러(byte-동일 유지).

## 문서 관리 (코딩 진행 중)

| Skill | Use When |
|---|---|
| `doc-sync` | 코드 변경 직후, 어떤 문서를 같이 고쳐야 하는지 헷갈릴 때 |
| `thin-doc-update` | 상태판(AGENT-OPS §열린 이슈)이 작업 로그처럼 쌓일 때 |
| `change-impact-map` | DB/컴포넌트 계약/env 등 큰 변경 전 영향범위를 먼저 그릴 때 |
| `evidence-review` | 완료 선언 전, 실행한 검증 근거를 남겨야 할 때 |
| `session-handoff` | 세션 종료·중단 시 다음 세션 캡슐 남길 때 |
| `big-task` | 파일변경 10개↑ 또는 3단계↑ 작업을 단계화할 때 |
| `api-contract-guard` | fal.ai/Supabase/LiveKit 계약값을 코드에 하드코딩하기 전 |

## 감사·건강성

| Skill | Use When |
|---|---|
| `gap-find` | 취약점/기능갭/운영리스크를 다역할 병렬 감사 + 반영까지 닫을 때 |
| `doc-health-audit` | 문서 인덱싱성/토큰/폴더정리 건강성 체크 (ChatterBox 문서망 전용, 정본) |
| `doc-health-check` | Vtube 이식본, doc-health-audit과 목적 중복 — 정리 필요 (§ 아래 참고) |
| `script-graveyard-audit` | scripts/에 죽은 스크립트가 쌓였는지 확인할 때 |

## 계획·운영

| Skill | Use When |
|---|---|
| `project-planning` | 새 프로젝트/큰 기능 착수 전 실행계약형 계획 잠글 때 |
| `cs-triage` | CS 인입(Discord/이메일)을 분류할 때 |

## 참고

- `doc-health-audit`(ChatterBox 전용)과 `doc-health-check`(Vtube 이식본)는 3기준 진단이라는 같은 목적을 갖는다. 지금은 둘 다 남겨뒀으니, 실제로 코딩이 시작돼 두 스킬 중 하나가 더 잘 맞는 게 드러나면 나머지는 `docs/archive/`로 옮긴다(삭제 아님).
- 여러 스킬을 항상 같이 로드하는 구조는 피한다.
