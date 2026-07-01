---
tags: [guide]
---

# snack-web — Project Status

> **스코프 주의**: 이 문서는 **랜딩 페이지(snack-web, Next.js)** 전용이다. ChatterBox 앱(Vite SPA) 자체의 구현 진행상황은 `docs/GAP-MATRIX.md`(진행 로그 + GAP 상태)와 `npm run docs:health`가 담당한다 — 둘을 혼동하지 말 것.

Updated: 2026-06-30 (ChatterBox 설계 완료 반영)

## 무엇

VTuber 메이커 제품(이미지 1장 → 수분 만에 동작하는 2D 버튜버 → 웹캠 방송)의 **랜딩 페이지**.
용도: **Alibaba.com CoCreate Pitch 2026** 지원 + 일본 런칭.

- 제품 SSOT/비전: `../Vtube/docs/ref/PRODUCTION-VISION.md` (별도 리포)
- 디자인 무드 레퍼런스: `flecto.io` (추출 → `design/`)

## 스택

Next.js 14 (App Router) · Tailwind 3 · cva · framer-motion · TypeScript.
(tak 프로젝트의 검증된 셋업을 차용: 반응형·배포·폴더 구조.)

## 현재 상태

- ✅ flecto 디자인 토큰 추출 → `design/DESIGN-TOKENS.md` + `tailwind.config.ts` 이식
- ✅ cva UI 프리미티브 6종 (`src/components/ui/`)
- ✅ 랜딩 섹션 뼈대 (Header→Footer) + 신규 Testimonials·BackedBy
- ✅ 텍스트 단일 SSOT (`src/content/content.ts`, JP 우선 + locale 구조)
- ✅ **추출 인터랙션 반영** (motion.framer.js 이식: variants·spring·stagger·Parallax / 호버 마이크로인터랙션 / **가격 월·년 토글 스위치** / 헤더 스크롤 elevation) — 빌드+실렌더 검증
- ✅ **flecto 80/20 패스 실행 완료** (2026-06-20, phase-loop) — Phase 1~6 전부. 체감 **flecto 80 / tak 20** 달성. 각 Phase 빌드+실렌더 게이트 통과. 최종 빌드 144kB(베이스 대비 +1.4kB).
  - P1 타이포: weight 700→**400 경량** + **Schibsted Grotesk** (display-2xl 추가)
  - P2 히어로: **딥그린 둥근 플로팅 패널**(`rounded-panel`) + 흰 경량 가운데 타이포 + 떠다니는 흰 카드(stats 재활용)
  - P3 중앙 그래픽: **HeroFlow** 손수 SVG — PNG→緑リグメッシュ→ライブ 3단계(스프링그린 연결선 draw-on, reduced-motion 정지, 번들 0)
  - P4 라운드화: Card 16→**24px**, Section **`panel` variant**(mint/cream/dark/green inset), Comparison·FinalCTA `rounded-panel`, 원형 스크롤 힌트
  - P5 신규 섹션: **Testimonials**(후기 카드) + **BackedBy**(Proudly backed by 로고월) — 피치용 사회적 증명
  - P6 그린 리듬: **HowItWorks·Comparison 풀블리드 딥그린** → 크림↔그린 교차
- ✅ **인터랙션 강화 + 실사 자산 슬롯 패스** (2026-06-20, phase-loop) — 플랜 [[INTERACTION-PLAN]]. 최종 빌드 148kB(+4kB, Lottie는 dynamic 청크).
  - **자산 슬롯**: `src/content/assets.ts`(SSOT) + `ui/AssetSlot`(src 있으면 실사/없으면 placeholder). **자산 완성 시 `assets.ts` 경로만 채우면 즉시 투입.** 아카네 아바타(character-008) = `public/avatars/akane.png` 투입.
  - **HeroFlow 재구성**: `sections/hero-flow/` 폴더 분리(Desktop/Mobile/glyphs/TiltCard). 텍스트 캡션 제거(비주얼 노드만). 라이브 단계 = 실사 아카네.
  - **pinned ScrollScrub**(데스크탑): 히어로 고정 + 스크롤로 트리 01→02→03 순차 빌드(연결선 pathLength + 노드 stagger + 스텝 카운터). 모바일 = in-view 순차. reduced-motion 시 정적(globals.css `.hero-pin-track` 접기).
  - **마이크로인터랙션**: 아카네 카드 커서 3D tilt(유니크) + 플로팅 카드 멀티레이어 패럴랙스. (count-up은 실수치 stat 확정 시 보류. nav 언더라인은 기구현.)
  - **Lottie**: `lottie-react` + `ui/LottiePlayer`(`dynamic ssr:false`, reduce 정지) + 직접제작 스프링그린 펄스(`public/lottie/pulse.json`) → Features 6개 아이콘(폴백 lucide). 스킬/OpenAI 생성 JSON도 `public/lottie/`+`assets.ts`로 즉시 연결 가능.
- ✅ **FLECTO-90 패스 — 인터랙티브 가짜 제품-UI 목업** (2026-06-20, phase-loop) — 플랜 [[FLECTO-90-PLAN]]. 최종 빌드 **152kB**(+4kB). flecto 정체성(추상 그래픽 X → "실제 앱 UI 닮은 인터랙티브 카드")을 우리 제품 스토리로 번역, 실사 없이 코드로.
  - **AvatarStudio**(`sections/avatar-studio/`): まばたき/リップシンク/髪 토글 → 미리보기 모션(sway/blink/talk) + 출력 스펙 실시간 재계산.
  - **LiveFlowLoop**(`sections/live-flow/`): 업로드→리깅→🔴LIVE→完了 자동 순환 → HowItWorks 비주얼 임베드.
  - **StreamPanel**(`sections/stream-panel/`): 라이브 무대 미리보기(아바타 합성+가짜 채팅 순환+시청자수+LIVE). 방송 송출/OBS 톤은 P2로 축소.
  - **ShowcaseTabs**(`sections/showcase/`): 「配信者向け/視聴者向け」세그먼트 탭으로 Studio+Stream 호스팅(flecto For-Business/For-Customer 듀얼). + 히어로 기능 chip 줄 + `ui/CountUp`(시청자수 0→1,284·히어로 stats).
  - tailwind 키프레임 추가: `avatar-sway`·`blink-dot`·`talk-bar`(신규 hex 없음). 전부 모바일·reduced-motion 존중.
- ✅ **히어로 v3 — 실물 빌드 영상 시네마틱 히어로** (2026-06-20, phase-loop) — 플랜 `async-prancing-pie`. 추상 SVG(`HeroFlow`) → **우리 제품이 실제로 조립되는 영상**(Vtube `vtuber-promo` assembly-showreel: 백지→파츠생성→조립→초록리깅→클로즈업)으로 교체. flecto "영상같은 히어로"를 실물 footage로. **실사 자산 갭 #1도 동시 해소.**
  - **Phase A 영상 생성**: Vtube 008 `rig_v0_project`(백업 후) 프리뷰서버 → agent-browser scale2 헤드리스 399프레임(2160²) 캡처 → ffmpeg. `public/showreel/`: `build.mp4`(루프 696K)·`build-scrub.mp4`(전프레임 인트라 시킹용 3.7M)·`poster.jpg`(초록리깅 클로즈업 208K). 결정론·**OpenAI 등 유료 API 미사용**.
  - **HeroShowreel**(`sections/hero-showreel/`): **데스크탑 스크롤 스크럽**(scrollYProgress→`video.currentTime`, ground-truth ct∝scroll)·**모바일 자동루프**(play() 견고화)·**reduce 포스터**. 뷰포트당 1 video만 마운트(나머지 포스터 → 다운로드 0·LCP=포스터).
  - **Hero 2단 재구성**: 카피(좌) · 실물 빌드 영상(우) → 영상이 첫 시야에 바로(인터랙션 우선). `StepCounter` 빌드단계 매핑 유지. 추상 `hero-flow/` 제거. First Load **151kB**(-1kB).
- ✅ **서비스 방향 확정** (2026-06-27) — PNG→VTuber(단독) → PNG→VTuber **+** 연기 플랫폼(투 트랙). 예비창업패키지·프라이머 지원서 맥락.
- ✅ **용어 확정** — `연극` → `연기` 전체 통일.
- ✅ **신규 기능 스펙 확정** — `FEATURE-SPEC.md`에 DUB(영상→대본→더빙)·ROOM-19(참가자 리액션)·VGEN-11/12(쇼츠 9:16) 추가. 기술 근거 조사 완료(Whisper diarization 모델명·yt-dlp 법적 리스크·Seedance 15초 상한 수정).
- ⏳ **홍보 카피 미정** — 전부 `〔仮〕` 임시(신규 testimonials/backedBy/studio/stream/showcase 포함). `ko.ts` 리프레시 + TheaterPreview 섹션 추가 보류 중 ([[SCOUT]] 인계).
- ✅ **ChatterBox SPA 설계 완료** (2026-06-30) — GAP-MATRIX G-139~G-149 전부 DONE. 저장소 경로 `/Users/family/jason/ChatterBox` 확정. Obsidian Graph View 구성 완료(`/Users/family/jason/jasonob`, symlink + 101 wikilinks).
  - **신규 설계 문서**: VITE-CONFIG·MILESTONES·CODING-CONVENTIONS·INCIDENT-PLAYBOOK·SUPPORT-PLAYBOOK·MODERATION-OPS·SECURITY-OPS (7개)
  - **기존 문서 확장**: PLATFORM-ARCHITECTURE §12 폴더구조, TestStrategy §10 통합 시나리오, MonitoringDashboard §알림임계값
  - **Phase 0 착수 준비 완료**: `MILESTONES.md` AC 기준, `VITE-CONFIG.md` 초기화 레시피 확정
- ✅ **레퍼런스 갭 맵 반영** (2026-06-30) — VRChat/Cluster, Gather Town, Jackbox, Twitch, Discord, Figma, Frame.io, Nico Nico, itch.io/Booth, Roblox/Fortnite, Loom/CapCut, Zoom 메모를 `PLATFORM-REFERENCE-GAP-MAP.md`로 정리. 기존 Feature ID로 흡수 가능한 항목을 먼저 매핑하고, 새 ID 승격은 구현 직전 최소화.
- 🟡 **실사 자산** — **히어로 빌드 영상(`heroShowreel`)·아카네 아바타 = 실물 투입 완료.** 나머지(데모영상 `heroDemo`·모션GIF `motionBlink/Talk/Hair`·`greenRig`)는 `assets.ts` 빈 슬롯(placeholder) → 제품 완성 시 `src` 채우면 라이브.
- ✅ **브랜드 구조 확정** — 회사/브랜드명은 `SNACK`(`BRAND.company`), 내부 플랫폼명은 `ChatterBox`(`BRAND.name`). 사전등록 폼은 `BRAND.applyUrl = https://tally.so/r/japxg4`로 연결됨. 도메인/SNS는 아직 미정.
- ✅ **프로덕션 배포됨** — **https://snack-web-khaki.vercel.app** (Vercel, scope `kimjuyoung1127s-projects`, 2026-06-20). 단 카피 `〔仮〕`·OG/favicon 미비 → 공유 썸네일 X. 재배포: `vercel --prod --yes --scope kimjuyoung1127s-projects`([[DEPLOY]]).

### 보류(주인님 선정 대기)
- **트랙① 자산 생성**(OpenAI 키 `~/.config/vtube/openai_api_key` 확인됨) — 아카네 멀티뷰/표정 등 후보 나열 완료, 주인님이 번호 선정 후 생성. 키 과금.
- **트랙③ 픽셀 폴리시** — OG·트위터 이미지(next/og)·favicon·404(`not-found.tsx`)·메타 보강. 로고 확정 시 완성형.

## 확정 결정

| 항목 | 결정 |
|---|---|
| 디자인 무드 | flecto (포레스트 그린+크림+스프링그린). tak 색/무드는 **참고 안 함** |
| tak 참고 범위 | 반응형·배포·폴더 구조·문서 관리 **만** |
| 언어 | 일본어 우선 + 추후 다국어(content.ts locale 키) |
| 텍스트 관리 | `src/content/content.ts` **단일 파일** |
| 디자인 토큰 관리 | `design/` 폴더, MD가 SSOT |

## 2026-06-30 디자인 그릴미 결정

| 항목 | 결정 |
|---|---|
| 첫인상 | "와, 나도 하고 싶다" |
| 감정 목표 | "친구랑 하고 싶다" |
| 핵심 활동 | 연기, 소통, 함께 영상 보기, 쇼츠 생성 |
| 타겟 | 친구끼리 노는 그룹 + 연기/더빙 커뮤니티 |
| 톤 | 귀여움·오타쿠 무게. 기본 AI 아이콘/패턴 회피 |
| 비주얼 출발점 | 방 배경은 여러 컨셉 예정. 우선 모닥불 나이트 |
| 랜딩 레퍼런스 | cluster.mu 쪽 에너지 우선 검토 |
| CTA | 방 만들기 흐름을 1순위로 설계. 실제 플랫폼 전까지는 사전등록/알림 폼으로 연결 |
| OBS | 랜딩 언급 축소. 방송 송출은 P2 옵션 |

## 2026-06-30 ChatterBox 사용자 여정 감사 반영

| 영역 | 반영 |
|---|---|
| 초대/입장 | 초대 role을 actor/viewer로 고정하고 모바일·게스트는 viewer로 서버 다운그레이드. Viewer Gate와 GreenRoom 경계를 명확화 |
| 카메라 실패 | actor는 정적 아바타+음성 폴백 가능, 마이크까지 실패하면 viewer 입장만 허용 |
| 모바일 채팅 | viewer LiveKit 토큰은 `canPublishData=false` 유지. 모바일 채팅은 Edge Function 경유 |
| 운영 안전 | `audit_logs`, `moderation_reports`, `user_blocks`, message tombstone 정책 추가. Preview/Prod console-only audit 금지 |
| 반복 사용 | 공개 데모룸, 예약/알림, 최근 함께한 사람·방 재초대, 첫 방 템플릿, 방/내 작품 갤러리 스키마 추가 |
| DUB 경계 | VGEN-07은 1인 generated-video voiceover, DUB-04는 참가자별 기존 영상 더빙으로 분리 |

## 다음 할 일

1. ✅ ~~flecto 80/20~~ · ~~인터랙션 강화~~ · ~~FLECTO-90 목업~~ · ~~히어로 v3 실물 영상~~ · ~~Vercel 배포~~ — 완료.
2. ✅ ~~서비스 방향·용어·신규 기능 스펙~~ — 확정 완료 (2026-06-27, `FEATURE-SPEC.md`).
3. ✅ ~~ChatterBox SPA 전체 설계·운영 문서 완성~~ — 완료 (2026-06-30, G-139~G-149).
4. ★ **ChatterBox Phase 0 착수** — `MILESTONES.md` AC 기준
   ```bash
   cd /Users/family/jason
   npm create vite@latest ChatterBox -- --template react-ts
   ```
   - Supabase 프로젝트 연결, `app_config` 로드, Realtime 확인 → Phase 0 AC 통과
   - 상세 레시피: `docs/VITE-CONFIG.md`, 마일스톤 기준: `docs/MILESTONES.md`
5. ★ **랜딩 콘텐츠 리프레시 + TheaterPreview 섹션** (보류 — [[SCOUT]] 인계)
   - P0: `src/content/locales/ko.ts` 연기 플랫폼 반영
   - P1: `src/components/sections/theater-preview/` React 변환
6. **트랙① 자산 생성**(보류) — 아카네 멀티뷰/표정 주인님 선정 후 생성 → `assets.ts` 채움.
7. **트랙③ 픽셀 폴리시**(보류) — OG·favicon·메타. 로고 확정 시.
8. (선택) ko/en locale 추가.
9. (선택) 커스텀 도메인 연결 (Vercel Settings→Domains).

## 규칙

- 텍스트는 `content.ts` 에서만. 컴포넌트에 하드코딩 금지.
- 색/모션은 `design/DESIGN-TOKENS.md` 먼저 고치고 코드 동기화.
- 이 문서는 짧게 유지.
