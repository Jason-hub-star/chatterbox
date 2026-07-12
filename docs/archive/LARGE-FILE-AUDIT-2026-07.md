# 대용량 파일 감사 (Large-File Audit) — 2026-07-08

범위: **ChatterBox**, **Vtube** / 기준: **문서 줄 수 + 코드 파일 줄 수**
방식: Opus 오케스트레이션 + Explore 서브에이전트(기준 탐색) + 결정론적 bash 스캔(줄 수 집계)

---

## 0. 결론 요약

- **"큰 것"의 기준이 정의되어 있는가?** → 부분적. **ChatterBox만** 문서에 대한 수치 기준이 있고(`doc-health-check` 스킬), **코드 파일 줄 수 기준은 두 프로젝트 모두 없음**(eslint `max-lines` 룰 부재). Vtube는 문서 크기 기준도 없이 "오래되면 archive" 관습만 있음.
- **자동 강제(게이트)는 없음.** ChatterBox `npm run docs:health`는 가장 큰 문서 10개를 *나열*만 하고 줄 수로 실패시키지 않음.
- **가장 시급한 실물:** ChatterBox `docs/specs/SecurityPolicies.md` (2,426줄), `docs/DATA-SCHEMA.md` (1,793줄) — 이미 정의된 1,500줄 회전 임계 초과. Vtube는 소스보다 **가상환경(venv) 디스크 폭증**이 진짜 문제(단일 venv 1.6GB).

---

## 1. 이미 정의된 기준 (found standards)

**ChatterBox — 문서에 한해 수치 기준 존재:**

| 기준 | 값 | 출처 |
|---|---|---|
| 핵심 내비 문서 목표 크기 | **< 300줄** | `.claude/skills/doc-health-check/SKILL.md:31` |
| 로그/SSOT 회전(archive) 임계 | **~1,500줄 초과 시 분할** | `.claude/skills/doc-health-check/SKILL.md:47` |
| 삭제 대신 아카이브 | 수치 없음 (관습) | `docs/CODING-CONVENTIONS.md:297` |

- 강제 방식: `npm run docs:health`(`scripts/check-contract-docs.mjs`)는 문서별 줄 수를 계산해 **가장 큰 10개를 표로 나열**하지만, 줄 수 기반 실패 게이트는 없음. `--strict`는 계약 blocker·TBD/TODO 기준으로만 BLOCKED 판정.

**코드 줄 수 기준: 두 프로젝트 모두 없음.** eslint에 `max-lines`/`max-len` 룰 없음, prettier print-width 제한도 없음.

**Vtube: 문서 크기 수치 기준 없음.** `AGENTS.md:34` / `CLAUDE.md:13`에 "오래된 것은 `docs/archive/`로" 관습만 존재.

---

## 2. 실제 대용량 파일 (scan results)

### 2-A. ChatterBox — 문서 (docs/*.md)

300줄 초과 문서 **61개**, 1,500줄 초과(회전 임계 위반) **2개**.

| 줄 수 | 파일 | 판정 |
|---|---|---|
| 2,426 | `docs/specs/SecurityPolicies.md` | ⛔ 회전 임계(1,500) 초과 |
| 1,793 | `docs/DATA-SCHEMA.md` | ⛔ 회전 임계 초과 |
| 1,233 | `docs/PLATFORM-ARCHITECTURE.md` | ⚠ 300 훨씬 초과, SSOT라 분할 신중 |
| 1,207 | `docs/contracts/VgenPanel.md` | ⚠ |
| 1,113 | `docs/design/flecto-reference/flecto-io-design-language.md` | ⚠ (레퍼런스, 외부성) |
| 1,105 | `docs/specs/AccessibilityPolicy.md` | ⚠ |
| 1,060 | `docs/specs/livekit-edge-fn.md` | ⚠ |
| 997 | `docs/contracts/SettingsPage.md` | ⚠ |
| 985 | `docs/specs/TestStrategy.md` | ⚠ |
| 959 | `docs/reference/patterns/falai-vgen-pipeline.md` | ⚠ |

### 2-B. ChatterBox — 코드

400줄 초과 소스 **4개**뿐. 코드베이스는 건강한 편.

| 줄 수 | 파일 |
|---|---|
| 699 | `src/lib/pixi/rig/rigMath.ts` |
| 698 | `public/aria-player/src/core/rig.js` |
| 549 | `src/pages/RoomPage.tsx` |
| 472 | `public/aria-player/src/core/draw.js` |

### 2-C. Vtube — 문서 (자체 저작, external_repos 제외)

| 줄 수 | 파일 | 비고 |
|---|---|---|
| 5,481 | `docs/archive/2026-06-evidence-log-pre-autorig.md` | 이미 archive됨(설계상 grep 대상) |
| 3,087 | `experiments/reference-model-structure-001/reports/all34_cmo3_deformer_hierarchy_table.md` | 생성된 표 데이터 |
| 1,115 | `docs/archive/2026-06-03-legacy-2d-vtuber-ai-tool-plan.md` | archive됨 |
| 753 | `experiments/.../nito_nito_t01/cmo3_structure_report.md` | 생성 리포트(다수 중복) |
| 637 | `vtube-validation-evidence-log.md` | 현행 로그, 아직 OK |

주의: `cmo3_structure_report.md`가 `official_combined_analysis/`·`models/`·`live2d-strong-model-pattern-001/`에 **동일 내용 3중 복제**로 다수 존재 — 문서 자체 크기보다 **중복**이 문제.

### 2-D. Vtube — 코드 (자체 저작, 벤더 Framework/sandbox/venv 제외)

| 줄 수 | 파일 | 비고 |
|---|---|---|
| 1,468 | `docs/archive/cubism-era-scripts/build_live2d_all57_production_design_spec.py` | archive된 폐기 코드 |
| 1,302 | `scripts/run_seethrough_g1_websdk_capture.py` | 현행, 분할 후보 |
| 1,027 | `scripts/lib/rig_keyforms.py` | 현행 |
| 983 | `scripts/production_canvas_2048_smoke.py` | 현행 |
| 947 | `scripts/run_yuki_anime25_absorb_experiment.py` | 실험 |
| 768 | `scripts/run_autorig_pipeline.py` | 핵심 파이프라인 |

`rig.js`(698줄)는 `mini_cubism_app`·`theater-platform-001`·`snack-*` 등에 **다수 복제**됨.

### 2-E. ⚠ Vtube 진짜 디스크 폭증 — 가상환경(줄 수 아닌 용량)

| 용량 | 경로 |
|---|---|
| **1.6 GB** | `experiments/see-through-layer-decomp-001/.venv-comfyui` |
| 793 MB | `experiments/mini-cubism-pack-splitter-v0-001/.venv-hf-pack312` |
| 764 MB | `experiments/autorig-character-008/landmark_gate/venv` |
| 163 MB | `experiments/mini-cubism-pack-splitter-v0-001/.venv-hf-pack` |
| 65 MB ×2 | `.venv-cubism`, `.venv-cubism-v2-material` |

Vtube 상위 코드 "대용량" 목록의 실체는 대부분 이 venv 안 `site-packages`(torch/scipy/idna 등 26,000줄 파일) — **저작 파일 아님**. 실제 관리 대상은 venv를 git·백업에서 제외(`.gitignore`)하고 필요 시 재생성.

---

## 3. 권장 기준 (recommended thresholds)

기존 ChatterBox 스킬 값을 정식 규칙으로 승격 + 코드 기준 신설 제안:

**문서 (.md)**
- 핵심 내비/INDEX: **≤ 300줄** (기존값 유지)
- 계약/스펙 문서: 목표 ≤ 600줄, **> 800줄 = 분할 검토**
- 로그/SSOT: **> 1,500줄 = archive 회전 필수** (기존값)

**코드**
- 소스 파일: 목표 ≤ 300줄, **> 400줄 = 리뷰**, **> 700줄 = 분할 권장**
- eslint `max-lines: [warn, 500]` 추가 시 자동 감시 가능

**중복 (두 프로젝트 공통 실제 문제)**
- `rig.js`, `cmo3_structure_report.md` 같은 다중 복제본은 크기보다 **중복 제거**가 우선.

---

## 4. 우선 조치 후보 (action shortlist)

1. **ChatterBox** `SecurityPolicies.md`(2,426), `DATA-SCHEMA.md`(1,793) → 1,500줄 회전 임계 위반. 주제 경계로 분할하거나 archive.
2. **ChatterBox** `docs:health` 스크립트에 줄 수 게이트(예: >1,500 = 경고) 추가하면 자동 감시 성립.
3. **Vtube** venv 6종(총 ~3.4GB)을 `.gitignore`/백업 제외 확인 — 저장공간 최대 이득.
4. **Vtube** `rig.js`·`cmo3_structure_report.md` 중복본 정리(공유 소스 1개 + 심볼릭/생성).
5. 코드 줄 수 기준을 CONVENTIONS 문서에 명문화(현재 두 프로젝트 모두 부재).
