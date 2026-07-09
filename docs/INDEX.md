---
tags: [hub]
---

<!--
  opencode: 2026-06-26 - docs/ 문서 지도. STACK-COMPARE 3종 상태를 완료로 갱신.
  Coded with OpenCode; high-cost model review recommended.
  어떤 문서가 현행 SSOT이고 무엇이 조사·완료·스크래치인지 한눈에.
  새 문서 추가 시 이 표에 한 줄 등록. 분류 라벨을 헤더 주석에도 함께 남길 것.
-->

# docs/ INDEX — 문서 지도

> **목적:** `snack-web` 레포엔 두 갈래가 공존한다 — ⓐ **현행 랜딩 사이트**(운영 중)와 ⓑ **새 플랫폼**(버튜버 연극, 설계·조사 단계). 둘이 한 폴더에 섞여 헷갈리므로 여기서 갈래·상태를 못 박는다.
> 관계: 랜딩(ⓐ)은 폐기가 아니라 **새 플랫폼(ⓑ)의 마케팅 입구**로 흡수 예정 (`PLATFORM-RESEARCH-SYNC.md` §7).
> Updated: 2026-06-30

## 분류 라벨

| 라벨 | 뜻 |
|---|---|
| **SSOT** | 현재 유효한 단일 진실 원천. 고칠 땐 여기를. |
| **설계** | 진행 중 아키텍처/결정 문서. 확정되면 SSOT로 승격. |
| **조사** | 근거 수집물(링크 포함). 종합되면 설계/SSOT로 흡수. |
| **완료계획** | 이미 실행 끝난 Phase 계획. 참고용 보존, 갱신 안 함. |
| **스크래치** | 휘발성 작업 메모(배턴 등). gitignore 대상, SSOT 아님. |

---

## ⓐ 현행 랜딩 사이트 (snack-web-khaki.vercel.app, 운영 중)

> ⚠️ **이중 상태 주의:** 사이트는 **운영 중(문서는 현행 SSOT)** 이나, 그 **스택은 레거시**(Next.js 14 / Tailwind 3 / framer-motion 11)로 새 플랫폼 전환 시 폐기 예정 — **ⓔ 참조**. "문서 SSOT"와 "스택 레거시"를 헷갈리지 말 것.

| 파일 | 역할 | 상태 |
|---|---|---|
| `README.md` | 프로젝트 개요·빠른 시작 | SSOT |
| `FRONTEND-MAP.md` | 기술 스택·섹션·SSOT·교체 레시피 지도 | **SSOT (기술)** |
| `PROJECT-STATUS.md` | 현재 산출물·빌드·기능 요약 | SSOT (상태) |
| `CONTENT-GUIDE.md` | 카피·브랜드명 수정 가이드 | SSOT (텍스트) |
| `DEPLOY.md` | Vercel 배포 절차·프로덕션 상태 | SSOT (배포) |
| `FLECTO-80-PLAN.md` | flecto 80% 톤 맞춤 6 Phase | 완료계획 ✅ |
| `FLECTO-90-PLAN.md` | 인터랙티브 UI로 flecto 90%+ | 완료계획 ✅ |
| `INTERACTION-PLAN.md` | 인터랙션 강화 + 자산 슬롯 | 완료계획 ✅ |

## ⓑ 새 플랫폼 — 버튜버 연기 (설계·조사 단계)

| 파일 | 역할 | 상태 |
|---|---|---|
| `PLATFORM-RESEARCH-SYNC.md` | Vtube 비전·플랫폼 방향 동기화 (조사 SSOT) | **SSOT (방향)** |
| `PLATFORM-ARCHITECTURE.md` | Vite+React SPA 아키텍처 (Option B) | **설계** |
| `PLATFORM-SECURITY-RISKS-B.md` | 스택 리스크·보안·CVE (지뢰 L1~L5 + Phase 게이트) | **설계 (검증완료)** |
| `SECURITY-P0-REVIEW.md` | P0 취약점 확인·차단 규칙·자기리뷰 체크리스트 | **설계 (보안 게이트)** |
| `RUNTIME-HARDENING-REVIEW.md` | H1-H16 런타임 하드닝 확인·차단 규칙·자기리뷰 체크리스트 | **설계 (런타임 게이트)** |
| `FEATURE-SPEC.md` | 구현 기능 SSOT (페이지·우선순위·의존, ★보강 포함) | **SSOT (기능)** |
| `FEATURE-CONTRACT-MAP.md` | Feature ID → 계약서·상태머신·스키마 역색인 (`ROOM-19` 등 수동 탐색 방지) | **SSOT (구현 라우팅)** |
| `STORE-DEPENDENCY-MATRIX.md` | 계약서별 Zustand store read/write 및 canonical field name (`stageStore.mode`, `credits.balance`) | **SSOT (store 경계)** |
| `API-SURFACE.md` | Edge Function/RPC/직접 Supabase read 경계 — endpoint·input·output·auth·side effect | **SSOT (API 경계)** |
| `PITCH-READINESS.md` | 심사위원 질문·취약점·Must-show 증거·14일 피치 복구 플랜 | **SSOT (피치 증거)** |
| `PRODUCT-READINESS.md` | 사용자 편의·신뢰·보안 영향·운영 기준의 Sprint/Alpha/Public launch gate | **SSOT (제품 준비도)** |
| `CONTRACT-HEALTH.md` | 계약 문서망 health report — 기본/strict 게이트, blocker, inventory 요약 | **SSOT (계약 건강)** |
| `STACK-COMPARE-ROUTER.md` | 라우터 대안 비교 (react-router7 vs TanStack) | 조사 ✅ — react-router 8 채택 (PLATFORM-ARCHITECTURE §2.1 최종) |
| `STACK-COMPARE-AVATAR-RUNTIME.md` | 아바타 런타임 비교 (자체 미니큐비즘 vs PixiJS vs Cubism SDK) | 조사 ✅ — PixiJS v8 단일 WebGL 구조 + BBW/LBS 승격 결정 |
| `STACK-COMPARE-REALTIME.md` | 실시간 비교 (LiveKit vs Cloudflare Realtime) | 조사 ✅ — LiveKit 유지 결정 |
| `STACK-COMPARE-VIDEOGEN.md` | 협업 AI 영상생성 메인뷰 (API·비동기·비용·모더레이션·녹화) | 조사 ✅ — **Seedance 2.0(fal.ai)** 1차 + 어댑터 폴백 / CF Workflows, 출처검증 완료 |
| `UI-REFERENCE-LANDING.md` | 랜딩 UI 레퍼런스·컴포넌트 | 조사 ✅ |
| `UI-REFERENCE-PLATFORM.md` | 플랫폼/룸 UI 레퍼런스·컴포넌트 | 조사 ✅ |
| `PLATFORM-REFERENCE-GAP-MAP.md` | VRChat·Gather·Jackbox·Twitch·Discord·Figma 등 레퍼런스 → ChatterBox 갭/Feature ID 매핑 | 조사 |
| `state-machines/` | 12개 상태 머신 다이어그램·전환표·엣지 케이스 (`_INDEX.md` + 12개 파일) | **설계 (구현 입력)** |
| `DATA-SCHEMA.md` | Supabase CREATE TABLE refs 30개 + DataChannel 프로토콜 + PENDING 체크박스 | **설계 (구현 입력)** |
| `contracts/` | 37개 컴포넌트 계약 (`_INDEX.md` + AgeGate·ViewerGate·DUB·OBS·Mobile·Profile·ErrorBoundary·FriendSystem·NetworkStatusIndicator 계약 포함) | **설계 (구현 입력)** |
| `DESIGN-DIRECTION.md` | 비주얼 컨셉(모닥불)·씬 시스템·GPT Image 2 파이프라인·룸 레이아웃 E형 SSOT | **설계 (구현 입력)** |
| `ONBOARDING-FLOW.md` | 통합 온보딩 3트랙(초대·직접·재방문) + 공통 Green Room 게이트 | **설계 (구현 입력)** |
| `GAP-MATRIX.md` | 구현 전 누락 스펙 감시판 — 블로커·계약·SM 갭 추적 | **설계 (진행추적)** |
| `FORWARD-REVIEW-2026-07.md` | 착수 전 향후취약점·미리설계 seam 리뷰 (Haiku스캔→Fable리뷰→Opus충돌검증+외부조사). GAP-MATRIX G-268~G-279 근거 | 조사/설계 |
| `DOGFOOD-AUDIT-2026-07.md` | 도그푸딩 감사(6 페르소나) 발견 SSOT + 최우선 구현 백로그(P0~P2 체크리스트). 스킬 `dogfood-audit` 산출물 | **설계 (보안+UX 백로그)** |
| `ROADMAP-LOBBY-V4.md` | 로비 v3 IA 재편 완료 기록 + 다음 개발 로드맵(관별 기능 고도화 + UIUX 고도화, 우선순위·Feature ID 연결) | **설계 (로드맵)** |
| `specs/livekit-edge-fn.md` | LiveKit 토큰 발급 Edge Function 코드·환경변수·배포 | **설계 (구현 입력)** |
| `specs/rig-format.md` | **rig 포맷 SSOT** — AUTORIG mesh-deform `project.json`(연속 ParamXxx·키폼/FFD)·blendshape→Param 매핑·컨벤션 계약 (2026-07-02 정정, v1 variant-swap 강등) | **설계 (구현 입력)** |
| `specs/avatar-pipeline.md` | **버튜버 제작 파이프라인 + 출력 계약**(Vtube AUTORIG→ChatterBox 증류) — E2E·립싱크/표정 2계층·매핑 갭·원천 링크 | **설계 (구현 입력)** |
| `specs/SecurityPolicies.md` | 인증·RLS·LiveKit 토큰·미디어·모더레이션·DataChannel·환경변수 + Phase 1 게이트 | **설계 (구현 입력)** |
| `specs/supabase-auth.md` | Supabase Auth·Google OAuth·models 테이블 스키마·RLS | **설계 (구현 입력)** |

> **진행 순서:** STACK-COMPARE 3종(스택 확정) → ARCHITECTURE-B 갱신 → UI-REFERENCE 2종 → 구현. 스택이 흔들리면 UI도 영향받으므로 스택 비교가 선행.
> **Updated: 2026-06-29** — P0 보안 감사 + H1-H16 런타임 하드닝 반영. LiveKit/RLS/R2/FAL/DataChannel/StageMode/host transfer/reconnect 반영. OBS는 P2 방송 송출 옵션으로 격하.
> **Updated: 2026-06-30** — PLATFORM-ARCHITECTURE §12 ChatterBox 폴더구조 추가(G-139). 저장소 경로 `/Users/family/jason/ChatterBox` 확정. TestStrategy §10·MonitoringDashboard §알림임계값 확장. ⓖ 구현 준비 문서 7개 신규 등록.
> **Updated: 2026-07-01** — 하이쿠 4역할(보안/상태머신/기능갭/운영) 병렬 감사 후 오푸스로 반영. 신규 계약 `contracts/FriendSystem.md`·`contracts/NetworkStatusIndicator.md`, 신규 스펙 `specs/RefundPolicy.md`, GAP-MATRIX G-195~G-203 등록. `specs/MonitoringDashboard.md`·`specs/BackupDisasterRecovery.md`·`specs/FeatureFlags.md`는 기존 등록 자리에 실제 내용 채움. `SecurityPolicies.md`·`ViewerGate.md`·`DubSession.md`·`HostAuthority.md` 등 정합성/보안 갭 반영.

## ⓒ 디자인 시스템 (양쪽 공유)

| 파일 | 역할 | 상태 |
|---|---|---|
| `design/DESIGN-TOKENS.md` | 색·타이포·여백·radius·shadow·모션 토큰 | **SSOT (디자인)** |
| `design/scene-prompts.md` | 씬 레이어 PNG 프롬프트 원본(5씬×25레이어+공용FX)·생성/검증 실측·layers_json 초기 배치값·WebP 정책 | **SSOT (씬 에셋)** |
| `design/WORLD-SYSTEM.md` | 세계관(World) 시스템 — 씬 매니페스트 월드축 구조·worldStore 우선순위·월드 갤러리·무한 확장 규칙 | **SSOT (월드 아키텍처)** |
| `design/uiux-distilled.md` | 전문가 영상 증류 UI/UX 원칙 48개 + ChatterBox 적용 Top10 | 조사/설계 (UX 원칙 SSOT) |
| `design/UX-GAPS-AND-PATTERNS.md` | 도그푸딩 감사(dogfood-audit) 반영 UX 갭→수정 + 재사용 프리미티브 선설계 | **설계 (UX 구현 입력)** |
| `design/ROOM-REDESIGN-2026-07.md` | 룸 원형 무대 리디자인 — 컨셉→구현 스펙(존 분해·MVP/defer·R1~R4 페이즈·계약 개정). DESIGN-DIRECTION §6 와이어프레임 1패스 | **설계 (룸 구현 입력)** |
| `design/README.md` | 토큰 폴더 구조·연결점 | SSOT |
| `design/flecto-reference/*.md` | flecto.io 설계언어 추출 | 조사 |

## ⓓ 조사 원본 / 스크래치

| 경로 | 역할 | 상태 |
|---|---|---|
| `research/BUILD-STACK-CVE-RESEARCH.md` | 빌드스택 6종 CVE 원시 조사 (Haiku) → **SECURITY-RISKS-B에 흡수됨** | 조사 (보존) |
| `status/HANDOFF-TRACK-B.md` | **트랙 B(UIUX) 인계 — Fable 담당.** seam→표현 매핑·백로그·제약. 트랙 A(로직·보안·seam) 완료 후 진입점 | **인계 (트랙 B 진입점)** |
| `status/SCOUT.md` | 세션 배턴 — 다음 세션 진입점(`latest:` 최신 상태) | 스크래치 (gitignore) |
| `meeting/index.html` | 기능 배치 회의 보드(자유 캔버스, localStorage) | 도구 (회의 스냅샷 → JSON로 SPEC 역반영) |
| `meeting/ux-layout-picker.html` | UX 레이아웃 피커 — Settings·Stage·VGen·DUB·예약·게스트 템플릿 + 아이콘 디렉션 | 도구 (선택 후 계약서 작성 착수) |
| `overview/chatterbox-system-designer.html` | PM용 시스템 설계 뷰(용어 툴팁·도메인 상태 토글·JSON export). **SSOT 아님 — SPEC/ARCHITECTURE에서 파생한 사람용 뷰** | 도구 (뷰, 에이전트 온보딩 대상 아님) |
| `overview/chatterbox-branch-designer.html` | PM용 분기 설계 스튜디오(참/거짓 시뮬레이터·드래그 순서편집). **SSOT 아님** | 도구 (뷰) |
| `overview/chatterbox-system-overview.html` | 정적 시스템 개요 프레젠테이션(designer의 읽기전용 스냅샷) | 도구 (뷰, 보존) |

> **원시 조사 보존 정책:** 서브에이전트 원시 리포트는 `research/`에 둔다. LiveKit·MediaPipe·PixiJS·Supabase·Cloudflare 원시 조사 5종은 파일로 남기지 않고 `PLATFORM-SECURITY-RISKS-B.md`로 직접 종합했다(종합본이 SSOT). 재현이 필요하면 동일 프롬프트로 재조사.

## ⓔ 레거시 / 폐기 예정 (새 플랫폼 전환 시)

> 상세·근거는 `PLATFORM-ARCHITECTURE.md` §8, `PLATFORM-RESEARCH-SYNC.md` §6. 여기선 한눈 요약. **아직 전환 전이라 현재는 살아서 운영 중** — "폐기 예정"이지 "이미 죽음"이 아니다.

**폐기 예정 스택** (현행 랜딩 → 새 플랫폼)

| 레거시 | 대체 |
|---|---|
| Next.js 14.2.21 (App Router) | Vite 6 SPA |
| React 18.3.1 | React 19 |
| Tailwind CSS 3.4.17 | Tailwind 4 |
| framer-motion 11 | motion v12 |
| lottie-react | @lottiefiles/dotlottie-react |

**폐기 예정 코드/설정**

| 대상 | 비고 |
|---|---|
| `src/app/page.tsx`, `next.config.mjs`, `.eslintrc.json` | Next.js App Router·전용 설정 |
| `src/components/sections/` | 랜딩 섹션 — **메시지만 추출** 후 폐기 |
| `next/font` | 폰트 최적화 → public/fonts |

**⚠️ 레거시 ≠ 이관 자산(재활용):** `content.ts`→i18n, `assets.ts`→public, `DESIGN-TOKENS`→Tailwind4, Lottie JSON→dotLottie, `akane.png` 등은 **폐기가 아니라 새 플랫폼으로 이관**한다(ARCHITECTURE-B §8 "활용 방안"). 폐기 목록과 혼동 금지.

---

## ⓖ ChatterBox 구현 준비 문서

> ChatterBox(`/Users/family/jason/ChatterBox`) Vite SPA 착수 전 작성된 구현·운영 준비 문서. GAP-MATRIX 9차 분석(G-139~G-149) 산출물.

| 파일 | 역할 | 상태 | GAP |
|---|---|---|---|
| `VITE-CONFIG.md` | Vite 5 + Tailwind 4 전체 빌드 설정 (패키지·vite.config·CSS 토큰·tsconfig·bundle 목표) | **설계 (구현 입력)** | G-140 |
| `MILESTONES.md` | Phase 0~4 마일스톤 + Acceptance Criteria (인프라→WebRTC→VGEN→운영→런칭) | **설계 (진행 기준)** | G-141 |
| `CODING-CONVENTIONS.md` | 파일명·Zustand 슬라이스·DataChannel 디스패처·async 에러·import 순서 규칙 | **설계 (구현 입력)** | G-142 |
| `INCIDENT-PLAYBOOK.md` | P0~P3 심각도·SLA·런북 3개·포스트모템 템플릿·FF 완화 절차 | **운영 (구현 입력)** | G-145 |
| `SUPPORT-PLAYBOOK.md` | FAQ 6개·버그 리포트 접수·크레딧 환불 SQL·주간 지원 리뷰 | **운영 (구현 입력)** | G-146 |
| `MODERATION-OPS.md` | 신고 큐 절차·조치 종류·이의제기 SLA·운영자 SQL·주간 리포트 | **운영 (구현 입력)** | G-147 |
| `SECURITY-OPS.md` | API 키 90일 로테이션·npm audit·분기 액세스 리뷰·RLS 검토·Phase 4 배포 전 체크리스트 | **운영 (구현 입력)** | G-149 |

**확장된 기존 파일** (이번 세션 추가분)

| 파일 | 추가 내용 | GAP |
|---|---|---|
| `PLATFORM-ARCHITECTURE.md` | §12 ChatterBox 폴더구조·배럴 export 금지 정책 추가 | G-139 |
| `specs/TestStrategy.md` | §10 크로스컴포넌트 통합 시나리오 5개 추가 | G-143 |
| `specs/MonitoringDashboard.md` | §알림임계값·Sentry Alert 룰·수신자 정의 추가 | G-144 |

**확장된 기존 파일 (루트 레벨 구현 입력)**

| 파일 | 역할 | 상태 |
|---|---|---|
| `DEFINITION-OF-DONE.md` | 기능별 완료 기준 체크리스트 | **설계 (구현 기준)** |
| `DEVELOPMENT-GUIDE.md` | 로컬 환경 구성·PR 절차·컨벤션 요약 | **설계 (구현 입력)** |
| `IMPLEMENTATION-ORDER.md` | 기능 구현 우선순위·의존 순서 | **설계 (구현 입력)** |
| `DEPLOY-PLATFORM.md` | 플랫폼 배포 인프라 절차 (DEPLOY.md 플랫폼 전용 확장) | **설계 (배포)** |
| `COST-ESTIMATE.md` | 인프라·API 비용 모델 추정 | **조사 (피치 근거)** |
| `GO-TO-MARKET.md` | 사전등록→채널 전환 SOP·초기 획득 채널 계획 (G-247) | **설계 (그로스 입력)** |
| `reference/marketing-automation/` | Threads/Instagram/YouTube 발행 코드+cron 스펙 이식본 (자매 프로젝트, Phase 2 착수 시 사용) | **레퍼런스 (미실행)** |

**도구 스크래치** (gitignore 대상)

| 경로 | 역할 |
|---|---|
| `scripts/obsidian_setup.py` | Obsidian Graph View 설정 자동화 (symlink·frontmatter·wikilink 변환) |

---

## ⓗ 운영·법무 스펙

> 런칭 전 완료해야 할 법무·접근성·운영 정책 문서. 개발자보다 법무·운영팀 입력 필요.

### 법무 (legal/)

| 파일 | 역할 | 상태 |
|---|---|---|
| `legal/TERMS-OF-SERVICE.md` | 서비스 이용약관 | **설계 (법무 검토 필요)** |
| `legal/PRIVACY-POLICY.md` | 개인정보처리방침 | **설계 (법무 검토 필요)** |
| `legal/COPYRIGHT-DMCA.md` | 저작권·DMCA 신고 절차 | **설계 (법무 검토 필요)** |
| `legal/DATA-EXPORT.md` | 사용자 데이터 내보내기 정책 (GDPR·개인정보법) | **설계 (법무 검토 필요)** |
| `legal/UGC-OWNERSHIP.md` | 사용자 생성 콘텐츠 소유권 정책 | **설계 (법무 검토 필요)** |
| `legal/FANART-POLICY.md` | 이차창작(二次創作)/팬아트 허용·불허 기준 (G-253) | **설계 (법무 검토 필요)** |

### 운영 스펙 (specs/ 미등록분)

| 파일 | 역할 | 상태 |
|---|---|---|
| `specs/AccessibilityPolicy.md` | WCAG 준수 기준·스크린리더·키보드 네비 | **설계 (운영 입력)** |
| `specs/BackupDisasterRecovery.md` | DB 백업 주기·복구 RTO/RPO | **설계 (운영 입력)** |
| `specs/CommunityGuidelines.md` | 커뮤니티 행동 강령·금지 콘텐츠 기준 | **설계 (운영 입력)** |
| `specs/FeatureFlags.md` | 피처 플래그 관리·롤아웃 절차 | **설계 (운영 입력)** |
| `specs/FeedbackChannel.md` | 사용자 피드백 수집 채널·처리 절차 | **설계 (운영 입력)** |
| `specs/MediaConfig.md` | 미디어 코덱·해상도·비트레이트 설정 | **설계 (구현 입력)** |
| `specs/MediaPipeConfig.md` | MediaPipe FaceMesh 설정·성능 임계값 | **설계 (구현 입력)** |
| `specs/MigrationStrategy.md` | DB 마이그레이션 절차·롤백 전략 | **설계 (운영 입력)** |
| `specs/MonitoringDashboard.md` | Grafana/Sentry 대시보드·알림 임계값 | **설계 (운영 입력)** |
| `specs/NetworkAdaptiveQuality.md` | 네트워크 품질 적응형 미디어 전략 | **설계 (구현 입력)** |
| `specs/RefundPolicy.md` | VGEN/DUB 실패 자동 환불 기준·분쟁신청 SLA·`refund-credit` Edge Function | **설계 (운영 입력)** |
| `specs/SentryConfig.md` | Sentry DSN·PII 필터·Alert 룰 | **설계 (구현 입력)** |
| `specs/VgenCostAnalysis.md` | VGEN fal.ai 비용 분석·크레딧 환율 | **조사 (피치 근거)** |
| `specs/TestStrategy.md` | 테스트 전략·통합 시나리오 5개 | **설계 (QA 입력)** |
| `specs/_FSM-VALIDATION.md` | 상태머신 유효성 검사 규칙 도구 | **도구** |

---

## ⓕ 구현 독서목록 — 기능별 읽어야 할 파일 순서

> 코딩 시작 시 Feature ID로 바로 진입. 순서대로 읽으면 컨텍스트 완성.

| 구현 대상 | Feature ID | 읽을 순서 |
|---|---|---|
| 로그인 / 회원가입 | AUTH-01~03 | `contracts/AuthPage.md` → `contracts/AgeGate.md` → `state-machines/Auth.md` → `specs/supabase-auth.md` |
| 로비 (방 목록·생성) | LOB-01~05 | `contracts/LobbyPage.md` → `state-machines/Room.md` → `DATA-SCHEMA.md §rooms` |
| 아바타 렌더링 | ROOM-03 | `contracts/AvatarCanvas.md` → `state-machines/Avatar.md` → `specs/rig-format.md` → `DATA-SCHEMA.md §models` |
| WebRTC 룸 입장 | ROOM-04 | `contracts/RoomView.md` → `specs/livekit-edge-fn.md` → `state-machines/Room.md` |
| 서버 API 경계 | API/Edge Function | `API-SURFACE.md` → 대상 계약서/스키마 → `specs/SecurityPolicies.md` |
| 분장실 (Green Room) | MOD-05~06 | `contracts/GreenRoom.md` → `state-machines/Tracking.md` → `ONBOARDING-FLOW.md §3` |
| 온보딩 전체 흐름 | AUTH+온보딩 | `ONBOARDING-FLOW.md` → `contracts/AuthPage.md` → `contracts/AgeGate.md` → `contracts/LobbyPage.md` → `contracts/GreenRoom.md` → `DATA-SCHEMA.md §onboarding_step` |
| AI 영상 생성 (VGEN) | VGEN-01~12 | `contracts/VgenPanel.md` → `state-machines/Vgen.md` → `STACK-COMPARE-VIDEOGEN.md` → `DATA-SCHEMA.md §vgen_jobs` |
| 쇼츠 내보내기·공유 | VGEN-11~12 | `contracts/VgenExport.md` → `state-machines/Vgen.md §VGEN-11` → `DATA-SCHEMA.md §vgen_jobs` |
| 더빙 세션 (DUB) | DUB-01~05 | `contracts/DubSessionSelector.md` → `contracts/DubRoleAssigner.md` → `contracts/DubRecorder.md` → `contracts/DubCompositor.md` → `state-machines/DubSession.md` → `DATA-SCHEMA.md §dub_sessions` |
| 더빙 녹화 (생성영상) | VGEN-07 | `contracts/VgenPanel.md §3` → `state-machines/Vgen.md` |
| 모바일 관전 (MobileViewer) | MOB-01~03 | `contracts/MobileViewer.md` → `contracts/ViewerGate.md` → `API-SURFACE.md §Mobile Viewer APIs` → `specs/SecurityPolicies.md §SEC-RL` |
| OBS 방송 송출 | OBS-01 | `contracts/OBSViewer.md` → `API-SURFACE.md §OBS/Public Viewer APIs` → `DATA-SCHEMA.md §obs_viewer_tokens` |
| 룸 진입 게이트 | G-158 | `contracts/ViewerGate.md` → `ONBOARDING-FLOW.md` → `contracts/LobbyPage.md` → `specs/SecurityPolicies.md §RLS` |
| 디렉터 노트 | ROOM-17 | `contracts/RightPanel.md §ROOM-17` |
| 얼굴 트래킹 | ROOM-03 | `state-machines/Tracking.md` → `contracts/AvatarCanvas.md` → `specs/MediaPipeConfig.md` |
| 초대 링크 | LOB-05 | `ONBOARDING-FLOW.md §트랙A` → `contracts/LobbyPage.md §InviteLinkSection` → `API-SURFACE.md §accept-invite` |
| 무대 레이아웃 엔진 | ROOM-02 | `contracts/StageLayout.md` → `contracts/ParticipantSlot.md` → `DESIGN-DIRECTION §6.4` |
| 우측 패널 5탭 | ROOM 공통 | `contracts/RightPanel.md` → `contracts/VgenPanel.md` → `DESIGN-DIRECTION §6.3` |
| 설정 (오디오·성능·크레딧) | SET-01~08 | `contracts/SettingsPage.md` → `DATA-SCHEMA.md §expression_presets` |
| AI 영상생성 상태머신 | VGEN-01~12 | `state-machines/Vgen.md` → `contracts/VgenPanel.md` → `STACK-COMPARE-VIDEOGEN.md` |
| 온보딩 전체 상태 | 온보딩 플로우 | `state-machines/Onboarding.md` → `ONBOARDING-FLOW.md` → `contracts/GreenRoom.md` |
| Phase 1 보안 게이트 | SEC | `specs/SecurityPolicies.md` → `SECURITY-P0-REVIEW.md` → `RUNTIME-HARDENING-REVIEW.md` → `specs/supabase-auth.md` → `DATA-SCHEMA.md §RLS` → `SECURITY-OPS.md` |
| 미디어·네트워크 품질 | ROOM-04 | `specs/MediaConfig.md` → `specs/NetworkAdaptiveQuality.md` → `specs/MediaPipeConfig.md` |
| 비용·크레딧 모델 | VGEN/크레딧 | `COST-ESTIMATE.md` → `specs/VgenCostAnalysis.md` → `DATA-SCHEMA.md §credits` |
| 법무·약관 검토 | 런칭 전 | `legal/TERMS-OF-SERVICE.md` → `legal/PRIVACY-POLICY.md` → `legal/COPYRIGHT-DMCA.md` → `legal/UGC-OWNERSHIP.md` → `legal/DATA-EXPORT.md` |
| Feature ID 계약 추적 | 모든 Feature ID | `FEATURE-CONTRACT-MAP.md` → 대상 `contracts/*.md` → `STORE-DEPENDENCY-MATRIX.md` → `npm run docs:check` → 구현 전 `npm run docs:check:strict` |
| 피치 증거 패킷 | Alibaba/투자자 | `PITCH-READINESS.md` → `MILESTONES.md §Pitch Demo Gate` → `COST-ESTIMATE.md` → `MODERATION-OPS.md` |
| 제품 출시 준비도 | Alpha/Public launch | `PRODUCT-READINESS.md` → `API-SURFACE.md` → `SUPPORT-PLAYBOOK.md` → `MODERATION-OPS.md` |

> **탐색 팁**: Feature ID를 모르면 `FEATURE-SPEC.md`에서 키워드로 검색 → ID 확인 후 이 표로 진입.

### 구현 레퍼런스 패턴 (버전 고정 golden-path)

> 빠르게 변하는 SDK의 "어떻게 짜는가" 예제. **버전 고정 + 설치버전 대조 필수**(각 문서 상단 "검수 노트" 참조). 21차 리뷰([[FORWARD-REVIEW-2026-07]]) 커버리지 감사 산출 — 11개 영역 중 4개만 golden-path 부족으로 신설.

| 파일 | 영역 | 함께 읽을 설계 |
|---|---|---|
| `reference/patterns/livekit-client.md` | LiveKit 연결·트랙·DataChannel·토큰갱신 | `state-machines/WebRTC.md`·`specs/livekit-edge-fn.md` |
| `reference/patterns/pixijs-v8-avatar-render.md` | PixiJS v8 단일캔버스·RenderTexture·blendshape | `contracts/AvatarCanvas.md`·`specs/rig-format.md` |
| `reference/patterns/falai-vgen-pipeline.md` | fal.ai 제출·폴링·webhook·3-way 게이트 | `state-machines/Vgen.md`·`contracts/VgenPanel.md` |
| `reference/patterns/react-router-routing.md` | route tree·lazy·ViewerGate 래퍼 | `PLATFORM-ARCHITECTURE.md §2.1`·`contracts/ViewerGate.md` |
| `reference/patterns/avatar-forge-pipeline.md` | PNG→Live2D 커미션(MOD-08) — 잡·Realtime·수령 UI 계약 | `DATA-SCHEMA.md §1.9`·`API-SURFACE.md` Avatar Forge |

---

## ⓘ 자율 에이전트 운영 (AI Agent Ops)

> 1인 개발 보조 — 에이전트가 스케줄에 따라 문서 건강성·보안·CS를 자율 관리.  
> **에이전트 진입점:** `ChatterBox/docs/status/AGENT-OPS.md` (이 디렉토리 바깥)

| 파일 | 역할 | 상태 |
|---|---|---|
| `status/AGENT-OPS.md` | 에이전트 진입문서 — 루틴 매트릭스·체크리스트·트리거 등록 플랜·열린 이슈 | **운영 SSOT** |
| `.claude/skills/cs-triage/SKILL.md` | CS 인입 분류·응답 초안·에스컬레이션 스킬 | **운영 스킬** |

**루틴 요약**

| 루틴 | 주기 | 진입 스킬 | 보고 채널 |
|---|---|---|---|
| 문서·계약 건강성 | 매일 09:00 KST | `/doc-health-check` + `npm run docs:check` | Slack `#agent-log` |
| 보안 드리프트 + 레드팀 | 매주 월 | 레드팀 시뮬레이션 (4역할) | Slack `#security-alerts` |
| CS 인입 분류 | 매시간 | `/cs-triage` | Slack `#cs-inbox` |
| GAP·마일스톤 리뷰 | 매주 금 | IMPLEMENTATION-ORDER.md 진행도 | Slack `#dev-log` |

> **트리거:** 앱 배포 후 `create_trigger` MCP로 4개 cron 등록 예정 (AGENT-OPS.md § 트리거 등록 플랜).

---

## 한 줄 규칙

- **고칠 땐 SSOT를.** 설계/조사 문서는 SSOT로 승격되기 전까지의 근거다.
- **새 문서 = 이 INDEX에 한 줄 + 헤더 주석에 분류 라벨.**
- **`PLATFORM-*` = 새 플랫폼, 그 외 루트성 문서 = 현행 랜딩.** 접두사로 갈래를 구분한다.
- **새 Feature ID/계약서/store 필드 = `FEATURE-CONTRACT-MAP.md` + `STORE-DEPENDENCY-MATRIX.md` + `npm run docs:check`.**
- **구현 착수 전 = `npm run docs:check:strict`; 상태판 확인 = `npm run docs:health`.**
- **에이전트가 깨어나면 `docs/status/AGENT-OPS.md` 먼저.**
