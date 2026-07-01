---
name: script-graveyard-audit
description: >-
  scripts/ 에 쌓이는 *죽은 스크립트*(아무도 import/subprocess/문서참조하지 않는 것)를 찾아
  docs/archive/cubism-era-scripts/ 묘지로 안전 이동(삭제 아님)한다. Cubism 피벗(2026-06-10) 이전
  저작 스크립트가 319개까지 쌓여 "뭐가 실제로 도는지"가 안 보이던 사건의 재발 방지. 트리거 —
  "스크립트 정리", "죽은 스크립트", "안 쓰는 스크립트 찾아", "스크립트 묘지", "scripts 정리",
  "도달성 감사", "graveyard audit", "묘지로 보내", "사용 안 하는 파이썬 파일", "스크립트 감사".
---

# 스크립트 도달성 감사 (재발 방지)

`scripts/`가 다시 죽은 코드로 비대해지지 않게, 도달 불가 스크립트를 결정론으로 찾아 묘지로 보낸다.

## 1. 감사 (결정론 — 추측 금지)

```bash
python3 scripts/audit_script_reachability.py            # 사람용 리포트 (ARCHIVE 후보 목록)
python3 scripts/audit_script_reachability.py --json     # 기계 판독
python3 scripts/audit_script_reachability.py --check     # 후보 있으면 exit 1 (CI/훅용)
```

판정: 한 스크립트가 LIVE = 다른 스크립트의 import/subprocess, 스킬, 핵심 문서(PROJECT-STATUS·INDEX·
docs/ref·AGENTS.md), config/control_tower/mini_cubism_app 중 한 곳에 이름이 등장하거나, 엔트리포인트
패턴(run_autorig*·validate_*·generate_*·verify_*·inspect_autorig*·build_player* 등)에 해당. 그 외 = 후보.

## 2. 이동 (삭제 아님 — 되돌림 가능)

후보를 사람이 1차 검토한 뒤(엔트리포인트 오탐 경계), 묘지로 `git mv`:

```bash
mkdir -p docs/archive/cubism-era-scripts
git mv scripts/<name>.py docs/archive/cubism-era-scripts/
# 복원: git mv docs/archive/cubism-era-scripts/<name>.py scripts/
```

이동 후 검증(성역 — 확인):

```bash
python3 -m py_compile scripts/*.py scripts/lib/*.py            # 남은 것 구문/모듈 OK
for s in run_autorig_pipeline build_autorig_rig_v0 build_player_webapp run_autorig_control_tower; do
  python3 scripts/$s.py --help >/dev/null && echo "OK $s" || echo "FAIL $s"
done
python3 scripts/build_scripts_index.py                         # scripts/INDEX.md 재생성
```

## 3. 가드레일 (박제된 교훈)

- **삭제 아니라 이동**: 증거/재사용 가치가 남을 수 있다. git mv로 묘지에 보존(`docs/archive/cubism-era-scripts/README.md`에 근거).
- **엔트리포인트 오탐 경계**: 사람이 직접 호출하는 CLI 도구(서버·생성기·검증기)는 참조가 0이어도 LIVE. 감사 후보는 *검토 대상*이지 자동 삭제 목록이 아니다.
- **실제 import만이 파괴 위험**: 카탈로그(INDEX) 등장은 LIVE 신호일 뿐. 이동 전 `grep -rn "<name>"` 으로 실 import/subprocess 의존을 확인(없으면 안전).
- 2026-06-20 1차 정리: 319→141, 178개(cubism_v2/live2d/mini_cubism_v[n]/패킷) 이동, 실 의존 0건 확인·스모크 PASS.
