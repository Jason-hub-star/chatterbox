---
tags: [hub]
---

<!--
  opencode: 2026-06-27 - Vite + React SPA 기반 버튜버 연극 플랫폼 아키텍처. DUB 파이프라인 추가.
  Coded/researched with OpenCode; high-cost model review recommended before implementation.
-->

# PLATFORM-ARCHITECTURE — Vite + React SPA 플랫폼 설계

> **결정:** 기존 `snack-web`의 Next.js 14/Tailwind 3/framer-motion 스택을 폐기하고, **Vite + React SPA**로 새 출발한다.
> Updated: 2026-06-27 · DUB 파이프라인(Whisper API + LiveKit 동기화 더빙) 설명 추가

---

## 1. 왜 Vite + React SPA인가

`AUTORIG-THEATER-PLATFORM-001.md` 에서는 §1에서 Next.js 15를 언급하면서도 §6/§9 H7에서 **정적 친화·락인 회피를 위해 Vite + React SPA가 더 정직**하다고 밝힌다. 우리는 이 모순을 Option B로 해소한다.

| 특성 | 우리 플랫폼 | 가장 잘 맞는 프레임워크 |
|---|---|---|
| 아바타 렌더 | PixiJS v8 (클이언트 WebGL) | SPA |
| 웹캠 트래킹 | MediaPipe (클아이언트 WASM) | SPA |
| 실시간 통신 | LiveKit (WebRTC + DataChannel) | SPA |
| 메인뷰 동기 | CDN 비디오 + 타임스탬프 동기 | SPA |
| 인증/DB | Supabase (BaaS) | SPA |
| 배포 | 정적 호스팅 (Cloudflare Pages / Vercel) | SPA |

**Next.js가 필요한 경우는 거의 없다.** 서버 렌더링·API Route·대역폭 집약 작업이 없기 때문. Vite는 빠른 개발 서버, 작은 번들, 그리고 정적 export에 최적화되어 있다.

---

## 2. 기술 스택

### 2.1 핵심 프레임워크

| 영역 | 선택 | 버전/비고 |
|---|---|---|
| 빌드 도구 | **Vite** 8.1.0 | (문서상 6 → 8 격상) vitest 4·`@tailwindcss/vite` 4가 Vite 8 peer 지원 확인 |
| 런타임 | **React** 19.2.7 | + `react-dom` 19.2.7 |
| 언어 | **TypeScript** 6.0.3 | ⚠️ `typescript-eslint`는 TS `<6.1.0`만 → **6.0.x 핀** |
| 라우터 | **react-router** 8.0.1 | `react-router-dom` 7 → `react-router` 8 직접. ⚠️ **react ≥19.2.7 필수** |
| 스타일 | **Tailwind CSS** 4.3.1 | `@tailwindcss/vite` 4.3.1 + **shadcn/ui**(Radix) |
| 모션 | **motion** 12.42.0 | framer-motion rebrand |
| Lottie | **@lottiefiles/dotlottie-react** 0.19.5 | dotLottie 포맷 |

> 버전 = **2026-06-26 npm latest**, peerDependencies 교차검증 완료(메이저 충돌 없음).

### 2.2 플랫폼 특화 라이브러리

| 영역 | 선택 | 역할 |
|---|---|---|
| 실시간 | `@livekit/components-react`, `livekit-client` | 음성 SFU + Data Track |
| 트래킹 | `@mediapipe/tasks-vision` | FaceLandmarker 52 blendshape **[개발 예정]** |
| 아바타 렌더 | `pixi.js` v8 | rig JSON 기반 2D 아바타 렌더 |
| 상태 관리 | `zustand` | 글로벌 UI/방 상태 |
| 서버 상태 | `@tanstack/react-query` | Supabase 캐싱/동기화 |
| 스키마 검증 | `zod` | rig JSON, 폼, API 응답 검증 |
| i18n | `i18next`, `react-i18next` | ko/ja/en 다국어 |
| 폼 | `react-hook-form` + `zod` | 로그인/방 생성/설정 |
| 인증/DB/Storage | `@supabase/supabase-js` | Clerk 대체 또는 병행 |

### 2.3 개발 도구

| 도구 | 용도 |
|---|---|
| `eslint` + `@eslint/js` + `typescript-eslint` | 린트 |
| `prettier` | 포맷 |
| `vitest` | 유닛 테스트 |
| `playwright` | E2E/헤드리스 렌더 검증 |
| `msw` | API 모킹 |

---

## 2.4 환경 분리 (Environments) — G-80

### 3단계 환경 구조

| 환경 | Supabase 프로젝트 | LiveKit | Stripe | 용도 | 배포 브랜치 |
|------|------|------|------|------|------|
| **dev** | `{project}-dev` (로컬 또는 별도 프로젝트) | Cloud sandbox | Test mode | 로컬 개발 | (로컬 전용) |
| **staging** | `{project}-staging` | Cloud staging | Test mode | QA·PR 리뷰 | `develop` |
| **prod** | `{project}-prod` | Cloud prod | Live mode | 실 서비스 | `main` |

### 환경 변수 파일 구조

```
.env.development    → dev 설정 (gitignored)
.env.staging        → staging 설정 (gitignored)
.env.production     → prod 설정 (gitignored)
.env.example        → 템플릿 (git 추적)
```

### 필수 환경 변수 목록

| 변수 | 설명 | 클라이언트 | Edge Fn |
|------|------|------|------|
| `VITE_SUPABASE_URL` | Supabase API endpoint | ✓ | ✓ |
| `VITE_SUPABASE_ANON_KEY` | 공개 anon key | ✓ | (Fn에서 자동 주입) |
| `VITE_LIVEKIT_URL` | LiveKit WebSocket URL | ✓ | |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function 전용 비공개 | | ✓ |
| `LIVEKIT_API_KEY` | LiveKit API key | | ✓ |
| `LIVEKIT_API_SECRET` | LiveKit secret (비공개) | | ✓ |
| `LIVEKIT_SERVER_URL` | LiveKit HTTP endpoint | | ✓ |
| `FAL_KEY` | fal.ai API key (비공개) | | ✓ |
| `R2_ACCOUNT_ID` | Cloudflare 계정 ID | | ✓ |
| `R2_BUCKET_NAME` | R2 버킷 이름 | | ✓ |
| `R2_ACCESS_KEY_ID` | R2 API (비공개) | | ✓ |
| `R2_SECRET_ACCESS_KEY` | R2 API (비공개) | | ✓ |

### 배포 전 환경변수 검증

필수 환경변수가 모두 설정되었는지 빌드 타임에 확인하고, 누락 시 빌드 실패:

**방법 1: Zod 스키마 검증 (권장)**

```typescript
// src/lib/env.ts
import { z } from 'zod'

const envSchema = z.object({
  // 클라이언트 변수 (VITE_ 접두사)
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_LIVEKIT_URL: z.string().url(),
  VITE_SENTRY_DSN: z.string().url(),
  VITE_ENV: z.enum(['development', 'staging', 'production']),
})

export const env = envSchema.parse(import.meta.env)
```

**빌드 스크립트에서 검증:**

```bash
# package.json
{
  "scripts": {
    "check:env": "node scripts/check-env.js",
    "build": "npm run check:env && tsc -b && vite build"
  }
}
```

```javascript
// scripts/check-env.js
const requiredVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_LIVEKIT_URL',
  'VITE_SENTRY_DSN',
]

const missing = requiredVars.filter(v => !process.env[v])

if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`)
  process.exit(1)
}

console.log('✅ All required environment variables are set')
```

**방법 2: 간단한 셸 체크 (대안)**

```bash
# build.sh
#!/bin/bash
set -e

# 필수 환경변수 확인
for var in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_LIVEKIT_URL VITE_SENTRY_DSN; do
  if [ -z "${!var}" ]; then
    echo "❌ Missing required env var: $var"
    exit 1
  fi
done

# 빌드 진행
tsc -b && vite build
echo "✅ Build completed"
```

### 클라이언트 번들에서 비공개 키 제외 검증

`VITE_` 접두사 없는 변수(비공개 키)가 클라이언트 번들에 섞이지 않았는지 빌드 후 확인:

```bash
# 빌드 후 검증 스크립트
#!/bin/bash

FORBIDDEN_KEYS="SUPABASE_SERVICE_ROLE_KEY LIVEKIT_API_SECRET FAL_KEY R2_"

for key in $FORBIDDEN_KEYS; do
  if grep -r "$key" dist/ --include="*.js" --include="*.html" 2>/dev/null; then
    echo "❌ Error: Found forbidden key '$key' in bundle"
    exit 1
  fi
done

echo "✅ No sensitive keys found in bundle"
```

**package.json에서 실행:**

```json
{
  "scripts": {
    "build": "tsc -b && vite build && node scripts/check-bundle-secrets.js"
  }
}
```

### 환경 보호 규칙 (MUST NOT)

- **비공개 키는 절대 클라이언트 번들에 포함하지 않는다**
  - `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_SECRET`, `FAL_KEY`, `R2_*_KEY` 등
  - Edge Function 또는 백엔드에서만 `Deno.env.get()` 사용
  - 클라이언트 번들: `process.env.VITE_*` 변수만 사용

- **DB 접근 규칙**
  - prod DB에 직접 접속해 수동 수정하지 않는다 (마이그레이션 파일로만)
  - staging에서 prod API key를 사용하지 않는다
  - 로컬 dev에서 prod 데이터를 건드리지 않는다

### Vercel 환경 변수 설정

| 브랜치 | 환경 | 자동 적용 |
|------|------|------|
| `develop` | staging | staging 설정 (GitHub Actions 또는 Vercel 프리뷰 배포) |
| `main` | production | production 설정 (Vercel 프로덕션 배포) |

**Vercel 대시보드 설정:**
```
Settings > Environment Variables
- 프로덕션: VITE_SUPABASE_URL (prod), LIVEKIT_API_KEY (prod) 등
- 프리뷰: VITE_SUPABASE_URL (staging), LIVEKIT_API_KEY (staging) 등
```

**로컬 개발:**
```bash
# .env.development 파일 생성 후 dev 값 입력
# `npm run dev`는 자동으로 .env.development 로드 (Vite 기본)
```

---

## 3. 폴더 구조 (⚠️ 폐기 — §12로 대체됨)

> **이 섹션은 옛 `snack-web/` 설계 유물입니다. 현행 폴더 구조 SSOT는 아래 [§12 스캐폴드 & 폴더 구조](#12-스캐폴드--폴더-구조-g-139)입니다.**
> 여기의 `auth·lobby·stage·settings` 피처명, `i18n/`·`styles/`·`components/layout` 폴더, `pages/` 부재는 모두 옛 구조이며 `ChatterBox/`(§12)와 다릅니다. **새 폴더 추가·이동은 §12만 따르세요.** (CLAUDE.md도 §12를 SSOT로 지목)

```text
snack-web/
├── public/
│   ├── fonts/                  # Schibsted Grotesk, Noto Sans JP/KR
│   ├── lotties/                # dotLottie 파일
│   └── og/                     # OG 이미지
├── src/
│   ├── app/
│   │   ├── App.tsx             # 루트 컴포넌트
│   │   ├── providers.tsx       # QueryClient, I18next, Router
│   │   └── routes.tsx          # react-router route tree
│   ├── components/
│   │   ├── ui/                 # Button, Card, Badge, Input, Dialog 등
│   │   └── layout/             # Header, Footer, Shell
│   ├── features/
│   │   ├── auth/               # 로그인/회원가입/프로필
│   │   ├── avatar/             # 아바타 선택, 캘리브레이션, 렌더
│   │   ├── lobby/              # 방 목록, 검색, 방 생성
│   │   ├── room/               # 묵대, 대본, 채팅, 컨트롤
│   │   ├── stage/              # 묵대 레이아웃, 참가자 HUD
│   │   └── settings/           # 오디오/웹캠/단축키 설정
│   ├── lib/
│   │   ├── livekit.ts          # Room, Track, DataChannel 래퍼
│   │   ├── mediapipe.ts        # FaceLandmarker 초기화 + 52ch 추출
│   │   ├── pixi/
│   │   │   ├── AvatarRenderer.ts   # PixiJS 기반 아바타 렌더러
│   │   │   ├── RigLoader.ts        # rig JSON + parts PNG 로드
│   │   │   └── ParameterDriver.ts  # blendshape → rig 파라미터 매핑
│   │   ├── supabase.ts         # Supabase client
│   │   └── constants.ts        # 파라미터 ID, DataChannel 프로토콜
│   ├── hooks/
│   │   ├── useRoom.ts          # LiveKit room lifecycle
│   │   ├── useWebcam.ts        # MediaPipe + 치머라 권한
│   │   ├── useAvatar.ts        # PixiJS canvas lifecycle
│   │   └── useLocalUser.ts     # 인증 + 선택된 모델
│   ├── stores/
│   │   ├── roomStore.ts        # 방 상태, 참가자, 권위 상태
│   │   ├── userStore.ts        # 유저, 모델, 설정
│   │   └── stageStore.ts       # 묵대 UI 상태 (슬롯, 대본, 배경)
│   ├── types/
│   │   ├── rig.ts              # rig JSON 스키마 (zod)
│   │   ├── blendshape.ts       # 52 blendshape 인덱스 계약
│   │   └── room.ts             # Room, Participant, Chat 메시지 타입
│   ├── i18n/
│   │   └── index.ts            # i18next init + ko/ja/en 리소스
│   ├── styles/
│   │   └── globals.css         # Tailwind 4 @import + 커스텀 토큰
│   └── utils/
│       └── cn.ts               # clsx + tailwind-merge
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts          # Tailwind 4는 선택적
└── package.json
```

---

## 4. 라우트/페이지 구조

| 경로 | 페이지 | 설명 |
|---|---|---|
| `/` | **Landing** | 플랫폼 소개 + "묵대에 오르기" CTA |
| `/login` | **Login** | 이메일/소셜 로그인 |
| `/register` | **Register** | 회원가입 |
| `/models` | **Model Select** | 보유 버튜버 선택 + 웹캠 캘리브레이션 |
| `/lobby` | **Lobby** | 방 목록, 주제 태그, 검색, 방 생성 |
| `/rooms/:roomId` | **Room** | 묵대 핵심 화면 |
| `/dub/create` | **DUB Create** | 영상 업로드 (MP4/YouTube URL) + 대본 자동 추출. 실제 녹음은 room-bound DUB overlay로 진입 |
| `/dub/:dubSessionId` | **DUB Session Admin** | 세션 준비/역할 배정/상태 확인. 녹음 UI는 `/rooms/:roomId`의 `stageStore.mode='dub'` overlay에서 실행 |
| `/settings` | **Settings** | 오디오, 웹캠, 단축키 |

### 인증 가드

- `/models`, `/lobby`, `/rooms/:roomId`는 인증 필요.
- `/login`, `/register`는 비인증 전용.
- SPA 이므로 클라이언트 사이드 가드 + Supabase session subscribe.

---

## 4.5 페이지별 UX 설계

> 레퍼런스: Animaze Rooms · Stage Together (ACM) · Meld Studio · Casting Call Club · LiveKit Avatar Docs · VoiceStage Beta(이미지)

### `/` — 랜딩

- 웹캠 켜면 랜딩 위 아바타가 즉시 반응하는 인터랙티브 데모 (설명 대신 체험)
- "지금 N명이 묵대에서 연기 중" 실시간 카운터 (사회적 증거)
- 로그인 없이 관람만 가능한 공개 Watch-only 데모 방 링크
- CTA 카피: "버튜버 제작" → "버튜버로 함께 연기"로 재정비 필요

### `/login`, `/register` — 인증

- 방 초대 링크(`/rooms/:id`) → 로그인 완료 후 해당 방으로 자동 복귀 (리다이렉트 보존)
- 게스트 관람 입장: MVP는 회원가입 없이 30초 read-only viewer만 허용한다. 채팅·반응·투표는 로그인 viewer + Edge Function 검증 이후에만 허용한다.
- Discord / Twitter OAuth 추가 (버튜버 커뮤니티 친화) — **P1 Phase 2** (AUTH-02b·AUTH-02c, G-153)
- 방 코드 6자리 직접 입력 → 즉시 입장 경로 병행 (Animaze 패턴): `snack.app/join?code=ABCDEF`

### `/models` — 모델 선택 + 캘리브레이션 **[개발 예정]**

- **강제 워크스루 (Progressive Disclosure)**: 가입 후 자동으로 `/models` 진입. 3단계 위저드 완료 강제 → 로비 진입 가능. 각 단계에서 필수 정보만 노출, 나머지는 마우스 호버 시 컨텍스트 헬프 표시 (Duolingo 패턴)
- 3단계 위저드: ① 정면 기준점 캡처 → ② 표정 테스트(눈·입) → ③ 확인·저장
- 캘리브레이션 중 파라미터 수치(`EyeLOpen`, `MouthOpenY` 등) 실시간 표시
- 모델 없는 신규 유저: 기본 실루엣 아바타 제공 → "내 모델 만들기" CTA
- 웹캠 없이 키보드 단축키로 표정 트리거하는 오프라인 경로 (iOS Safari 대응)

### `/lobby` — 로비

- **Discovery Feed (탭식 피드)**: 수직 피드 3탭: "🔴 지금 라이브" (현재 라이브 방만) / "⭐ 추천 방" (새 방 + 인기) / "🏷️ 장르별" (드라마·코미디·판타지 필터) (Twitch 패턴)
- 방 카드: 장르 태그(공포·로맨스·코미디·낭독극) + 인원 + 자물쇠 표시
- 카드 호버 시 현재 배경 씬·참가자 아바타 썸네일 프리뷰
- 퀵 필터: "관람 가능", "비밀번호 없음", "오디션 모집"
- 최근 입장 방 섹션 (localStorage)

### `/rooms/:roomId` — 묵대 (핵심)

**레이아웃 & 아바타** → 확정 존 구성·패널 콘텐츠: `DESIGN-DIRECTION.md §6`
- 좌패널(13%) / 좌아바타컬럼(13-22%) / 메인뷰(22-78%) / 우아바타컬럼(78-87%) / 우패널(86-100%), 상단·하단 바 각 9%
- MVP는 최대 6 actor 슬롯. 레이아웃 좌3·우3을 기본으로 쓰고, 하단 2 보조 슬롯은 viewer/guest 확장용으로 P1 이후 활성화한다. OBS 방송 송출은 P2 옵션이며 MVP/P0 구현 범위가 아니다.
- 각 참가자를 `<ParticipantSlot>` 독립 컴포넌트로 — 추가/제거/뮤트/순서 교체가 컴포넌트 단위 (LiveKit ParticipantItem 패턴)
- 방장이 드래그해 슬롯 순서 변경
- Active-speaker 강조: 말하는 아바타 Z-order 앞 + 글로우 링
- **우상단 Presence Avatar Stack**: 접속 중인 N명의 작은 썸네일 아바타를 우상단에 스택 형태로 표시. 클릭 시 해당 슬롯으로 포커스 및 카메라 줌 (Figma 패턴)

**대본 패널 (Teleprompter) — 스테이지 매니저 모드** (Stage Together 차용)
- 방장이 "큐 전진/후퇴" → 모든 클라이언트 대본 동기 점프 (reliable Data Track)
- 배우는 개인 스크롤 자유, 방장 큐 알림 수신 시 배너 표시
- 내 대사 줄만 배경색 강조 + 글자 크기 독립 조절
- **차례 기반 진행바 (Timed Turns)**: 각 참가자의 대사 예상 소요 시간을 미리 설정 가능. 대사 진행 중 해당 슬롯 위에 진행바 표시 → 시간 초과 시 배너 "턴 종료" 표시 (Jackbox Timed Turns 패턴, MVP에서는 선택 기능)

**오디오**
- Push-to-talk 기본값: 스페이스바 = 말할 때만 마이크 활성
- F키 긴급 전체 뮤트 (방 제목 옆 상태 표시)
- 멀티채널 믹서 (Meld Studio 패턴):
  - 배우 N명 개별 슬라이더 + 뮤트
  - BGM/효과음 채널
  - 메인뷰 영상음 채널

**기타**
- 핫키 → 아바타 위 Lottie 오버레이 필살기 효과 (dotLottie 이미 포함)
- 채팅 ↔ 영상 자막 오버레이 전환 모드
- **채팅 반응 버튼**: 채팅 아래 미리셋 반응 버튼(👍 😂 👏 😢) → 클릭 시 3초간 화면 중앙 부동 이모지 + 아바타 위 팝업 (Zoom Reactions 패턴)
- 코너 PiP: 내 웹캠 원본 미리보기
- OBS 방송 송출 모드는 P2 옵션이다. 구현 시 `?obs_token={token}&obs={mode}`만 허용하고, `?transparent=1`·`?obs=1` 같은 토큰 없는 레거시 진입은 403 처리한다.

### 방장 콘솔 (묵대 내 오버레이)

- 배경/슬롯 교체: 빠른 그리드 탭 클릭 (드래그 없이)
- 사운드보드: 효과음 버튼 그리드 (박수·스포트라이트·전환음)
- 씬 타임라인: "시작 → 씬1 → 씬2 → 종료" 상태 + 경과 시간
- 대본 큐 컨트롤: 방장만 전진/후퇴 가능
- MediaRecorder 로컬 녹화 버튼 (OBS 없이 빠른 캡처, MVP)

### `/dub/create` — 더빙 세션 생성

- 영상 소스 선택: ① MP4 직접 업로드 ② YouTube URL 입력
- 업로드/다운로드 진행률 표시
- Whisper API 자동 호출 → STT 결과 대기 (상태 배너: "대본 추출 중 ...")
- Diarization 결과 미리보기: 화자별 구간 + 임시 대사 표시 (DUB-02)
- 역할명 자동 추천 ("Speaker 1" → 참가자가 재할당 가능)
- "더빙 세션 시작" CTA 클릭 → `/dub/:dubSessionId` 진입

### `/dub/:dubSessionId` — 더빙 녹음 세션

**좌패널 (역할 배정 + 대본)**
- 화자별 역할 리스트: "Speaker 1: Alice (참가자1이 이미 녹음함)" → 이모지 체크
- 각 역할 클릭 → 해당 대사 텍스트 확대 표시
- 호스트만: 배우 재할당 드롭다운 (DUB-03)

**메인뷰 (영상 + 타이밍 동기)**
- 원본 영상 재생 (음성 음소거, 자막으로만 표시)
- 현재 활성 대사 영역 강조 (타임스탐프 기반)
- "내 차례입니다" 배너 + 음성 큐 (비프음)
- 타임라인 진행바 (몇 초 남았나)

**우패널 (내 녹음)**
- 상태: "대기 중" / "녹음 준비" / "녹음 중" / "완료 ✓"
- 녹음 버튼 (손 들기 → 자동 녹음 시작, 내 차례 끝나면 자동 중지)
- 재생 프리뷰: 내가 녹음한 오디오 확인
- 타임셋 미세조정 슬라이더 (±200ms)

**하단 바**
- 다른 배우들의 완료 상태 (7/8 명 완료)
- 전체 재촬영 버튼 (호스트만)
- "모두 준비됨 → 최종 합성 진행" CTA (호스트)

**상태 전이 (실시간)**
- Realtime: dub_tracks.status 변경 → UI 즉시 반영
- 모든 배우 완료 시 → "최종 합성 시작" 알림 배너
- Compositing 진행 중 → 진행바 표시

### `/settings` — 설정

- 입력 마이크 실시간 파형 시각화
- 표정 파라미터별 감도 슬라이더 (min/max 범위 조절) **[개발 예정]**
- 단축키 리매핑: 항목 클릭 → 새 키 입력
- LiveKit 레이턴시 1-click 네트워크 테스트

---

## 4.6 UX 레퍼런스

| 사이트 | 참고 포인트 |
|---|---|
| [Animaze Rooms](https://www.animaze.us/manual/roomsguide) | 방 코드 즉시 입장, 6자리 코드 UX |
| [Stage Together (ACM)](https://dl.acm.org/doi/fullHtml/10.1145/3537972.3537977) | 큐 동기화, 스테이지 매니저 모드 |
| [Meld Studio](https://meldstudio.co/) | 멀티채널 오디오 믹서, 장면 전환 |
| [Casting Call Club](https://www.castingcall.club/) | 역할/프로젝트 메타데이터 패널 |
| [LiveKit Avatar Docs](https://docs.livekit.io/agents/models/avatar/) | ParticipantItem 컴포넌트 분리 패턴 |
| VoiceStage Beta | 기존 레퍼런스 이미지 (방 헤더·대본·아바타 배치) |
| [Figma](https://www.figma.com) | Live Cursor, Presence Avatar Stack |
| [Slack](https://slack.com) | Presence Indicator (자동 감지) |
| [Zoom](https://zoom.us) | Emoji Reactions, 손 들기 |
| [Twitch](https://twitch.tv) | Discovery Feed, 개인화 추천 |
| [Discord](https://discord.com) | Server Discovery, 카테고리 필터 |
| [Duolingo](https://duolingo.com) | 강제 워크스루 온보딩, 진행 단계화 |
| [Jackbox Games](https://jackboxgames.com) | Timed Turns + Progress Bar |

---

## 4.7 유명 서비스에서 차용할 UX 패턴

> 동종 서비스가 아닌 검증된 대형 서비스의 패턴을 우리 플랫폼 화면에 이식.

### A. 온보딩 — Duolingo / Notion 패턴

**Progressive Disclosure (점진적 정보 공개)**
- 가입 후 강제 워크스루: 아바타 선택 → 캘리브레이션 → 음성 테스트 → 첫 방 입장까지 단계 완료 강제
- 각 단계에서 필수만 노출, 나머지는 마우스 호버 시 컨텍스트 헬프 (Figma 패턴)
- 로비 첫 진입 시 "인기 방 3개" 프리셋 추천 카드 (Notion 템플릿 패턴)
- 구현 복잡도: 낮음

### B. 실시간 협업 — Figma / Google Docs 패턴

**Spatial Awareness UI (공간 인식)**
- 방 안: 각 참가자 아바타 위 고유색 이름 배지 상시 표시
- 우상단 Presence Avatar Stack: 접속 중인 N명 썸네일 스택, 클릭 시 해당 슬롯으로 포커스
- "말하는 중" 인디케이터: 아바타 테두리 링 + 이름 배지 펄스 (active-speaker와 통합)
- 구현 복잡도: 중간

### C. 방 탐색 — Twitch / Discord / Airbnb 패턴

**Smart Discovery Feed**
- 로비: "지금 라이브" → "추천 방" → "장르별" 탭 수직 피드
- 방 카드 hover → 대본 첫 줄 스니펫 + 현재 씬 배경 미리보기 팝업
- 장르(드라마·코미디·판타지) × 참여도(인기/신규) × 비밀번호 여부 필터 조합
- 구현 복잡도: 낮음(필터) ~ 중간(피드 개인화)

### D. 퍼포먼스 몰입 — Jackbox / Zoom 패턴

**Engagement Layer**
- 대사 진행 중 차례 배우 슬롯에 타이머 진행바 표시 (Jackbox Timed Turns)
- 채팅 반응 버튼(👍 😂 👏 😢) → 3초간 화면 부동 이모지 + 아바타 위 팝업 (Zoom Reactions)
- 연기 끝나고 "누가 최고였나" 관객 투표 카드 (선택 기능)
- 구현 복잡도: 낮음(리액션) ~ 중간(투표)

### E. 상태 표시 — Slack / Discord 패턴

**Multi-Layer Presence System**
- 아바타 옆 자동 감지 점: 녹색(활성) / 흰색(자리비움) / 회색(연결 중)
- 주요 상태 텍스트: "마이크 ON" / "음소거" / "표정 트래킹 중 [개발 예정]"
- Discord식 활동 상태: 로비 방 카드에 "연기 중" / "대기 중" 배지
- 구현 복잡도: 낮음

### 구현 우선순위

| 우선순위 | 패턴 | 화면 | 복잡도 |
|---|---|---|---|
| P1 | Slack Presence + Zoom Reactions | 방(묵대) | 낮음 |
| P1 | Discord 필터 + 카드 미리보기 | 로비 | 낮음 |
| P2 | Figma Presence Avatar Stack | 방(묵대) | 중간 |
| P2 | Duolingo 강제 워크스루 | 온보딩 | 중간 |
| P3 | Jackbox 타이머 진행바 | 방(묵대) | 낮음 |
| P3 | Twitch 개인화 피드 | 로비 | 중간 |

---

## 5. 핵심 모듈 설계

### 5.1 LiveKit 통합 (`lib/livekit.ts`)

- **Room**: `livekit-client`의 `Room` 객체.
- **Audio Track**: 마이크 트랙 publish/subscribe.
- **Data Track**: blendshape 52ch + 채팅 + 방 권위 상태.
  - blendshape: `unreliable`, unordered, 30fps — 손실 묵호.
  - 채팅/권위: `reliable` — 순서 보장.
- **RoomService API**: 서버 측(Cloudflare Worker/Supabase Edge)에서 토큰 발급 + 강퇴/잠금.

### 5.2 MediaPipe 트래킹 (`lib/mediapipe.ts`) — **[개발 예정]**

- `@mediapipe/tasks-vision`의 `FaceLandmarker`.
- 브라우저 Web Worker에서 실행(메인 스레드 블록 방지).
- 출력: ARKit 52 blendshape + 눈 gaze.
- One-Euro Filter + EMA 스묭.
- ⚠️ iOS Safari는 FaceLandmarker 미지원 → 모바일은 뷰어/채팅 전용.

### 5.3 PixiJS 아바타 렌더 (`lib/pixi/`)

- `RigLoader`: Vtube의 `rig_v0_project/`를 정적 호스팅에서 로드.
  - `character.json`, `mini_rig.json`, `parts/*.png`, `expressions.json`.
- `AvatarRenderer`: PixiJS v8 Application → parts를 Sprite/Container로 구성 → 파라미터 업데이트 시 변형 적용.
- `ParameterDriver`: MediaPipe 52ch → Cubism 파라미터 ID 매핑.
  - `ParamAngleX/Y/Z`, `ParamEyeLOpen/ROpen`, `ParamEyeBallX/Y`, `ParamMouthOpenY`, `ParamMouthForm`, etc.
- **6인 동시 렌더**: 단일 PixiJS Application + 단일 WebGL 컨텍스트 + 단일 rAF 루프 내에서 6개의 아바타 Container/RenderTexture를 배치. `Vtube/experiments/theater-platform-001/poc0_render_scale/single_page/` PoC에서 동일 구조로 N=8까지 60fps PASS(M5 Metal, 메시 변형 포함). iframe 분리 구조는 N≥3에서 rAF throttling으로 측정 아티팩트가 발생했으므로 사용하지 않는다. 저사양 PC(Acer 등)에서 N=4/6/8 추가 측정이 최종 게이트.

### 5.4 Supabase (`lib/supabase.ts`)

- **Auth**: 이메일/비밀번호, Google OAuth.
- **DB**: users, rooms, room_participants, models, scripts, dub_sessions, dub_tracks, dub_outputs.
- **Storage**: rig JSON + PNG parts, 배경 이미지, 대본 파일, 원본 영상(MP4), 더빙 녹음 오디오, 최종 합성 영상.
- **Realtime**: 방 권위 상태(방장, 잠금, 슬롯) 동기화 — LiveKit Data Track의 reliable 메시지와 병행. DUB 세션 상태 동기화.

### 5.5 DUB 파이프라인 (`lib/dub.ts`) **[개발 예정]**

**흐름:**
```
1. 사용자 영상 업로드 (MP4 또는 YouTube 링크)
   → R2에 저장, dub_sessions.source_video_url 기록
   
2. OpenAI transcription/diarization server adapter 호출 (비동기 Edge Function 또는 Cloudflare Worker)
   → STT 결과 + diarization (화자 분리)
   → dub_sessions.diarization_result_json에 저장
   
3. 역할 분배 (호스트가 수동 조정 가능)
   → dub_tracks 생성: 각 화자 구간마다 참가자 할당
   
4. 더빙 녹음 세션 (LiveKit + MediaRecorder)
   → 각 배우가 자신의 차례에 맞춰 녹음
   → 녹음 완료 후 R2에 업로드 (dub_tracks.recording_url)
   
5. 최종 합성 (LiveKit Egress 또는 ffmpeg.wasm)
   → 원본 영상 + 더빙 오디오 트랙 → 최종 영상
   → dub_outputs.output_video_url에 저장
```

**의존성:**
- OpenAI transcription/diarization API adapter (서버 전용. 브라우저 STT는 파일/키/비용 경계가 불리하므로 금지)
- `yt-dlp` (백엔드: YouTube URL → MP4 변환)
- `livekit-client` (녹음 동기화)
- `ffmpeg.wasm` (선택, 가벼운 합성용) 또는 LiveKit Egress (운영용)

**상태 머신:**
- DubSession: IDLE → UPLOADED → TRANSCRIBING → READY → RECORDING → COMPLETED
- DubTrack: ASSIGNED → RECORDING → SUBMITTED → SYNCED

**Realtime 리스너:**
- `dub_sessions.status` 변경 시 UI 업데이트 (transcribing → ready)
- `dub_tracks.recording_url` 저장 시 배우 완료 마크 표시
- `dub_outputs.status` 완료 시 다운로드 링크 활성화

---

## 6. 상태 관리

### 6.1 Zustand stores

| Store | 책임 |
|---|---|
| `userStore` | 인증 세션, 프로필, 보유 모델, 설정 |
| `roomStore` | LiveKit room, 참가자 목록, 오디오/뮤트 상태, 방장 권한 |
| `stageStore` | 묵대 UI: 슬롯 콘텐츠, 대본, 배경, 채팅, 사운드보드 |
| `trackingStore` | 내 MediaPipe 출력, 캘리브레이션 오프셋 |

### 6.2 React Query

- 방 목록, 방 상세, 모델 목록, 대본 등 서버 상태 캐싱.
- Optimistic update로 채팅/참가자 상태 반응 속도 향상.

---

## 7. 배포 전략

### 7.1 권장: Cloudflare Pages

| 항목 | 내용 |
|---|---|
| 비용 | 묣은 티어 대역폭 사실상 무제한 |
| 빌드 | `npm run build` → `dist/` |
| 배포 | `wrangler pages deploy dist` |
| 이유 | Vercel보다 정적 대역폭 비용 우위. THEATER-PLATFORM §6 권장. |

### 7.2 대안: Vercel

- 기존 `snack-web` 배포 경험 재활용 가능.
- 단순 정적 파일이라 Vercel Pro까지 갈 일 없음.

### 7.3 백엔드/실시간

| 영역 | 시작 | 성장 시 |
|---|---|---|
| LiveKit | LiveKit Cloud Build/Ship | 셀프호스트 (Hetzner) |
| Supabase | Free/Pro | Scale |
| CDN 비디오 | Cloudflare R2 (egress 묣은) | — |

### 7.4 URL 전략 (G-131)

#### MVP — 별도 URL 운영

| 컴포넌트 | 호스팅 | URL |
|---------|--------|-----|
| 랜딩 페이지 (Next.js) | Vercel | `snack-web-khaki.vercel.app` |
| 플랫폼 SPA (Vite) | Cloudflare Pages | `snack-web-prod.pages.dev` |

랜딩 CTA에서 플랫폼 URL로 직접 링크. 커스텀 도메인 불필요.

#### 프로덕션 — 서브도메인 분리

```
chatterbox.kr          → Vercel (랜딩)
app.chatterbox.kr      → Cloudflare Pages (플랫폼)
```

Cloudflare DNS에서 CNAME 설정:
```
Type: CNAME  Name: app  Content: snack-web-prod.pages.dev
```

#### 동일 도메인 경로 분기 (`/app/*`)

Vercel + Cloudflare Pages는 Nameserver를 공유할 수 없으므로 **Cloudflare Workers 리버스 프록시 필요** (월 $5). MVP에서는 불필요.

---

### 7.5 번들 전략 (G-110)

#### Vite `manualChunks` 설정

Vite의 `build.rollupOptions.output.manualChunks`를 사용하여 초기 번들 크기를 최소화하고 캐싱 효율을 높입니다.

**권장 청크 분리:**

| 청크 | 포함 라이브러리 | 목적 |
|---|---|---|
| `vendor-react` | `react`, `react-dom` | 거의 변하지 않음 |
| `vendor-state` | `zustand`, `@tanstack/react-query` | 상태 관리 안정화 |
| `vendor-ui` | `@livekit/components-react`, `shadcn/ui`, `motion` | UI 컴포넌트 그룹화 |
| `vendor-pixi` | `pixi.js` | 지연 로드(React.lazy) 예정 |
| `vendor-mediapipe` | `@mediapipe/tasks-vision` | 지연 로드(React.lazy) 예정 |
| `index` | 앱 코드 | 진입점 |

**vite.config.ts 예시:**

```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-state': ['zustand', '@tanstack/react-query'],
          'vendor-ui': [
            '@livekit/components-react',
            'motion',
            '@radix-ui/*', // shadcn/ui 의존성
          ],
          'vendor-pixi': ['pixi.js'],
          'vendor-mediapipe': ['@mediapipe/tasks-vision'],
        },
      },
    },
  },
});
```

#### React.lazy + Suspense로 동적 import

PixiJS와 MediaPipe는 초기 페이지 로드 시 필수가 아니므로 React.lazy를 사용해 필요할 때만 로드합니다.

```typescript
// lib/pixi/AvatarRenderer.tsx
const AvatarRenderer = React.lazy(() => import('./AvatarRenderer'));

// components/Room.tsx
<Suspense fallback={<div>Avatar loading...</div>}>
  <AvatarRenderer roomId={roomId} />
</Suspense>
```

#### 번들 크기 시각화

`rollup-plugin-visualizer`로 번들 크기를 분석합니다.

```bash
npm install --save-dev rollup-plugin-visualizer
```

```typescript
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
});
```

`npm run build`시 브라우저에서 `dist/stats.html` 자동 오픈하여 청크 크기 확인.

#### 청크 크기 목표

| 메트릭 | 목표 | 방법 |
|---|---|---|
| 초기 번들 (gzip) | < 200 KB | vendor 청크 분리 + tree-shake |
| HTML | < 15 KB | 정적 |
| CSS | < 50 KB | Tailwind purge |
| 개별 청크 | < 100 KB | manualChunks + lazy |

#### 추가 최적화

- **Tree-shake**: `package.json`에 `"sideEffects": false` 명시.
- **CSS minify**: Tailwind 4 기본 활성화.
- **Terser**: Vite 기본 활성화. 필요시 `build.minify: 'terser'` 명시.
- **Gzip 확인**: `npm run build && npm install -g gzip-size-cli && gzip-size dist/index.js`.

---

### 7.6 Progressive Enhancement 폴백 (G-127)

#### WebGL 미지원 폴백

```typescript
// src/lib/pixi/capabilities.ts
export function checkWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
```

| 상황 | 폴백 | UI |
|------|------|-----|
| WebGL2 미지원, WebGL1 지원 | WebGL1 모드로 PixiJS 실행 (성능 저하 허용) | "낮은 사양 기기에서 실행 중입니다" |
| WebGL 완전 미지원 | 정적 PNG 아바타 이미지 표시 (Canvas2D 불필요) | "아바타 애니메이션을 지원하지 않는 기기입니다" |
| WebGL context loss | `contextlost` 이벤트 감지 → 자동 재생성 시도 3회 → 정적 이미지 | "연결이 끊어졌습니다. 다시 시도 중..." |

#### MediaPipe 미지원 폴백 (iOS Safari < 16.4, 구형 Android)

```typescript
// src/lib/mediapipe/fallback.ts
function checkMediaPipeSupport(): boolean {
  // WASM SIMD 미지원 감지
  if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    return false;
  }
  return true;
}
```

| 상황 | 폴백 |
|------|------|
| WASM SIMD 완전 미지원 | Lite 모델 시도 → 실패 시 키보드 표정 트리거 |
| Lite 모델도 실패 | 키보드 트리거만 (음성은 정상 작동) |

**키보드 표정 트리거 (폴백):**

```
┌────────────────────────────────┐
│ 얼굴 트래킹을 지원하지 않는 기기입니다 │
│                                │
│ 다음 키를 눌러 표정을 선택하세요: │
│                                │
│ [1] 기쁨 😊                      │
│ [2] 놀람 😮                      │
│ [3] 슬픔 😢                      │
│ [4] 화남 😠                      │
│ [5] 기본                        │
│                                │
│ (표정 선택 → blendshapeStore   │
│  에 직접 값 주입, FaceLandmarker 없이)
└────────────────────────────────┘
```

#### JavaScript 비활성화 폴백

```html
<!-- index.html -->
<noscript>
  <div style="text-align:center; padding:2rem; font-family:sans-serif; background:#1a1a2e; color:#fff">
    <h1 style="margin-bottom:1rem">ChatterBox</h1>
    <p style="font-size:16px; margin-bottom:1rem">
      이 서비스는 JavaScript가 필요합니다.
    </p>
    <p style="font-size:14px; color:#aaa">
      브라우저 설정에서 JavaScript를 활성화해 주세요.
    </p>
    <details style="margin-top:2rem; text-align:left; display:inline-block">
      <summary style="cursor:pointer; color:#ff8c2a">설정 방법</summary>
      <ul style="margin-top:1rem; padding-left:1.5rem">
        <li>Chrome: 설정 > 개인정보 및 보안 > 사이트 설정 > JavaScript</li>
        <li>Firefox: about:config > javascript.enabled = true</li>
        <li>Safari: 환경설정 > 보안 > JavaScript 사용</li>
      </ul>
    </details>
  </div>
</noscript>
```

#### WebRTC 미지원 (앱 핵심 기능)

**폴백 없음**: 초기 capability 체크 시 WebRTC 미지원 → 접속 차단 (에러 페이지)

```typescript
// src/app/routes.tsx
function RoomEnter() {
  const isRTCSupported = typeof RTCPeerConnection !== 'undefined';
  
  if (!isRTCSupported) {
    return (
      <div className="error-screen">
        <h1>호환성 오류</h1>
        <p>이 기기에서는 지원하지 않는 기능이 필요합니다.</p>
        <p>최신 브라우저(Chrome 60+, Safari 15+, Firefox 55+)를 사용해 주세요.</p>
        <a href="/">돌아가기</a>
      </div>
    )
  }
  
  return <RoomView />
}
```

#### 정리 — 폴백 우선순위

```
WebGL2 → WebGL1 → 정적 아바타 (우선순위: 고성능 → 저성능)
MediaPipe Full → MediaPipe Lite → 키보드 트리거 (우선순위: 자동 → 수동)
JavaScript 필수 (폴백 없음)
WebRTC 필수 (폴백 없음)
```

**구현 체크리스트**:
- [ ] `src/lib/pixi/capabilities.ts` WebGL 감지 함수 구현
- [ ] `src/lib/mediapipe/fallback.ts` MediaPipe 감지 + Lite 모델 로드
- [ ] `src/lib/keyboard-expression.ts` 키보드 표정 트리거 (1~5 키)
- [ ] `index.html`에 `<noscript>` 블록 추가
- [ ] `RoomEnter` 라우트에 WebRTC 체크 추가
- [ ] 로컬 테스트: Chrome DevTools > Disable WebGL/WASM 옵션 시뮬레이션
- [ ] Safari iOS < 16 실기 테스트 (MediaPipe Lite)

---

### 7.7 WebRTC ICE 서버 구성 (G-123)

#### MVP 판정: LiveKit Cloud 기본 설정 충분

**LiveKit Build/Ship 플랜 이상**에서는 **embedded TURN 자동 제공**되므로 별도 ICE 서버 설정 불필요. 셀프호스트 필요 시에만 coturn 구성.

#### 7.7.1 ICE 연결 우선순위

| 순위 | 방법 | 프로토콜 | 포트 | 환경 | 비고 |
|---|---|---|---|---|---|
| 1 | UDP 직접 | UDP | P2P | 공개 NAT | **가장 빠름 (지연 <50ms)** |
| 2 | TURN UDP | UDP | 3478 | 제한 NAT | 신뢰성 ★★★★★ |
| 3 | TURN TCP | TCP | 443 | 회사 방화벽 | 폴백 |
| 4 | TURN TLS | TLS | 443 | 극도 제한 | 최후 수단 |

**LiveKit SDK 설정:**
```typescript
// src/lib/livekit.ts
const room = new Room({
  // LiveKit Cloud (MVP): ICE 서버 자동 제공 → 추가 설정 불필요
  // iceTransportPolicy: 'all' (기본값, UDP → TURN 우선순위 자동)
});

// 셀프호스트 필요 시:
import { Room, RoomOptions } from 'livekit-client';

const roomOptions: RoomOptions = {
  iceServers: [
    {
      urls: ['stun:stun.l.google.com:19302'],
    },
    {
      urls: [
        'turn:coturn.example.com:3478?transport=udp',
        'turn:coturn.example.com:3478?transport=tcp',
        'turns:coturn.example.com:443?transport=tcp',
      ],
      username: 'user',
      credential: 'pass123', // long-term credentials
    },
  ],
  iceTransportPolicy: 'all', // 기본: UDP → TURN 순
  // iceTransportPolicy: 'relay' → TURN만 사용 (기업 환경)
};
```

#### 7.7.2 연결 상태 모니터링

```typescript
// src/hooks/useRoom.ts
room.on('connectionStateChanged', (state) => {
  console.log(`ICE 연결: ${state}`); // CONNECTING → CONNECTED
  
  if (state === 'disconnected') {
    // 네트워크 복구 대기
    toast.error('연결이 끊어졌습니다. 다시 연결 중...');
  }
});

// WebRTC 통계 (디버깅용)
const stats = await room.localParticipant?.audioTrack?.getStats();
if (stats) {
  console.log('ICE Candidate Pair:', {
    currentRoundTripTime: stats.roundTripTime,
    availableOutgoingBitrate: stats.bytesReceived,
  });
}
```

#### 7.7.3 셀프호스트 coturn 기본 설정

**요구사항:**
- Linux 서버 (Hetzner 권장, 월 €10~20)
- coturn 패키지 설치
- 공개 IP + 방화벽 포트 개방

```bash
# Ubuntu 설치
sudo apt-get install coturn

# /etc/coturn/turnserver.conf
listening-ip=0.0.0.0
listening-port=3478
listening-ip=0.0.0.0
tls-listening-port=5349

# 인증: long-term credentials
user=user:pass123
realm=coturn.example.com

# 대역폭 제한 (선택)
bps-capacity=1000000  # 1Mbps per user
total-bps=100000000   # 100Mbps total

# 로그
log-file=/var/log/coturn/coturn.log
```

**방화벽 개방:**
```bash
ufw allow 3478/udp
ufw allow 3478/tcp
ufw allow 5349/tcp
ufw allow 49152:65535/udp  # RTP relay 범위
```

#### 7.7.4 연결 실패 디버깅 절차

| 증상 | 원인 | 해결책 |
|------|------|--------|
| `RTCPeerConnection` 타임아웃 (>30s) | Symmetric NAT / 기업 방화벽 | TURN 강제: `iceTransportPolicy='relay'` |
| `getStats()` 모두 `closed` | STUN 응답 없음 | Google STUN 공개 IP 확인 |
| 오디오 편향(One-way) | ICE 수집 불완전 | 광대역(50Mbps 이상) 네트워크 테스트 |
| 1~2초 단속음 | Packet loss | RTX(재전송) 자동 활성화, 지연 측정 |

**Chrome DevTools 디버깅:**
```javascript
// chrome://webrtc-internals 열기 → RTCPeerConnection 통계 확인
// - ICE Candidate Pair: state=succeeded, currentRoundTripTime
// - Inbound RTP: jitterBufferDelay, packetsLost
// - 로컬 Candidate: priority, transport
```

#### 7.7.5 스케일 판정 기준 (셀프호스트 전환)

**MVP (LiveKit Cloud 유지):**
- DAU < 1,000
- 동시 접속 < 50
- 월 비용 < $1,000

**성장 (셀프호스트 검토):**
- DAU 5,000+
- 동시 TURN 릴레이 연결 > 100
- 월 LiveKit 요금 > $2,000

**계산식:**
```
coturn 월 비용 ≈ €15 (서버) + 대역폭 €0.05/GB
LiveKit 월 비용 ≈ $0.001/분 × 분당 참가자 시간
(예: 24명 × 4시간 × 30일 = $288)
```

셀프호스트 ROI: DAU 10,000+ 기준 월 $1,500+ 절감.

---

## 8. 기존 `snack-web` 자산 마이그레이션

| 기존 자산 | 활용 방안 |
|---|---|
| `src/content/content.ts` 카피 | `src/i18n/` 리소스로 재활용 |
| `src/content/assets.ts` | `public/` 경로로 이동. `akane.png`, `build.mp4`, `ruby-demo.mp4` 등 재활용 |
| `design/DESIGN-TOKENS.md` | Tailwind 4 CSS 변수 또는 `theme()`로 이식 |
| flecto 색상/타이포 | 그대로 유지 |
| Lottie JSON | dotLottie로 변환 후 `public/lotties/`에 배치 |
| `public/avatars/akane.png` | 모델 선택/데모에 활용 |

**폐기하는 것:**
- `src/app/page.tsx`의 Next.js App Router 구조
- `src/components/sections/` 랜딩 섹션들 — 메시지만 추출
- Next.js font optimization (`next/font`)
- `next.config.mjs`, `.eslintrc.json`(Next.js 전용)

---

## 9. 단계별 구현 로드맵

### Phase 0 — 스캐폴드
1. Vite + React 19 + Tailwind 4 + TypeScript 프로젝트 생성.
2. react-router (v8) 라우트 트리 구성.
3. i18next + Supabase client 연결.
4. 기존 design token 이식.

### Phase 1 — P1 PoC: 2인 음성+표정 방
1. MediaPipe FaceLandmarker 연동 → 내 아바타 PixiJS 렌더. **[개발 예정]**
2. LiveKit Room 연결 → 음성 + blendshape Data Track. **[개발 예정]**
3. 2인 방에서 서로의 음성/표정 확인. **[개발 예정]**
4. OBS 출력 모드는 Phase 1에서 구현하지 않는다. P2 방송 송출 옵션으로 미루며, 구현 시 `obs_viewer_tokens` 기반 URL만 허용한다.

### Phase 2 — 방 운영
1. Supabase Auth + 모델 선택.
2. 로비/방 목록/방 생성/비밀번호.
3. 방장 강퇴/비활성화/음량/음소거.

### Phase 3 — 묵대 레이어
1. CDN 비디오 + 타임스탬프 동기 재생.
2. 대본 패널(Teleprompter).
3. 배경 선택기.
4. 4~6인 묵대 레이아웃 엔진.

### Phase 4 — 정식화
1. 설정 페이지(오디오/웹캠/단축키).
2. 필살기 핫키 + 사운드보드.
3. 참가자 HUD, active-speaker 강조.
4. Cloudflare Pages 배포.

---

## 10. 리스크 / 주의

| 리스크 | 대응 |
|---|---|
| iOS Safari MediaPipe 미지원 | 모바일은 뷰어/채팅 전용. THEATER-PLATFORM §9 H12 결정. |
| 6인 동시 렌더 성능 | Phase 1에서 저사양 PC PoC로 검증. |
| THA4 eyes 측면 시선 버그 | `mini_cubism_drive.html`에 GAZE-COMP-001(eye_gaze에 따른 eyeBlink 거짓 상승 보정)이 이미 구현됨. SCOUT.md 시점 이후 수정된 상태로, 플랫폼 표준 트래킹 드라이버에 동일 보정을 이식. |
| CDN 비디오 동기 drift | 주기적 타임스탬프 재동기. THEATER-PLATFORM §9 H9. |
| LiveKit 비용 | Cloud → 셀프호스트 전환 경로 확보. |
| BBW 스키닝 미구현 | 단기 FFD 기반 진행. BBW 완료 시 런타임 LBS 경로 추가. |

---

## 11. 관련 문서

- `snack-web/docs/state-machines/_INDEX.md`
- `snack-web/docs/DATA-SCHEMA.md`
- `snack-web/docs/PLATFORM-RESEARCH-SYNC.md`

---

## 12. 스캐폴드 & 폴더 구조 (G-139)

### 레포 구조 결정: 별도 레포 (권장)

| 방식 | 장점 | 단점 |
|------|------|------|
| **별도 레포 (권장)** | CI/CD 완전 분리, Cloudflare Pages·Vercel 배포 독립 | 타입 공유 시 npm 패키지 필요 |
| 모노레포 (npm workspaces) | 타입 공유 용이, 한 곳에서 PR | CI 복잡도 상승, 배포 분기 설정 필요 |

**결정:** 별도 레포 `ChatterBox`. 공유 타입은 단계에서 중복 허용, 스케일 시 `@snack-web/types` npm 패키지로 추출.

### `ChatterBox/` 폴더 구조

```
ChatterBox/
├── public/
│   ├── fonts/           # 로컬 폰트 (woff2)
│   ├── lotties/         # dotLottie JSON
│   └── avatars/         # 기본 프리셋 아바타 PNG
│
├── src/
│   ├── app/             # 라우트 트리 + App.tsx
│   │   ├── App.tsx
│   │   ├── routes.tsx
│   │   └── layouts/
│   │
│   ├── pages/           # 라우트 최상위 컴포넌트
│   │   ├── LobbyPage.tsx
│   │   ├── RoomPage.tsx
│   │   ├── DubCreatePage.tsx
│   │   ├── DubSessionPage.tsx
│   │   └── SettingsPage.tsx
│   │
│   ├── features/        # 기능 단위 폴더 (아래 §12.1 참조)
│   │   ├── avatar/
│   │   ├── chat/
│   │   ├── room/
│   │   ├── stage/       # 룸 무대(원형 6석 레이아웃·active-speaker)
│   │   ├── script/
│   │   ├── tracking/
│   │   ├── vgen/
│   │   └── dub/
│   │
│   ├── components/      # 재사용 UI 컴포넌트
│   │   ├── ui/          # shadcn/ui 베이스
│   │   └── shared/      # 앱 공통 (LoadingSpinner, ErrorBoundary)
│   │
│   ├── stores/          # Zustand 슬라이스 (CODING-CONVENTIONS.md §3)
│   │   ├── userStore.ts
│   │   ├── roomStore.ts
│   │   ├── stageStore.ts
│   │   ├── trackingStore.ts
│   │   ├── vgenStore.ts
│   │   └── configStore.ts   # Feature Flags (FeatureFlags.md)
│   │
│   ├── lib/             # 외부 SDK 래퍼
│   │   ├── supabase.ts
│   │   ├── livekit.ts
│   │   ├── fal.ts
│   │   ├── pixi/        # PixiJS Application + AvatarRenderer
│   │   └── mediapipe/   # FaceLandmarker + WASM 감지
│   │
│   ├── hooks/           # React hooks
│   ├── types/           # 공유 TypeScript 타입
│   └── utils/           # 순수 함수 (credit.ts, sanitize.ts)
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .env.example
├── index.html
├── vite.config.ts       # VITE-CONFIG.md 참조
├── tsconfig.json
└── package.json
```

### §12.1 Feature 폴더 내부 구조

```
features/vgen/
├── VgenPanel.tsx        # 메인 컴포넌트
├── VgenStatusBadge.tsx  # 하위 컴포넌트
├── vgenService.ts       # API 호출 (lib/fal.ts 래핑)
├── vgen.types.ts        # feature 전용 타입
└── index.ts             # barrel export (외부 노출만)
```

> 컴포넌트 1~2개면 `features/` 폴더 불필요 — `components/` 직접 배치.

### §12.2 Import 경로

`vite.config.ts`의 `resolve.alias`로 `@/` = `src/` 설정 (VITE-CONFIG.md 참조):

```typescript
import { useVgenStore } from '@/stores/vgenStore'
import { VgenPanel } from '@/features/vgen'
import type { VgenJob } from '@/types/vgen'
```

### §12.3 Barrel Export 정책

- `features/*/index.ts`: 외부에서 쓰는 것만 export
- `stores/index.ts`: **사용 금지** (circular import 위험) — 각 store 직접 import
- `components/ui/index.ts`: shadcn 컴포넌트 re-export 허용
- `Vtube/docs/ref/AUTORIG-THEATER-PLATFORM-001.md`
- `Vtube/docs/ref/AUTORIG-VOICE-ROOM-001.md`
- `Vtube/docs/ref/PRODUCTION-VISION.md`
- `Vtube/docs/ref/AUTORIG-PIPELINE-V1.md`
- `Vtube/docs/status/SCOUT.md`
