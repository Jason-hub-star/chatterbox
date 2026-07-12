<!-- opencode: 2026-06-30 - snack-web 문서를 ChatterBox로 가져오면서 랜딩/채터박스/공용 경계를 표시. Coded with OpenCode; high-cost model review recommended. -->
<!-- claude: 2026-07-01 - docs/snack-web 래퍼 폴더를 제거하고 docs/ 루트로 평탄화. 아래 경로는 모두 docs/snack-web/ 접두사 없이 읽는다. -->
<!-- claude: 2026-07-12 - G1 문서 리팩토링으로 대체됨(archive/landing/ 폴더가 경계를 표현, 지도는 docs/INDEX.md). 본문 경로는 재편 이전 기준 — 역사 보존용. -->

# snack-web 문서 이관 경계 (Boundary)

`/Users/family/jason/snack-web`의 문서를 통째로 `/Users/family/jason/ChatterBox/docs/`로 복사했습니다 (2026-07-01, `docs/snack-web/` 래퍼 제거 후 평탄화).
`snack-web`은 현재 Next.js 14 랜딩 페이지 저장소이면서, 동시에 Vite ChatterBox 앱의 설계 문서들을 함께 보관하고 있습니다.
아래 기준으로 랜딩 페이지 문서와 채터박스 앱 개발 문서를 명확히 구분하세요.

---

## 1. 폴터 단위 구분

| 경로 | 대상 | 설명 |
|---|---|---|
| `docs/contracts/` | **ChatterBox** | Vite SPA 컴포넌트별 계약서 34개 |
| `docs/state-machines/` | **ChatterBox** | Vite SPA 상태 머신 13개 |
| `docs/specs/` | **ChatterBox** | Vite SPA 기술 스펙 18개 (Auth, LiveKit, 테스트, 보안 등) |
| `docs/status/` | **ChatterBox** | SCOUT.md 구현 배턴 |
| `docs/design-references/REFERENCE-ANALYSIS.md` | **ChatterBox** | 새 플랫폼(ChatterBox) 랜딩 디자인 레퍼런스 분석 |
| `design/scene-prompts.md` | **ChatterBox** | Vite SPA 씬 시스템 PNG 프롬프트 |
| `design/stitch-mockups/` | **ChatterBox** | ChatterBox 인증 페이지 Stitch mockup |
| `design/DESIGN-TOKENS.md` | **Shared** | 랜딩/채터박스 공용 디자인 토큰 SSOT |
| `design/README.md` | **Shared** | design/ 폴터 구조 및 SSOT 연결점 |
| `design/flecto-reference/` | **Shared** | flecto.io 브랜드/디자인 추출물 |
| `docs/legal/` | **Shared** | 서비스 전체 법률/정책 문서 |
| `docs/INDEX.md` | **Shared** | snack-web 전체 문서 지도(양쪽 모두 포함) |
| `README.md` | **Landing** | VTuber 메이커 제품 랜딩 페이지 설명 |
| `docs/archive/landing/FRONTEND-MAP.md` | **Landing** | 랜딩 기술 스택/섹션/SSOT 지도 |
| `docs/status/PROJECT-STATUS.md` | **Landing** | 랜딩 페이지 프로젝트 상태 |
| `docs/archive/landing/CONTENT-GUIDE.md` | **Landing** | 랜딩 카피/텍스트 수정 가이드 |
| `docs/archive/landing/DEPLOY.md` | **Landing** | Vercel 랜딩 배포 절차 |
| `docs/archive/landing/FLECTO-80-PLAN.md` | **Landing** | flecto 톤 맞춤 6 Phase 계획 |
| `docs/archive/landing/FLECTO-90-PLAN.md` | **Landing** | 인터랙티브 UI 계획 |
| `docs/archive/landing/INTERACTION-PLAN.md` | **Landing** | 인터랙션+자산 슬롯 계획 |
| `docs/design-references/UI-REFERENCE-LANDING.md` | **Landing** | 랜딩 UI 레퍼런스/컴포넌트 |

---

## 2. 루트 `docs/` 파일별 분류

### ChatterBox 전용

- `docs/guides/DEVELOPMENT-GUIDE.md`
- `docs/specs/VITE-CONFIG.md`
- `docs/MILESTONES.md`
- `docs/CODING-CONVENTIONS.md`
- `docs/ops/INCIDENT-PLAYBOOK.md`
- `docs/ops/SUPPORT-PLAYBOOK.md`
- `docs/ops/MODERATION-OPS.md`
- `docs/ops/SECURITY-OPS.md`
- `docs/FEATURE-SPEC.md`
- `docs/PLATFORM-ARCHITECTURE.md`
- `docs/plan/PLATFORM-RESEARCH-SYNC.md`
- `docs/design/DESIGN-DIRECTION.md`
- `docs/DATA-SCHEMA.md`
- `docs/STORE-DEPENDENCY-MATRIX.md`
- `docs/FEATURE-CONTRACT-MAP.md`
- `docs/API-SURFACE.md`
- `docs/GAP-MATRIX.md`
- `docs/CONTRACT-HEALTH.md`
- `docs/specs/security/SECURITY-P0-REVIEW.md`
- `docs/specs/security/RUNTIME-HARDENING-REVIEW.md`
- `docs/design-references/UI-REFERENCE-PLATFORM.md`
- `docs/research/PLATFORM-REFERENCE-GAP-MAP.md`
- `docs/specs/ONBOARDING-FLOW.md`
- `docs/plan/COST-ESTIMATE.md`
- `docs/plan/PITCH-READINESS.md`
- `docs/plan/PRODUCT-READINESS.md`
- `docs/guides/DEFINITION-OF-DONE.md`
- `docs/plan/IMPLEMENTATION-ORDER.md`
- `docs/archive/STACK-COMPARE-AVATAR-RUNTIME.md`
- `docs/archive/STACK-COMPARE-VIDEOGEN.md`
- `docs/archive/STACK-COMPARE-ROUTER.md`
- `docs/archive/STACK-COMPARE-REALTIME.md`
- `docs/ops/DEPLOY-PLATFORM.md`

### 랜딩 전용

- `README.md`
- `docs/archive/landing/FRONTEND-MAP.md`
- `docs/status/PROJECT-STATUS.md`
- `docs/archive/landing/CONTENT-GUIDE.md`
- `docs/archive/landing/DEPLOY.md`
- `docs/archive/landing/FLECTO-80-PLAN.md`
- `docs/archive/landing/FLECTO-90-PLAN.md`
- `docs/archive/landing/INTERACTION-PLAN.md`
- `docs/design-references/UI-REFERENCE-LANDING.md`

### 양쪽 공용

- `docs/INDEX.md`
- `docs/legal/COPYRIGHT-DMCA.md`
- `docs/legal/PRIVACY-POLICY.md`
- `docs/legal/TERMS-OF-SERVICE.md`
- `docs/legal/DATA-EXPORT.md`
- `docs/legal/UGC-OWNERSHIP.md`
- `design/DESIGN-TOKENS.md`
- `design/README.md`
- `design/flecto-reference/*`

---

## 3. 사용 규칙

- **ChatterBox 앱 개발**을 위한 참고는 `docs/contracts/`, `docs/state-machines/`, `docs/specs/` 및 위 `ChatterBox 전용` 파일에 집중하세요.
- **랜딩 페이지** 관련 작업은 `README.md`와 `Landing 전용` 파일을 참고하세요.
- **공용 파일**은 양쪽에서 동시에 유효하지만, `snack-web` 쪽과 내용이 달라질 수 있으므로 향후 싱크 전략을 정하는 것을 권장합니다.
- `docs/INDEX.md`는 snack-web 전체 지도이므로, ChatterBox 전용 지도가 필요하면 별도로 재작성하세요.

---

*이 파일은 `snack-web` 문서를 `ChatterBox`로 통째로 복사한 후, 랜딩 페이지와의 경계를 명확히 하기 위해 생성되었습니다.*
