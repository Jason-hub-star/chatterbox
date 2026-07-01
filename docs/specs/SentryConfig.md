---
tags: [spec]
---

> G-126 산출 문서. Sentry 환경별 설정·소스맵·PII 필터링.

# SentryConfig — Sentry 에러 추적 및 성능 모니터링 설정

Updated: 2026-06-30

---

## 1. 설치 및 패키지

```bash
npm install @sentry/react @sentry/vite-plugin
```

| 패키지 | 버전 | 용도 |
|---|---|---|
| `@sentry/react` | ^8.0.0 | React 에러 바운더리 + 성능 통합 |
| `@sentry/vite-plugin` | ^2.0.0 | 소스맵 업로드 자동화 |

---

## 2. 환경별 설정 전략

**단일 DSN + `environment` 태그로 dev/staging/prod 구분** (DSN 3개 분리 불필요)

| 환경 | DSN | tracesSampleRate | replaysSessionSampleRate | replaysOnErrorSampleRate | 비용 |
|---|---|---|---|---|---|
| **dev** | 동일 | 0.1 (10%) | 0.1 | 1.0 | ~$0/월 |
| **staging** | 동일 | 0.5 (50%) | 0.1 | 1.0 | ~$10/월 |
| **prod** | 동일 | 0.01 (1%) | 0.02 | 0.1 | ~$30/월 |

**무료 플랜 한도:**
- 5,000 에러 이벤트/월
- 50 Replay 세션/월
- 보존기간 90일

MVP 기준 충분 (DAU <1,000).

---

## 3. sentry.config.ts (초기화)

```typescript
// src/lib/sentry.config.ts
import * as Sentry from '@sentry/react';
import { CaptureConsole, Replay } from '@sentry/integrations';

const isDev = import.meta.env.MODE === 'development';
const isStaging = import.meta.env.MODE === 'staging';
const isProd = import.meta.env.MODE === 'production';

Sentry.init({
  // ===== 기본 설정 =====
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: __APP_VERSION__, // vite.config.ts에서 define
  
  // ===== 샘플링 정책 =====
  tracesSampleRate: isDev ? 0.1 : isStaging ? 0.5 : 0.01,
  replaysSessionSampleRate: isDev ? 0.1 : 0.02,
  replaysOnErrorSampleRate: isDev ? 1.0 : 0.1,
  
  // ===== 성능 추적 =====
  integrations: [
    new Sentry.Replay({
      maskAllText: true,    // 채팅 내용 마스킹
      blockAllMedia: true,  // 아바타 이미지 제거
    }),
    new CaptureConsole({
      levels: ['error', 'warn'], // console.error/warn만 캡처
    }),
    new Sentry.BrowserTracing({
      // React Router 통합
      routingInstrumentation: Sentry.reactRouterV6Instrumentation(
        window.history
      ),
    }),
  ],
  
  // ===== PII 필터링 (중요) =====
  beforeSend(event, hint) {
    // 1. 이메일 마스킹
    if (event.user?.email) {
      event.user.email = '[filtered]';
    }
    
    // 2. 채팅 내용 제거 (Breadcrumb)
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.filter(
        (b) => !['chat', 'message', 'dataChannel'].includes(b.category)
      );
    }
    
    // 3. Authorization 헤더 제거
    if (event.request?.headers?.['Authorization']) {
      event.request.headers['Authorization'] = '[filtered]';
    }
    
    // 4. room_id, user_id 제거
    const filterKeys = ['room_id', 'user_id', 'session_id'];
    filterKeys.forEach((key) => {
      if (event.contexts && event.contexts[key]) {
        event.contexts[key] = '[filtered]';
      }
      if (event.tags && event.tags[key]) {
        event.tags[key] = '[filtered]';
      }
    });
    
    // 5. LiveKit DataChannel 페이로드 제거
    if (event.message?.includes('dataChannel') || event.message?.includes('blendshape')) {
      return null; // 무시
    }
    
    return event;
  },
  
  // ===== 에러 필터링 =====
  ignoreErrors: [
    // 무시할 에러 패턴 (외부 라이브러리)
    /NetworkError/,
    /QuotaExceededError/,
    /NotAllowedError/, // 웹캠 거부
    /AbortError/, // 사용자 중단
    'Non-Error promise rejection captured', // 일반 거부
  ],
  
  // ===== 소스맵 설정 =====
  // vite.config.ts에서 `build.sourcemap: 'hidden'` 필수
  // 소스맵은 Sentry Vite 플러그인으로 업로드 (브라우저 노출 안 함)
  
  // ===== Vite/앱 정보 =====
  denyUrls: [
    // 내부 에러만 추적 (외부 스크립트 제외)
    /extensions\//,
    /google-analytics/,
  ],
});

export { Sentry };
```

---

## 4. vite.config.ts (플러그인 + 소스맵)

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as Sentry from '@sentry/vite-plugin';

const __APP_VERSION__ = '1.0.0'; // package.json에서 읽을 수도 있음

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(__APP_VERSION__),
  },
  
  plugins: [
    react(),
    
    // Sentry 플러그인 (선택적, staging/prod에서만 활성화)
    process.env.NODE_ENV !== 'development' && new Sentry.sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: __APP_VERSION__,
      
      // 업로드 설정
      upload: {
        include: './dist',
        ignore: ['node_modules', '.git'],
        urlPrefix: '~/assets/', // 배포 시 CDN 경로
      },
      
      // 소스맵 업로드
      setCommits: {
        auto: true, // GitHub Actions에서 자동 커밋 감지
      },
    }),
  ],
  
  build: {
    // 소스맵 생성 (배포만)
    sourcemap: process.env.NODE_ENV === 'development' ? false : 'hidden',
    // 'hidden': 브라우저에 노출 안 함, Sentry만 사용
    
    rollupOptions: {
      output: {
        manualChunks: {
          // 청크 분리...
        },
      },
    },
  },
});
```

---

## 5. 환경 변수 (.env 파일)

```bash
# .env.development
VITE_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0

# .env.staging (같은 DSN)
VITE_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0

# .env.production (같은 DSN)
VITE_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0

# Sentry 플러그인용 (CI/CD만 필요)
SENTRY_AUTH_TOKEN=sntrys_xxxxxxxxxxxx
SENTRY_ORG=my-org
SENTRY_PROJECT=chatterbox-spa
```

**Cloudflare Pages CI 설정:**

```toml
# wrangler.toml (또는 Pages 프로젝트 대시보드)
[env.production]
build = { command = "npm run build", cwd = "." }

[env.production.env_vars]
# Sentry 플러그인이 자동으로 사용
SENTRY_AUTH_TOKEN = "sntrys_xxxxxxxxxxxx"
SENTRY_ORG = "my-org"
SENTRY_PROJECT = "chatterbox-spa"
```

---

## 6. App.tsx (에러 바운더리 통합)

```typescript
// src/app/App.tsx
import { ErrorBoundary } from '@sentry/react';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

function App() {
  return (
    <ErrorBoundary
      fallback={
        <div className="error-screen">
          <h1>예상치 못한 오류가 발생했습니다</h1>
          <p>기술 지원팀에 자동 신고되었습니다.</p>
          <button onClick={() => location.reload()}>새로고침</button>
        </div>
      }
      showDialog
    >
      <QueryClientProvider client={queryClient}>
        <Router>
          {/* 라우트 */}
        </Router>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
```

---

## 7. PII 필터링 규칙 (SecurityPolicies.md §17 연동)

### 7.1 MUST NOT: Sentry에 포함되면 안 되는 정보

| 타입 | 예시 | beforeSend에서 제거 |
|---|---|---|
| **이메일** | `user.email = 'alice@example.com'` | ✅ `[filtered]` |
| **user_id** | `tags.user_id = 'uuid-xxx'` | ✅ `[filtered]` |
| **room_id** | `contexts.room_id` | ✅ `[filtered]` |
| **채팅 내용** | Breadcrumb의 message 필드 | ✅ 필터링 |
| **blendshape** | 트래킹 데이터 | ✅ 필터링 |
| **Authorization** | `request.headers.Authorization` | ✅ `[filtered]` |

### 7.2 콘솔 로깅 규칙

```typescript
// MUST NOT
console.log('User email:', user.email); // PII 로깅 금지
console.log('LiveKit token:', room.token); // 민감한 토큰 금지

// OK
console.log('User logged in'); // 일반 로그
console.error('Connection failed'); // 에러만 (Sentry 캡처)
```

---

## 8. 성능 추적 (선택적, P1)

### 8.1 React Router 통합 (자동)

```typescript
// vite.config.ts에서 이미 설정됨
new Sentry.BrowserTracing({
  routingInstrumentation: Sentry.reactRouterV6Instrumentation(window.history),
})
```

라우트 전환 시 자동으로 성능 추적:
- 페이지 로드 시간
- 첫 그림(FCP) / 최대 콘텐츠풀(LCP)
- 누적 레이아웃 변화(CLS)

### 8.2 수동 추적 (커스텀)

```typescript
// src/hooks/useRoom.ts
const transaction = Sentry.startTransaction({
  name: 'room-join',
  op: 'navigation',
});

try {
  const room = await livekit.connect();
  transaction.setStatus('ok');
} catch (error) {
  transaction.setStatus('error');
  Sentry.captureException(error, { contexts: { transaction } });
} finally {
  transaction.finish();
}
```

---

## 9. Replay (세션 기록)

### 9.1 설정 (이미 위에서 정의)

```typescript
new Sentry.Replay({
  maskAllText: true,    // 채팅 마스킹
  blockAllMedia: true,  // 아바타 이미지 제거
})
```

**기록 대상:**
- 사용자 상호작용 (클릭, 입력)
- 콘솔 로그 + 에러
- 네트워크 요청 (헤더 제외)

**제외:**
- 라이브 스트림 (WebRTC 비디오)
- 민감한 입력 필드 (암호, 토큰)

### 9.2 샘플링 조정 (환경별)

```typescript
{
  dev: {
    replaysSessionSampleRate: 0.1,  // 10% 세션 기록 (비용 절감)
    replaysOnErrorSampleRate: 1.0,  // 에러 시 100% 기록
  },
  prod: {
    replaysSessionSampleRate: 0.02, // 2% (무료 한도 내)
    replaysOnErrorSampleRate: 0.1,  // 에러 시 10%
  },
}
```

---

## 10. 무료 vs 유료 판단

| 메트릭 | 무료 한도 | 우리 예상 | 판정 |
|---|---|---|---|
| **Error Events** | 5,000/월 | 500 (DAU 500) | ✅ 넉넉함 |
| **Replay Sessions** | 50/월 | 10 (1% 샘플) | ✅ 충분 |
| **보존기간** | 90일 | 90일 | ✅ 적절 |
| **Pro 필요 조건** | >50K errors/월 | DAU 100K+ | ❌ P2 이후 |

**결론:** MVP ~ P1 단계에서 무료 플랜으로 충분. DAU 100,000+ 달성 시 Pro ($100+/월) 검토.

---

## 11. 배포 체크리스트

### 11.1 Cloudflare Pages 배포 (CI/CD)

```yaml
# .github/workflows/deploy.yml (GitHub Actions)
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main, develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build with Sentry
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
          VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}
          NODE_ENV: production
        run: npm run build
        # vite 빌드 → Sentry 플러그인이 소스맵 자동 업로드
      
      - name: Deploy to Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: chatterbox-spa
          directory: dist
```

### 11.2 소스맵 업로드 실패 자동 감지

배포 스크립트에서 **소스맵 업로드 성공 여부를 검증**하고, 실패 시 배포 중단:

```bash
# deploy.sh 또는 GitHub Actions 스크립트
#!/bin/bash
set -e

# 빌드
npm run build
echo "Build completed"

# Sentry 플러그인이 vite build 중 자동으로 업로드하지만,
# 명시적으로 확인하려면 아래 실행

# 방법 1: 소스맵 파일 존재 확인
if [ ! -f "dist/index.*.js.map" ]; then
  echo "❌ Source map 생성 실패"
  exit 1
fi

# 방법 2: Sentry CLI로 소스맵 목록 확인 (릴리스 생성 후)
RELEASE="1.0.0"  # package.json에서 읽을 수 있음

SENTRY_CLI_STATUS=$(sentry-cli releases files $RELEASE list 2>&1 || echo "FAILED")
if [[ $SENTRY_CLI_STATUS == *"FAILED"* ]] || [ -z "$SENTRY_CLI_STATUS" ]; then
  echo "❌ Sentry source map 업로드 실패 또는 릴리스 미생성"
  echo "상세: $SENTRY_CLI_STATUS"
  exit 1
fi

echo "✅ Source maps uploaded to Sentry successfully"
# 이후 Cloudflare Pages 배포 진행
```

**GitHub Actions에 통합:**

```yaml
- name: Build and verify source maps
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
    SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
  run: |
    npm run build
    
    # Sentry 릴리스 생성 및 소스맵 확인
    sentry-cli releases create ${{ github.sha }}
    sentry-cli releases files ${{ github.sha }} list
    
    if [ $? -ne 0 ]; then
      echo "❌ Source map verification failed"
      exit 1
    fi
    
    echo "✅ Source maps verified"
    sentry-cli releases finalize ${{ github.sha }}

- name: Deploy to Cloudflare Pages
  if: success()  # 소스맵 검증 성공 시에만
  uses: cloudflare/pages-action@v1
  with:
    # ... 배포 설정
```

### 11.3 로컬 검증

```bash
# 1. 빌드 (소스맵 생성)
npm run build
# dist/index.*.js + dist/index.*.js.map 확인

# 2. 소스맵 업로드 테스트
SENTRY_AUTH_TOKEN=... npm run sentry:sourcemaps-upload
# 또는 위 CI에서 자동

# 3. Sentry 대시보드 확인
# Releases > 1.0.0 > Source Maps 섹션
```

### 11.3 환경 변수 설정 (Pages 프로젝트)

```
Pages 프로젝트 > Settings > Environment variables

[Production]
VITE_SENTRY_DSN=https://...
SENTRY_AUTH_TOKEN=sntrys_... (빌드 시에만)
SENTRY_ORG=...
SENTRY_PROJECT=...

[Preview]
VITE_SENTRY_DSN=https://... (same)
```

---

## 12. MUST NOT 체크리스트

- **❌** PII를 Sentry 이벤트에 포함하지 않기
  - beforeSend에서 `user.email`, `room_id`, 채팅 내용 필터링 확인
  
- **❌** 배포 후 소스맵 변경 금지
  - 한 번 배포한 release는 소스맵 고정
  
- **❌** 개발 환경에서 프로덕션 DSN 사용하지 않기
  - 환경별 샘플링으로 자동 분리
  
- **❌** LiveKit 토큰/API 키를 콘솔 로그하지 않기
  - `ignoreErrors`에 해당 패턴 추가
  
- **❌** 소스맵 없이 프로덕션 배포 금지
  - `build.sourcemap: 'hidden'` 강제

---

## 13. 참고: SecurityPolicies.md §17 (PII 필터링)

본 문서의 PII 필터링 규칙은 SecurityPolicies.md §17에서 정의한 audit_logs·console 규칙과 일관성 유지.

추가 필터링이 필요하면 SecurityPolicies.md를 먼저 업데이트한 후 Sentry 규칙에도 반영.
