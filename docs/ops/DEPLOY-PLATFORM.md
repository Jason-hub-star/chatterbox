---
tags: [guide]
---

# Cloudflare Pages 배포 가이드 (플랫폼 SPA)

> G-130 산출 문서. Next.js 랜딩(Vercel)과 별개로, Vite SPA를 Cloudflare Pages에 배포하는 완전한 절차.

> **As-built (2026-07-03):** ChatterBox 앱 SPA 최초 배포 완료. 프로젝트 `chatterbox` → `https://chatterbox-7r8.pages.dev`(unlisted). 계정 gmdqn2tp(`CLOUDFLARE_ACCOUNT_ID=276b9380f073c8007ba2d3d41b2c6703` — Pages 설정파일은 `account_id` 키 미지원이라 env 로만). 최초 배포는 `wrangler pages project create chatterbox --production-branch=main` 선행 필요. 재배포·검증은 스킬 **`cf-pages-deploy-verify`**(함정 4개 + 번들 비밀키 감사 + 헤드리스 실렌더 게이트). 백엔드가 이미 프로덕션이라 SPA만 올리면 완전 동작(배포판 E2E 14/14 실증). 공개 런칭(Cloudflare Access 게이트 포함)은 별개 결정.

## 빌드 설정

### Cloudflare Pages 프로젝트 생성

1. Cloudflare 대시보드 > Pages > 프로젝트 생성
2. GitHub 연동 또는 직접 배포 선택
3. 빌드 설정:
   - **프레임워크**: 없음 (Vite 커스텀)
   - **빌드 커맨드**: `npm run build`
   - **빌드 출력 디렉토리**: `dist`
   - **Node.js 버전**: 18 이상

### package.json 빌드 스크립트 확인

```json
{
  "scripts": {
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

---

## 환경변수 설정

### wrangler.toml 방식 (권장)

```toml
[env.production]
name = "snack-web-prod"
account_id = "YOUR_ACCOUNT_ID"

[env.production.vars]
VITE_SUPABASE_URL = "https://xxx.supabase.co"
VITE_SUPABASE_ANON_KEY = "eyJhbGc..."
VITE_LIVEKIT_URL = "wss://xxx.livekit.cloud"
VITE_SENTRY_DSN = "https://xxx.ingest.sentry.io/..."
```

> **주의**: `VITE_` 접두사 변수는 빌드 타임에 번들에 포함됨 — 민감한 서버 전용 키는 절대 `VITE_` 접두사 사용 금지.
> **Release blocker**: `FAL_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_SECRET`, `R2_*`는 Cloudflare Pages vars에 두지 않는다. Supabase Edge Function/Worker secret으로만 설정한다. `VITE_FAL_KEY` 같은 변수명이 문서·코드·대시보드에 보이면 배포 중단.

### 서버 전용 Secret 설정

```bash
supabase secrets set FAL_KEY=YOUR_FAL_KEY --project-id YOUR_PROJECT_ID
supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_KEY --project-id YOUR_PROJECT_ID
supabase secrets set LIVEKIT_API_SECRET=YOUR_LIVEKIT_SECRET --project-id YOUR_PROJECT_ID
```

클라이언트는 `trigger-vgen` 같은 Edge Function만 호출한다. provider key를 브라우저로 전달하지 않는다.

### 대시보드 UI 방식

Cloudflare Pages > Settings > Environment Variables에서 추가 가능. `wrangler.toml`이 대시보드보다 우선.

---

## SPA 라우팅

Cloudflare Pages는 **기본적으로 SPA 모드 자동 지원** — `_redirects`/`_routes.json` 추가 불필요.

- 존재하지 않는 경로(/rooms/abc123) → `index.html` 자동 폴백
- React Router 클라이언트 사이드 라우팅 정상 작동

**예외**: Pages Functions(`functions/` 디렉토리)를 함께 사용할 때만 `_routes.json` 추가 필요. 현재 snack-web은 Edge Functions를 Supabase에서 관리하므로 해당 없음.

---

## Supabase Edge Functions 동시 배포

Edge Functions는 Cloudflare Pages와 **완전히 독립** 배포.

```bash
# 1. Edge Functions 먼저 배포 (API 가용 상태 선행)
supabase functions deploy livekit-token --project-id YOUR_PROJECT_ID
supabase functions deploy verify-invite-code --project-id YOUR_PROJECT_ID
# ... 나머지 함수들

# 2. Vite SPA 배포
npm run build
wrangler pages deploy dist/ --project-name snack-web-prod
```

**순서 원칙**: Edge Functions → SPA. API가 준비된 후 클라이언트 배포.

---

## CI/CD 자동화 (GitHub Actions)

`.github/workflows/deploy-platform.yml`:

```yaml
name: Deploy Platform to Cloudflare Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'

      - run: npm ci
      - run: npm run build

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: snack-web-prod
          directory: dist/
          productionBranch: main
```

---

## 수동 배포

```bash
# 로컬 빌드
npm run build
npm run preview  # 로컬 확인

# Cloudflare 배포
wrangler pages deploy dist/ \
  --project-name snack-web-prod \
  --branch main
```

---

## 배포 후 검증 체크리스트 — 향후 자동화 방향

> **현재 상태:** 수동 검증 (문서-only 설계 단계)  
> **향후 계획:** Phase 구현 시 GitHub Actions에서 아래 항목을 자동 실행하고, 실패 시 Slack 알림

| 항목 | 현재 (수동) | 향후 자동화 (Phase) | 자동화 난이도 |
|------|----------|---------|---------|
| SPA 라우팅 | curl + 수동 확인 | `curl -f` → 자동 검증 | 낮음 |
| 환경변수 | 브라우저 콘솔 확인 | `curl /api/env-check` → 자동 검증 | 낮음 |
| Asset 압축 | 수동 확인 | `brotli-size` 자동 비교 | 낮음 |
| Supabase 연결 | 수동 테스트 | 테스트 API 호출 → 자동 검증 | 중간 |
| LiveKit 연결 | 수동 테스트 | — (제외: 실 WebRTC) | — |
| Sentry 수집 | 수동 오류 발생 | Test event 자동 전송 → 수집 확인 | 중간 |

**수동 검증 체크리스트** (현재 배포 직후 수행):

- [ ] **SPA 라우팅 동작**: `curl https://snack-web-prod.pages.dev/rooms/test` → `200 OK` (404 아님)
- [ ] **환경변수 로드**: 브라우저 콘솔에서 `import.meta.env.VITE_SUPABASE_URL` 확인
- [ ] **Asset 압축**: `curl -I https://snack-web-prod.pages.dev/assets/index.js` → `Content-Encoding: br`
- [ ] **Supabase 연결**: Auth 로그인 플로우 동작 확인
- [ ] **LiveKit 연결**: 테스트 방 생성 후 WebRTC 연결 확인
- [ ] **Sentry 에러 수집**: 의도적 에러 발생 후 Sentry 대시보드 확인

---

## 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| `/rooms/abc` → 404 | SPA 폴백 미작동 | Pages 설정에서 `_routes.json` 제거 확인 |
| `VITE_SUPABASE_URL undefined` | 빌드 타임 환경변수 누락 | `.env.local` 또는 `wrangler.toml` 변수 추가 후 재빌드 |
| CORS 에러 | Supabase CORS 미설정 | Supabase 대시보드 > API > CORS origins 추가 |
| 느린 초기 로드 | 번들 크기 과다 | `npm run analyze` (rollup-plugin-visualizer) 실행 |

---

## 환경별 배포 분리 (G-80 연동)

| 환경 | Cloudflare Pages 프로젝트 | 브랜치 | Supabase 프로젝트 |
|------|--------------------------|--------|-----------------|
| dev | 로컬 `vite dev` | — | dev 프로젝트 |
| staging | `snack-web-staging` | `staging` | staging 프로젝트 |
| prod | `snack-web-prod` | `main` | prod 프로젝트 |

환경별 `.env` 파일은 `PLATFORM-ARCHITECTURE.md §Env` 참조.
