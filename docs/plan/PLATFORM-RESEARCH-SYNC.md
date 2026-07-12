---
tags: [guide]
---

<!--
  opencode: 2026-06-26 - Vtube Model 1 / 성우·버튜버 연극 플랫폼 조사 동기화 문서.
  Coded/researched with OpenCode; high-cost model review recommended before implementation.
-->

# PLATFORM-RESEARCH-SYNC — Vtube 연기/연극 플랫폼 조사 동기화

> **목적:** `/Users/family/jason/Vtube` 의 비전·설계 문서를 스캔하고, `snack-web` 프로젝트가 나아갈 "성우/버튜버 연극 커뮤니티 플랫폼" 방향을 여기에 동기화한다.
> Updated: 2026-06-26

---

## 1. 핵심 결론 (BLUF)

- **최종 비전은 `Vtube` 문서에 있고, `snack-web` 현재 코드에는 없다.**
  - `Vtube/docs/VISION.md`, `MODEL1.md`, `ref/AUTORIG-THEATER-PLATFORM-001.md` 에 "버튜버가 모여 연기하는 멀티유저 룸 플랫폼"이 정의되어 있다.
  - `snack-web` 은 현재 "PNG 1장 → 버튜버 생성"을 소개하는 **랜딩 페이지**일 뿐이다.
- **필요 페이지는 총 7개** (THEATER-PLATFORM-001 §2).
- **지금 `snack-web` 기술 스택은 플랫폼 확장을 새로 시작하기엔 1세대 뒤처져 있다.** 점진 업그레이드 또는 정적 SPA(Vite) 재설계를 검토해야 한다.

---

## 2. 조사 범위 — 읽은 문서

### 2.1 Vtube 비전·플랫폼 설계 (핵심)

| 문서 | 읽음 | 핵심 내용 |
|---|---|---|
| `Vtube/docs/VISION.md` | ✅ | 회사 비전, Model 1~5 로드맵 |
| `Vtube/docs/MODEL1.md` | ✅ | Model 1 — 연기/연극 플랫폼 요약 (일반인용) |
| `Vtube/docs/ref/AUTORIG-THEATER-PLATFORM-001.md` | ✅ | 멀티유저 버튜버 연극 룸 플랫폼 상세 설계 |
| `Vtube/docs/ref/AUTORIG-VOICE-ROOM-001.md` | ✅ | 2인 성우 아바타 룸 + 페이셜 테스트 계획 |
| `Vtube/docs/ref/PRODUCTION-VISION.md` | ✅ | PNG 업로드 → 즉각 버튜버 모델 프로덕션 비전 |
| `Vtube/docs/ref/AUTORIG-PIPELINE-V1.md` | ✅ | AUTORIG 파이프라인 v1 / 2048 기준선 |
| `Vtube/docs/ref/AUTORIG-MASTER-SPEC.md` | ✅ | 마스터 생성 사양 (P0) |
| `Vtube/docs/ref/AUTORIG-EXPR-SET-001.md` | ✅ | 표정 = 감정별 풀페이스 세트 |
| `Vtube/docs/ref/FACIAL-TEST-CHECKLIST.md` | ✅ | 페이셜 테스트 H2 검수 시트 |
| `Vtube/docs/ref/AUTORIG-RIG-STRUCTURE-001.md` | ✅ | 리그 구조 정교화 (FK/회전/BBW 스키닝) |
| `Vtube/docs/ref/AUTORIG-PIPELINE-SLOTS-001.md` | ✅ | 버전 슬롯 파이프라인 |
| `Vtube/docs/ref/AUTORIG-PRO-TECHNIQUE-TRANSLATION-001.md` | ✅ | Live2D 프로 기법 → 우리 오토리깅 번역 |
| `Vtube/docs/ref/AUTORIG-THRESHOLD-REL-001.md` | ✅ | 추출 임계값 상대화 |
| `Vtube/docs/ref/AUTORIG-BBW-SKIN-001.md` | ✅ | 유기 스키닝 재설계 |
| `Vtube/docs/ref/AUTORIG-PIPELINE-SYNC-AUDIT-001.md` | ✅ | 파이프라인 싱크 감사 |
| `Vtube/docs/status/SCOUT.md` | ✅ | THA4 eyes eye-tracking 버그 스카우트 |
| `Vtube/docs/research/LIVE2D-MODEL-GUIDE.md` | ✅ | Live2D 모델 개선 실전 가이드 |
| `Vtube/experiments/reference-model-structure-001/reports/cubism_v2_production_design_spec.md` | ✅ | Cubism v2 생산 설계 SSOT |
| `Vtube/experiments/reference-model-structure-001/reports/cubism_v2_new_model_v2_standard_part_spec.md` | ✅ | 확정 64-part `v2_standard` 스펙 |

### 2.2 상태·남비게이션 문서

| 문서 | 읽음 | 핵심 내용 |
|---|---|---|
| `Vtube/docs/INDEX.md` | ✅ | Vtube 문서 인덱스 |
| `Vtube/docs/status/PROJECT-STATUS.md` | ✅ | 현재 개발 상태 (일부만, 211줄 이후 추가 있음) |
| `Vtube/docs/status/NEXT-AGENT-HANDOFF.md` | ✅ | 다음 에이전트 재개용 최신 생산 경로 |
| `Vtube/docs/PROJECT-BOARD.md` | ✅ | 프로젝트 알림판 (비개발자용) |

### 2.3 snack-web 현재 상태

| 문서 | 읽음 | 핵심 내용 |
|---|---|---|
| `snack-web/README.md` | ✅ | 랜딩 페이지 개요 |
| `snack-web/docs/status/PROJECT-STATUS.md` | ✅ | 현재 랜딩 페이지 상태 |
| `snack-web/docs/archive/landing/FRONTEND-MAP.md` | ✅ | 프론트엔드 스택·섹션·SSOT 지도 |
| `snack-web/src/app/page.tsx` | ✅ | 현재 랜딩 페이지 섹션 구성 |
| `snack-web/src/content/content.ts` | ✅ | 텍스트 SSOT |
| `snack-web/src/content/assets.ts` | ✅ | 미디어 자산 SSOT |

---

## 3. 추가 조사 문서 — 모두 읽음

원래 누락으로 식별했던 문서 10개를 모두 읽고 요약했다.

| 문서 | 핵심 요약 | 플랫폼/프론트 영향 |
|---|---|---|
| `AUTORIG-RIG-STRUCTURE-001` | 리그는 이미 FK 계층·회전 보유. 진짜 개선 = 살구색 수정 + 볼륨 키폼 + 유기 스키닝 | 런타임 rig.js 변형 경로에 영향 |
| `AUTORIG-PIPELINE-SLOTS-001` | 스테이지별 버전 슬롯(`hair_split`/`deform`/`physics`/`depth`)으로 A/B | rig JSON 생성 규약, 프론트는 무관 |
| `AUTORIG-PRO-TECHNIQUE-TRANSLATION-001` | 큰끄덕임/입개폐/납작은 자산 생성 단계에서 풀어야 함 | 자산 파이프라인 방향 |
| `AUTORIG-THRESHOLD-REL-001` | 8클러스터 상대화 A/B PASS, adaptive 기본 승격 | 자산 품질, 프론트 무관 |
| `AUTORIG-BBW-SKIN-001` | FFD → 통합 스킨 메시 + scipy BBW + LBS | 런타임 rig.js LBS 변형 추가 필요 |
| `AUTORIG-PIPELINE-SYNC-AUDIT-001` | default.yaml이 010-ruby baseline과 동기화 완료 | 최신 파이프라인 상태 |
| [[SCOUT]] | THA4 eyes: 측면 시선 시 eyeBlink 오상승 버그 확인 | 플랫폼 트래킹에도 동일하게 적용됨 → `mini_cubism_drive.html` 개선 필요 |
| `Vtube/docs/research/LIVE2D-MODEL-GUIDE.md` | 74영상·276팁 증류. 오버랩·연속메시·입력 정규화 | 자산 생성 프롬프트/리깅 가이드 |
| `cubism_v2_production_design_spec.md` | v2_standard 파트 taxonomy, parameter map, deformer hierarchy | 파트 분류 기준 |
| `cubism_v2_new_model_v2_standard_part_spec.md` | 확정 64-part 목록·그룹·디포머·QA 태그 | 파트 ID/이름 규약 |

---

## 4. 최종 비전 요약

### 4.1 회사 비전

> "그림 한 장으로 누구나 살아 움직이는 버튜버가 되는 세상. — AI가 모델 제작의 장벽을 0으로."
> — `Vtube/docs/VISION.md`

### 4.2 Model 1 — 연기/연극 플랫폼

> "여러 명이 버튜버가 되어 한 방에서 함께 연기하는 서비스." — `Vtube/docs/MODEL1.md`

- 사용자가 아이디 인증 → 내 버튜버 캐릭터 선택 → 방 입장.
- 방 가욱에 사전 업로드된 영상(테마 콘텐츠)이 재생.
- 참가자들은 대본을 읽으며 연기.
- 버튜버 아바타는 웹캠 표정으로 실시간 구동.
- 서로 음성 대화 + 채팅.
- 방장(호스트) 기능: 강퇴·비활성화·비밀번호·음량/음소거·배경 선택.

### 4.3 가장 중요한 설계 결정 — 비용

> **"메인뷰(가욱 영상)를 실시간 서버로 흘리지 마라."**

- 메인 영상은 CDN/스토리지에 미리 업로드 → 각 클라이언트가 직접 재생.
- 실시간으로 흐르는 건 음성(~40 kbps) + 표정 blendshape 52채널(~6.2 kbps)뿐.
- 6인 방도 1인당 실시간 트래픽 ≈ 250 kbps 수준으로 유지비를 억제.
- 생방송/화면공유로 가면 비용이 2~5배 — 스코프 아웃.

---

## 5. 필요한 페이지 + UI 요소

### 5.1 페이지 7개 (THEATER-PLATFORM-001 §2 기준)

| # | 페이지 | 핵심 역할 |
|---|---|---|
| 1 | **랜딩** | 플랫폼 소개 + 체험 데모 CTA |
| 2 | **로그인/회원가입** | 아이디 인증 (Clerk/Supabase Auth) |
| 3 | **내 모델 / 모델 선택** | 보유 버튜버 고르기 + 웹캠 캘리브레이션 |
| 4 | **방 탐색(로비)** | 방 목록, 주제 태그, 인원, 자물쇠(비번), 검색 |
| 5 | **방(묵대)** | 핵심 화면. 가욱 영상 + 둘레 아바타 + 대본 + 채팅 + 음량 |
| 6 | **방장 콘솔** | 강퇴·비활성화·슬롯 교체·배경 선택·방 잠금 |
| 7 | **설정** | 오디오 입출력, 웹캠 선택, 단축키(필살기 핫키) |

### 5.2 추가 UI/UX 요소 (THEATER-PLATFORM-001 §3)

| 요소 | 설명 |
|---|---|
| **묵대 레이아웃 엔진** | 2·4·6명 자동 배치 (둘레 원형/슬롯) |
| **대본 패널(Teleprompter)** | 역할 배정 + 현재 대사 하이라이트 + "내 차례" 표시 |
| **슬롯형 콘텐츠 선택기** | 토크쇼·낭독극·게임 등 테마 카드 |
| **배경 선택기** | 방 배경 이미지/씬 교체 |
| **참가자 상태 HUD** | active-speaker 강조, 음소거 아이콘, 방장 왕관 |
| **음량 믹서** | 참가자별 볼륨/뮤트 |
| **OBS 출력 모드** | P2 방송 송출 옵션. 구현 시 `?obs_token={token}&obs=transparent`만 허용, 토큰 없는 `?transparent=1` 금지 |

### 5.3 레퍼런스 이미지(VoiceStage Beta) 매핑

주인님이 올리신 이미지의 UI 영역을 문서 기준 요소로 매핑:

| 이미지 영역 | 매핑 요소 |
|---|---|
| 상단: 세션 진행 시간 / 초대 / 링크 공유 / 7/12 | 방(묵대) 헤더 + 참가자 수 + 초대 기능 |
| 좌측: 대본/장면 + 다음 순서(큐) | 대본 패널(Teleprompter) + 역할 큐 |
| 중앙: 영상 + 자막/채팅 오버레이 | 슬롯 메인뷰 + 실시간 자막/채팅 |
| 둘레: 원형 아바타 + 마이크 상태 | 묵대 레이아웃 엔진 + 참가자 상태 HUD |
| 우측: 룸 분위기 / 실시간 노트 / 사운드 보드 | 채팅/노트/필살기 리액션 보드 |
| 하단: 마이크·헤드폰·녹음·리액션·나가기 | 음량 믹서 + 방 컨트롤 바 |

---

## 6. 기술 스택 평가 및 현대화 옵션

### 6.1 현재 `snack-web` 스택

| 패키지 | 현재 버전 | 상태 |
|---|---|---|
| Next.js | 14.2.21 | **1세대 뒤** — Next.js 15 출시됨 |
| React | 18.3.1 | **1세대 뒤** — React 19 출시됨 |
| Tailwind CSS | 3.4.17 | **1세대 뒤** — Tailwind 4 출시됨 |
| framer-motion | 11.15.0 | **rebrand** — `motion` v12로 이전 권장 |
| lottie-react | 2.4.1 | **구형** — `@lottiefiles/dotlottie-react` 권장 |
| lucide-react | 0.468.0 | 현행 유지 가능 |
| TypeScript | 5.7.0 | 비교적 최신 |

### 6.2 왜 "레거시"로 느껴지는가

- Next.js 14 → 15: App Router 안정화, partial prerendering, React 19 지원.
- React 18 → 19: Compiler, 새로운 hook, 더 나은 서버 컴포넌트 모델.
- Tailwind 3 → 4: 성능 개선, 새로운 config 시스템(`@theme`), 네이티브 CSS 기반.
- framer-motion → motion v12: 더 작은 번들, 새 API 표준.
- lottie-react → dotLottie: 최신 포맷, 스크롤 스크럽, 더 작은 파일.

현재 스택이 작동하지 않는 건 아니지만, **플랫폼을 새로 짓는 시점에서 1세대 뒤에서 시작하면 나중에 마이그레이션 비용이 더 크다.**

## 6.3 기술 스택 결정 — Option B: Vite + React SPA

**주인님 결정 (2026-06-26): 기존 `snack-web` Next.js/Tailwind 3/framer-motion 스택은 폐기하고, `Vite + React SPA`로 새 출발.**

### 왜 Option B인가

| 이유 | 근거 문서 |
|---|---|
| 렌더(PixiJS)·트래킹(MediaPipe)·실시간(LiveKit)이 전부 클라이언트 | `AUTORIG-THEATER-PLATFORM-001.md` §6 |
| 정적 호스팅에 최적 → Vercel 락인 회피, Cloudflare Pages 묣은 대역폭 | `AUTORIG-THEATER-PLATFORM-001.md` §6, §9 H7 |
| THEATER-PLATFORM 문서 난에서 "Next.js 15"와 "Vite SPA 권장" 사이 모순 해소 | `AUTORIG-THEATER-PLATFORM-001.md` §1 vs §6/§9 H7 |
| PRODUCTION-VISION에서 정적 배포 검증 완료 | `PRODUCTION-VISION.md` "정적 배포 검증" 절 |
| 향후 LiveKit Cloud → 셀프호스트 전환 용이 | `AUTORIG-THEATER-PLATFORM-001.md` §4, §6 |

### 폐기하는 레거시

| 항목 | 폐기 이유 |
|---|---|
| Next.js 14 App Router | Vite SPA로 대체. 서버 기능 불필요 |
| Tailwind CSS 3 | Vite + Tailwind 4 또는 CSS Modules/Plain CSS로 대체 |
| framer-motion 11 | `motion` v12로 대체하거나, 플랫폼 UI에서는 최소화 |
| lottie-react | `@lottiefiles/dotlottie-react`로 대체 |
| 현재 랜딩 섹션 구조 | 마케팅 페이지로 축소/재구성 |

### 상세 아키텍처

→ 별도 문서 [[PLATFORM-ARCHITECTURE]] 참조.

### 6.4 플랫폼용 추가 라이브러리 (공통)

| 영역 | 라이브러리 |
|---|---|
| 실시간 | `@livekit/components-react`, `livekit-client` |
| 웹캠 트래킹 | `@mediapipe/tasks-vision` |
| 아바타 렌더 | `pixi.js` v8 |
| 상태 관리 | `zustand` |
| 서버 상태 | `@tanstack/react-query` |
| 스키마 검증 | `zod` |
| i18n | `next-intl`(Next.js) 또는 `i18next`(Vite) |

---

## 7. 랜딩 페이지와 플랫폼의 연결 구조

현재 `snack-web`은 "버튜버 메이커" 랜딩이다. 최종 비전은 "만든 버튜버로 함께 연기하는 커뮤니티"다. 둘은 자연스럽게 이어진다.

```
[랜딩 페이지] — "PNG 1장으로 버튜버 만들기" 소개
      ↓ "지금 묵대에 오르기" CTA
[로그인/회원가입]
      ↓
[내 모델 선택] — 웹캠 캘리브레이션
      ↓
[방 탐색(로비)]
      ↓
[방(묵대)] — 핵심 플랫폼
```

**권장:** 기존 랜딩 페이지를 완전히 걷어내지 말고 **플랫폼의 마케팅 입구**로 남겨둔다. 다만 카피와 CTA를 "버튜버 제작"에서 "버튜버 연기 커뮤니티"로 재정비해야 한다.

---

## 8. 정합성 확인 (Consistency Check)

읽은 문서들 간 모순/유의점을 확인했다.

| 항목 | 상태 | 설명 |
|---|---|---|
| 프론트엔드 선택 | ⚠️ → ✅ 해소 | THEATER-PLATFORM §1은 Next.js 15, §6/§9 H7은 Vite SPA 권장. **Option B 채택으로 모순 해소.** |
| 정적 배포 | ✅ 정합 | PRODUCTION-VISION "정적 배포 검증"과 Vite SPA 정합. |
| 런타임 엔진 | ✅ 정합 | PIPELINE-V1의 PixiJS v8 + rig JSON은 프레임워크 무관. |
| 언어/타입 | ✅ 정합 | THEATER-PLATFORM "TS 통일"과 Vite + React TS 정합. |
| 실시간 스택 | ✅ 정합 | VOICE-ROOM-001의 LiveKit 단독 + Data Track은 Vite SPA에서 그대로 사용. |
| 트래킹 버그 | ✅ 해소 | SCOUT.md의 THA4 eyes 측면 시선 버그는 `mini_cubism_drive.html`에 GAZE-COMP-001 보정이 이미 구현되어 해소됨. 플랫폼 표준 트래킹 드라이버에 동일 보정 이식 필요. |
| 자산 파이프라인 | ✅ 정합 | PIPELINE-SYNC-AUDIT 결과 default.yaml이 010-ruby baseline과 동기화됨. 최신 상태. |
| 64-part 스펙 | ✅ 정합 | v2_standard 64-part가 파트 taxonomy 기준으로 확정. |

### 발견된 모순/주의

1. **THEATER-PLATFORM 문서 난부 모순**: §1 "Next.js 15" vs §6/§9 H7 "Vite SPA 권장" → **Option B로 해결, 본 문서에 기록.**
2. **THA4 eyes 측면 시선 버그**: SCOUT.md 시점 이후 `mini_cubism_drive.html`에 GAZE-COMP-001(eye_gaze에 따른 eyeBlink 거짓 상승 보정)이 이미 구현됨. 플랫폼 표준 트래킹 드라이버에 동일 보정을 이식해야 함.
3. **BBW 스키닝 미구현**: AUTORIG-BBW-SKIN-001은 SPEC 상태. 플랫폼 런타입은 현재 FFD 기반이지만, 추후 LBS 경로 추가 필요. **단기에는 FFD 기반으로 진행.**

---

## 9. 결론 및 다음 행동

1. **문서화 완료**: 본 문서(`PLATFORM-RESEARCH-SYNC.md`)가 조사 내용의 SSOT 역할을 한다.
2. **누락 문서 스캔 완료**: §3의 10개 문서를 모두 읽고 요약했다.
3. **기술 스택 결정 완료**: **Option B — Vite + React SPA**. 레거시는 폐기.
4. **상세 아키텍처 문서 작성**: [[PLATFORM-ARCHITECTURE]] (다음 작업).
5. **P1 PoC 권장**: 2인 방 + 음성 + 표정 동기화부터 구현 (`VOICE-ROOM-001` P1~P3).
6. **6인 렌더 구조 확정**: 단일 PixiJS Application + 단일 WebGL 컨텍스트. theater PoC에서 N=8 60fps PASS(M5, 메시 변형 포함).
7. **랜딩 페이지 카피 재정비**: "버튜버 연극 플랫폼" 메시지로 교체.
8. **THA4 eyes 버그 추적**: `mini_cubism_drive.html`에 GAZE-COMP-001이 이미 구현됨. 플랫폼 트래킹 표준 템플릿에 동일 보정 이식.

---

## 10. 참고 링크

- `Vtube/docs/VISION.md`
- `Vtube/docs/MODEL1.md`
- `Vtube/docs/ref/AUTORIG-THEATER-PLATFORM-001.md`
- `Vtube/docs/ref/AUTORIG-VOICE-ROOM-001.md`
- `Vtube/docs/ref/PRODUCTION-VISION.md`
- `Vtube/docs/ref/AUTORIG-PIPELINE-V1.md`
- `Vtube/docs/ref/AUTORIG-RIG-STRUCTURE-001.md`
- `Vtube/docs/ref/AUTORIG-PIPELINE-SLOTS-001.md`
- `Vtube/docs/ref/AUTORIG-PRO-TECHNIQUE-TRANSLATION-001.md`
- `Vtube/docs/ref/AUTORIG-BBW-SKIN-001.md`
- `Vtube/docs/status/SCOUT.md`
- `Vtube/docs/research/LIVE2D-MODEL-GUIDE.md`
- `snack-web/docs/archive/landing/FRONTEND-MAP.md`
- `snack-web/docs/status/PROJECT-STATUS.md`
