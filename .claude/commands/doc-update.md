# /doc-update

코드 변경 후 어떤 문서를 갱신해야 하는지 점검하고 필요한 파일을 업데이트하는 절차.
`docs/ops/document-management.md`의 Base SSOT와 Ops Extension을 따른다.

## Steps

1. 변경 파일 목록 수집
2. change class 분류
3. 필수 문서 후보 좁히기
4. `PROJECT-STATUS.md` 갱신
5. 구조 결정이 있으면 `DECISION-LOG.md` 기록
6. Ops Extension 사용 시 `WORK-BOARD.md`, `DOC-SYNC-MATRIX.md`, `docs/daily/*` 동기화
7. 검증 결과와 남은 리스크 정리

## Change Class Map

| 변경 영역 | 필수 갱신 | 조건부 갱신 |
|---|---|---|
| any code | `PROJECT-STATUS.md` | `WORK-BOARD.md` |
| route/page/screen | `WORK-BOARD.md` | `DOC-SYNC-MATRIX.md`, `docs/daily/*` |
| API/schema/model | `ARCHITECTURE.md` 또는 `SCHEMA.md` | `PROJECT-PLAN.md` |
| worker/pipeline/automation | `WORK-BOARD.md` | `docs/ops/*`, `AUTOMATION-HEALTH.md` |
| skill/command | `DOC-SYNC-MATRIX.md` | `AGENTS.md`, `CLAUDE.md` |
| architecture decision | `DECISION-LOG.md` | `ARCHITECTURE.md` |
| release/QA evidence | `PROJECT-STATUS.md` | `docs/weekly/*` |

## Rules

- 같은 사실을 여러 문서에 길게 반복하지 않는다.
- 상세 작업 로그는 daily에, 현재 상태 한 줄은 `PROJECT-STATUS.md`에 둔다.
- `WORK-BOARD.md`는 상태와 다음 액션만 남긴다.
- 실행하지 않은 검증은 evidence로 쓰지 않는다.
