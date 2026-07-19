---
tags: [hub]
---

<!--
  claude: 2026-07-12 - G1 문서 리팩토링. 루트 52→14 축소, archive/·ops/·plan/ 신설,
  INDEX 를 폴더 1:1 구조로 재편(스크린샷: docs/goals/GOAL-LADDER.md G1).
  랜딩/플랫폼 경계 설명(구 BOUNDARY.md)은 archive/BOUNDARY.md 로 — 이제 폴더가 경계를 표현한다.
  새 문서 = ①폴더 선택(아래 지도) ②그 폴더 표에 한 줄 ③헤더 주석에 분류 라벨.
-->

# docs/ INDEX — 문서 지도

> **루트 = 게이트가 무는 SSOT 14개만.** 나머지는 전부 용도별 폴더. 문서를 찾을 땐 이 지도 → 폴더 → (contracts/state-machines 는 각자의 `_INDEX.md`).
> Updated: 2026-07-12 (G1 리팩토링)

## 분류 라벨

| 라벨 | 뜻 |
|---|---|
| **SSOT** | 현재 유효한 단일 진실 원천. 고칠 땐 여기를. |
| **설계** | 진행 중 아키텍처/결정 문서. 확정되면 SSOT로 승격. |
| **조사** | 근거 수집물. 종합되면 설계/SSOT로 흡수. |
| **완료/보존** | 실행이 끝났거나 결정이 반영된 문서. `archive/` 보관, 갱신 안 함. |
| **스크래치** | 휘발성 배턴(SCOUT 등). gitignore, SSOT 아님. |

## 폴더 지도

| 폴더 | 용도 | 파일 |
|---|---|---|
| (루트) | 게이트·스크립트가 무는 핵심 SSOT | 14 |
| `contracts/` | 컴포넌트 계약 (Props/Store/DataChannel/금지) → `contracts/_INDEX.md` | 38 |
| `state-machines/` | 상태머신 전환표·엣지케이스 → `state-machines/_INDEX.md` | 13 |
| `schema/` | DATA-SCHEMA 모듈 (기존 § 참조는 루트 허브에서 라우팅) → `schema/_INDEX.md` | 7 |
| `specs/` | 구현 입력 스펙 (LiveKit·rig·auth·미디어·테스트·온보딩·빌드설정) | 22 |
| `specs/security/` | 보안 스펙·리뷰 게이트 (SecurityPolicies 연계) | 8 |
| `design/` | 디자인 SSOT (토큰·씬·월드·룸 리디자인·디자인 방향) | 8 |
| `design-references/` | UI 레퍼런스 수집물 | 3 |
| `plan/` | 로드맵·우선순위·준비도·비용·방향 | 7 |
| `ops/` | 운영 플레이북 (인시던트·CS·모더레이션·보안 운영·플랫폼 배포) | 5 |
| `guides/` | 작성·개발 가이드, DoD | 3 |
| `legal/` | 약관·개인정보·저작권·팬아트 (법무 검토 대기) | 6 |
| `status/` | 상태판·인계(HANDOFF)·에이전트 운영·배턴 | 7 |
| `goals/` | 골 사다리(`GOAL-LADDER.md` 영구 인덱스)·활성 브리프 · 완료 브리프는 `goals/archive/` | 1+ |
| `research/` | 조사 원본 (보존 — DUB-TRIM UX 레퍼런스 포함) | 5 |
| `reference/` | golden-path 코드 패턴·마케팅 자동화 이식본 | patterns/ 등 |
| `archive/` | 결정 반영 완료된 조사·리뷰·상태 스냅샷 (STACK-COMPARE 4종·BUILD-QUEUE·REVIEW-LOG·룸 인계·flecto-reference/ 등) | 10 |
| `archive/landing/` | 구 snack-web 랜딩 문서 (사이트는 운영 중, 스택 레거시 — 새 플랫폼의 마케팅 입구로 흡수 예정) | 6 |
| `assets/` `meeting/` `overview/` | 도구·뷰(HTML)·에셋 — 에이전트 온보딩 대상 아님 | — |

## 루트 14 — 핵심 SSOT

| 파일 | 역할 | 상태 |
|---|---|---|
| `README.md` | 프로젝트 개요·빠른 시작 | SSOT |
| `INDEX.md` | 이 문서 지도 | SSOT |
| `FEATURE-SPEC.md` | 기능 SSOT (Feature ID·우선순위·의존) | **SSOT (기능)** |
| `FEATURE-CONTRACT-MAP.md` | Feature ID → 계약서·상태머신·스키마 역색인 | **SSOT (구현 라우팅)** |
| `STORE-DEPENDENCY-MATRIX.md` | 계약서별 store read/write·canonical 필드명 | **SSOT (store 경계)** |
| `API-SURFACE.md` | Edge Function/RPC 경계 — endpoint·auth·side effect | **SSOT (API 경계)** |
| `DATA-SCHEMA.md` | 스키마 허브 → `schema/` 모듈, DataChannel 프로토콜, PENDING | **설계 (구현 입력)** |
| `GAP-MATRIX.md` | 스펙 갭 감시판 + 진행 로그 | **설계 (진행추적)** |
| `PLATFORM-ARCHITECTURE.md` | SPA 아키텍처 + §12 폴더구조 | **설계** |
| `CODING-CONVENTIONS.md` | 네이밍·store 패턴·DoD 게이트(§6.1) | **설계 (구현 입력)** |
| `MILESTONES.md` | Phase 0~4 Acceptance Criteria (배포 게이트) | **설계 (진행 기준)** |
| `DOGFOOD-AUDIT-2026-07.md` | 도그푸딩 감사 백로그 (`/backlog` 소스·drift 대상) | **설계 (백로그)** |
| `ROOM-BACKLOG.md` | 룸 미구현 인덱스 (트랙 V/U·probe 회귀감시·drift 대상) | **설계 (룸 백로그)** |
| `CONTRACT-HEALTH.md` | 계약 문서망 건강 리포트 (`docs:health` 산출) | **SSOT (계약 건강)** |

> 루트 고정 사유: `scripts/check-contract-docs.mjs` 가 FEATURE-SPEC·FEATURE-CONTRACT-MAP·STORE-DEPENDENCY-MATRIX·DATA-SCHEMA·GAP-MATRIX(+contracts/·state-machines/ `_INDEX`)를, `scripts/check-backlog-drift.mjs` 가 ROOM-BACKLOG·DOGFOOD-AUDIT 를 경로 하드코딩으로 참조한다. 옮기려면 스크립트 동반 수정.

## 검증 명령 (문서망)

`npm run docs:check`(계약·스키마 분할 정합) · `docs:check:strict` · `docs:schema`(스키마 무손실·참조 교차검증) · `docs:drift`(백로그 probe STALE/REGRESSION) · `docs:links`(상대 md 링크 무결성) · `docs:health`(건강 리포트).

## 주요 폴더 상세

### plan/ — 방향·우선순위

`PLATFORM-RESEARCH-SYNC.md`(방향 SSOT) · `ROADMAP-LOBBY-V4.md`(로드맵) · `IMPLEMENTATION-ORDER.md`(구현 순서) · `PITCH-READINESS.md` · `PRODUCT-READINESS.md`(런치 게이트) · `GO-TO-MARKET.md` · `COST-ESTIMATE.md`(비용 모델).

### ops/ — 운영 플레이북

`INCIDENT-PLAYBOOK.md`(P0~P3 SLA·런북) · `SUPPORT-PLAYBOOK.md`(FAQ·환불 SQL) · `MODERATION-OPS.md`(신고 큐·조치) · `SECURITY-OPS.md`(키 로테이션·감사 주기) · `DEPLOY-PLATFORM.md`(플랫폼 배포 절차).

### specs/ — 구현 입력 (발췌)

`livekit-edge-fn.md` · `rig-format.md`(rig SSOT) · `avatar-pipeline.md` · `SecurityPolicies.md` · `supabase-auth.md` · `ONBOARDING-FLOW.md`(온보딩 3트랙) · `VITE-CONFIG.md`(빌드 설정) · `TestStrategy.md` · `MonitoringDashboard.md` · `MediaConfig.md`·`MediaPipeConfig.md`·`NetworkAdaptiveQuality.md` · `RefundPolicy.md` · `FeatureFlags.md` · 운영·접근성·백업 등. **보안 리뷰 게이트**는 `specs/security/`: `PLATFORM-SECURITY-RISKS-B.md`·`SECURITY-P0-REVIEW.md`·`RUNTIME-HARDENING-REVIEW.md`.

### design/ — 디자인 SSOT

`DESIGN-TOKENS.md`(색·모션 토큰) · `DESIGN-DIRECTION.md`(비주얼 컨셉·룸 존 스펙) · `scene-prompts.md`(씬 에셋 SSOT) · `WORLD-SYSTEM.md`(월드 아키텍처) · `ROOM-REDESIGN-2026-07.md`(룸 리디자인 as-built) · `UX-GAPS-AND-PATTERNS.md` · `uiux-distilled.md`(UX 원칙 48).

### guides/ — 가이드

`DEFINITION-OF-DONE.md` · `DEVELOPMENT-GUIDE.md` · `OAUTH-SETUP.md`(카카오·구글 간편인증 켜기 — 코드 완료, 콘솔 3곳 설정+`VITE_OAUTH_PROVIDERS` 플래그만 잔여).

### status/ — 상태·인계·에이전트 운영

`AGENT-OPS.md`(에이전트 진입 SSOT·루틴) · `PROJECT-STATUS.md` · HANDOFF 시리즈(트랙 인계 진입점) · `SCOUT.md`(배턴, gitignore) · doc-health 스냅샷.

### goals/ — 골 사다리

`GOAL-LADDER.md`(8골 상태판 + 사다리 밖 스몰윈 표·승인 게이트·defer 대장 — **영구 인덱스**) · 활성 `GOAL-*.md`(골별 6요소 브리프) · 완료(배포 종결) 브리프는 `goals/archive/`(§7 감사추적 보존).

## 구현 독서목록 — Feature ID 로 진입

> 코딩 시작 시 순서대로 읽으면 컨텍스트 완성. Feature ID 모르면 `FEATURE-SPEC.md` 검색 → 여기로.

| 구현 대상 | Feature ID | 읽을 순서 |
|---|---|---|
| 로그인/회원가입 | AUTH-01~03 | `contracts/AuthPage.md` → `contracts/AgeGate.md` → `state-machines/Auth.md` → `specs/supabase-auth.md` |
| 로비 | LOB-01~05 | `contracts/LobbyPage.md` → `state-machines/Room.md` → `DATA-SCHEMA.md §rooms` |
| 아바타 렌더링 | ROOM-03 | `contracts/AvatarCanvas.md` → `state-machines/Avatar.md` → `specs/rig-format.md` |
| WebRTC 룸 입장 | ROOM-04 | `contracts/RoomView.md` → `specs/livekit-edge-fn.md` → `state-machines/Room.md` |
| 서버 API 경계 | Edge/RPC | `API-SURFACE.md` → 대상 계약서 → `specs/SecurityPolicies.md` |
| 분장실 | MOD-05~06 | `contracts/GreenRoom.md` → `state-machines/Tracking.md` → `specs/ONBOARDING-FLOW.md §3` |
| VGEN | VGEN-01~12 | `contracts/VgenPanel.md` → `state-machines/Vgen.md` → `archive/STACK-COMPARE-VIDEOGEN.md` → `DATA-SCHEMA.md §vgen_jobs` |
| 쇼츠 내보내기 | VGEN-11~12 | `contracts/VgenExport.md` → `state-machines/Vgen.md §VGEN-11` |
| 더빙 (DUB) | DUB-01~05 | `contracts/DubSessionSelector.md` → `contracts/DubRoleAssigner.md` → `contracts/DubRecorder.md` → `contracts/DubCompositor.md` → `state-machines/DubSession.md` |
| 모바일 관전 | MOB-01~03 | `contracts/MobileViewer.md` → `contracts/ViewerGate.md` → `API-SURFACE.md §Mobile Viewer` |
| 무대 레이아웃 | ROOM-02 | `contracts/StageLayout.md` → `contracts/ParticipantSlot.md` → `design/DESIGN-DIRECTION.md §6.4` |
| 우측 패널 | ROOM 공통 | `contracts/RightPanel.md` → `contracts/VgenPanel.md` |
| 얼굴 트래킹 | ROOM-03 | `state-machines/Tracking.md` → `contracts/AvatarCanvas.md` → `specs/MediaPipeConfig.md` |
| 초대 링크 | LOB-05 | `specs/ONBOARDING-FLOW.md §트랙A` → `contracts/LobbyPage.md` → `API-SURFACE.md §accept-invite` |
| Phase 1 보안 게이트 | SEC | `specs/SecurityPolicies.md` → `specs/security/SECURITY-P0-REVIEW.md` → `specs/security/RUNTIME-HARDENING-REVIEW.md` → `ops/SECURITY-OPS.md` |
| 비용·크레딧 | VGEN/크레딧 | `plan/COST-ESTIMATE.md` → `specs/VgenCostAnalysis.md` → `DATA-SCHEMA.md §credits` |
| 피치 증거 | 투자자 | `plan/PITCH-READINESS.md` → `MILESTONES.md` → `plan/COST-ESTIMATE.md` → `ops/MODERATION-OPS.md` |
| 출시 준비도 | Alpha/Public | `plan/PRODUCT-READINESS.md` → `API-SURFACE.md` → `ops/SUPPORT-PLAYBOOK.md` |
| 법무 검토 | 런칭 전 | `legal/TERMS-OF-SERVICE.md` → `legal/PRIVACY-POLICY.md` → `legal/COPYRIGHT-DMCA.md` → `legal/UGC-OWNERSHIP.md` |
| Feature ID 추적 | 전체 | `FEATURE-CONTRACT-MAP.md` → 대상 `contracts/*.md` → `STORE-DEPENDENCY-MATRIX.md` → `npm run docs:check` |

### 구현 레퍼런스 패턴 (버전 고정 golden-path)

`reference/patterns/` — `livekit-client.md` · `pixijs-v8-avatar-render.md` · `falai-vgen-pipeline.md` · `react-router-routing.md` · `avatar-forge-pipeline.md`. 버전 고정 + 설치버전 대조 필수(각 문서 "검수 노트").

## 에이전트 운영

진입점 `status/AGENT-OPS.md`(루틴 매트릭스·트리거 플랜) · CS 분류 `.claude/skills/cs-triage/SKILL.md`. 루틴: 문서 건강성(매일)·보안 드리프트(주간)·CS 분류(매시간)·GAP 리뷰(주간 금).

## 한 줄 규칙

- **고칠 땐 SSOT를.** 설계/조사는 승격 전까지의 근거.
- **새 문서 = 폴더 선택(지도) + 그 폴더 표에 한 줄 + 헤더 주석에 분류 라벨.**
- **새 Feature ID/계약/store 필드 = `FEATURE-CONTRACT-MAP.md` + `STORE-DEPENDENCY-MATRIX.md` + `npm run docs:check`.**
- **구현 착수 전 = `docs:check:strict` · 링크 검사 = `docs:links` · 상태판 = `docs:health`.**
- **에이전트가 깨어나면 `status/AGENT-OPS.md`, 골 진행은 `goals/GOAL-LADDER.md` 먼저.**
