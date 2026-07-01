---
tags: [guide]
---

> G-128 산출 문서. 새 플랫폼 구현자가 30분 안에 올바른 저장소와 보안 경계를 잡도록 안내.

# ChatterBox / snack-web 개발 가이드

이 레포(`/Users/family/jason/snack-web`)는 현재 **Next.js 랜딩 + 플랫폼 설계 문서**가 함께 있다. 실제 플랫폼 구현 대상은 `VITE-CONFIG.md` 기준의 **ChatterBox Vite SPA**이며, 기본 경로는 `/Users/family/jason/ChatterBox`다.

| 대상 | 현재 위치 | 실행 명령 | 비고 |
|---|---|---|---|
| 랜딩/문서 | `/Users/family/jason/snack-web` | `npm run dev` | Next.js 14, 운영 랜딩 |
| 새 플랫폼 | `/Users/family/jason/ChatterBox` | `npm run dev` | Vite SPA, 구현 대상 |

구현 착수 전에는 `snack-web`에서 `npm run docs:check:strict`를 통과시킨 뒤, `ChatterBox`에서 코드를 작성한다.

---

## 필수 도구

| 도구 | 최소 버전 | 용도 |
|-----|---------|------|
| **Node.js** | 18.17.0 (권장 20+) | 런타임, npm 패키지 관리 |
| **npm** | 9.0+ | 패키지 매니저 |
| **Git** | 2.30+ | 저장소 관리 |
| **VSCode** (선택) | 최신 | IDE (추천) |

### 설치 확인

```bash
node --version       # v20.x 이상 확인
npm --version        # 9.x 이상 확인
git --version        # 2.30+ 확인
```

---

## 빠른 시작

### A. 현재 랜딩/문서 확인

```bash
cd /Users/family/jason/snack-web
npm install
npm run docs:check:strict
npm run dev
```

브라우저: [http://localhost:3000](http://localhost:3000)

### B. 새 플랫폼 스캐폴드

```bash
cd /Users/family/jason
npm create vite@latest ChatterBox -- --template react-ts
cd ChatterBox
```

이후 패키지·설정 파일은 [[VITE-CONFIG]]를 그대로 따른다.

---

## 환경 변수 설정

### 클라이언트 공개 변수 (`ChatterBox/.env.local`)

```bash
# Supabase (DB, Auth, RLS)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...

# LiveKit public URL only
VITE_LIVEKIT_URL=wss://your-livekit-instance.livekit.cloud

# Sentry public DSN (선택)
VITE_SENTRY_DSN=https://...

VITE_ENV=development
```

### 서버 비밀 변수 (브라우저에 노출 금지)

아래 값은 `VITE_` 접두사를 붙이지 않는다. Supabase Edge Function, Cloudflare Worker, 또는 서버 런타임의 secret store에만 저장한다.

| 변수 | 위치 | 이유 |
|---|---|---|
| `OPENAI_API_KEY` | Edge Function/Worker secret | 프롬프트 최적화·모더레이션 |
| `FAL_KEY` | Edge Function/Worker secret | VGEN 공급사 호출 |
| `LIVEKIT_API_KEY` | Edge Function secret | 토큰 발급 |
| `LIVEKIT_API_SECRET` | Edge Function secret | 토큰 서명 |

비밀키가 `VITE_`로 시작하면 번들에 포함될 수 있으므로 구현 금지다.

### 개발 서버 시작

```bash
npm run dev
```

---

## npm 스크립트 설명

| 스크립트 | 명령어 | 용도 |
|---------|------|------|
| `dev` | `npm run dev` | 로컬 개발 서버 (`snack-web`: Next.js, `ChatterBox`: Vite) |
| `build` | `npm run build` | 프로덕션 빌드 |
| `start` / `preview` | `npm run start` 또는 `npm run preview` | 빌드 미리보기 |
| `lint` | `npm run lint` | **코드 린트** (ESLint, TypeScript 타입 체크) |
| `docs:check` | `npm run docs:check` | **문서 일관성 검사** (계약서·상태머신·DATA-SCHEMA 참조 확인) |
| `docs:check:strict` | `npm run docs:check:strict` | **엄격한 검사** (경고도 에러로 처리) |
| `docs:health` | `npm run docs:health` | **문서 건강도 대시보드** (갭 수·상태별 분포) |

### 개발 중 자주 쓰는 명령어

```bash
# 1. 개발 서버 시작
npm run dev

# 2. (별도 터미널) 린트·타입 체크
npm run lint

# 3. (필요 시) 문서 검사
npm run docs:check

# 4. 배포 전 빌드 테스트
npm run build
npm run start
```

---

## 환경 변수 상세

### 클라이언트 필수 (프로덕션 배포 전 반드시 설정)

| 환경변수 | 형식 | 출처 | 비고 |
|---------|------|------|------|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | Supabase 대시보드 / Settings / API | URL scheme https:// 확인 |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGc...` (JWT) | Supabase 대시보드 / Settings / API | Public anon_key (리스크 낮음, 공개 OK) |
| `VITE_LIVEKIT_URL` | `wss://xxx.livekit.cloud` | LiveKit 대시보드 | WebSocket URL (wss:// 스킴) |

### 선택 (기본값 있음)

| 환경변수 | 기본값 | 용도 |
|---------|------|------|
| `VITE_ENV` | `development` | dev/staging/production 모드 분기 |
| `VITE_SENTRY_DSN` | (없음) | 에러 로깅 (프로덕션만 필요) |
| `VITE_LOG_LEVEL` | `info` | 콘솔 로그 레벨 (dev/staging: debug, prod: warn) |

---

## 개발 중 체크리스트

### 프로젝트 첫 진입 (이번만)

- [ ] Node 버전 확인 (18.17.0+)
- [ ] `npm install` 완료 (node_modules/ 생성됨)
- [ ] `.env.local` 파일 생성 (7개 필수 변수 입력)
- [ ] `npm run dev` 실행 → localhost:3000 로드 확인
- [ ] 콘솔 에러 없음 확인 (경고는 무시 가능)

### 매일 개발 시작

```bash
# 최신 코드 동기화
git pull

# 의존성 변경 확인
npm install

# 개발 서버 시작
npm run dev
```

### 커밋 전 (매 PR마다)

```bash
# 린트·타입 에러 확인
npm run lint

# 문서 일관성 검사
npm run docs:check

# 프로덕션 빌드 테스트 (필요시)
npm run build
```

---

## 로컬 서버 문제 해결

### 포트 3000 이미 사용 중

```bash
# macOS/Linux: 프로세스 확인
lsof -i :3000

# Windows: netstat로 확인
netstat -ano | findstr :3000

# 프로세스 강제 종료
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

### 환경 변수 로드 실패

```bash
# 1. .env.local 파일 위치 확인
ls -la | grep env

# 2. 변수명 확인 (VITE_ 접두사 필수)
cat .env.local

# 3. npm 프로세스 재시작
npm run dev  # Ctrl+C 후 다시 실행
```

### 의존성 설치 실패

```bash
# 캐시 초기화 후 재설치
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### "localhost:3000 연결 거부"

```bash
# 개발 서버 프로세스 확인
ps aux | grep "vite"

# 방화벽 확인 (macOS)
lsof -i :3000

# 포트 변경 시작
npm run dev -- --port 3001
```

---

## IDE 설정 (VSCode 추천)

### 추천 확장

1. **ES7+ React/Redux/React-Native snippets** (`dsznajder.es7-react-js-snippets`)
   - React 컴포넌트 스니펫

2. **TypeScript Vue Plugin** (`Vue.volar`)
   - TypeScript 타입 체크 강화

3. **ESLint** (`dbaeumer.vscode-eslint`)
   - 린트 문제 실시간 표시

4. **Prettier** (`esbenp.prettier-vscode`)
   - 코드 자동 포맷팅

5. **Error Lens** (`usernamehw.errorlens`)
   - 에러/경고 인라인 표시

### VSCode settings.json 추천 설정

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ]
}
```

---

## Supabase 로컬 개발 (향후)

현재 프로젝트는 Supabase Cloud 인스턴스 사용. 로컬 개발이 필요한 경우:

```bash
# Supabase CLI 설치 (향후)
brew install supabase/tap/supabase

# 로컬 Supabase 시작
supabase start

# 로컬 DB 접근
supabase db push

# 마이그레이션 생성
supabase migration new <name>
```

자세한 내용은 [[MigrationStrategy]] 참조.

---

## 다음 단계

로컬 서버가 성공적으로 실행되면:

1. **문서 읽기:** [[INDEX]] → 프로젝트 구조 이해
2. **아키텍처 확인:** [[PLATFORM-ARCHITECTURE]] → 기술 스택·의존성
3. **기능 명세:** [[FEATURE-SPEC]] → 구현할 기능 목록
4. **컴포넌트 계약:** `docs/contracts/` → 각 컴포넌트 Props·상태 명세
5. **시작 작업:** [[IMPLEMENTATION-ORDER]] → 코딩 순서 추천

---

## 문의

- **기술 관련:** 프로젝트 Issues 또는 tech@family.dev
- **문서 오류:** PRs welcome
- **환경 변수:** `.env.local` 생성 경로 확인 (프로젝트 루트)

---

## 한줄정리

`snack-web`은 랜딩+문서 SSOT이고, 실제 플랫폼 구현은 `/Users/family/jason/ChatterBox` Vite SPA에서 시작한다. 클라이언트에는 공개 env만 두고 OpenAI/FAL/LiveKit secret은 Edge Function/Worker secret으로만 넣는다.
