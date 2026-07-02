---
tags: [guide]
---

# Vite 5 + Tailwind 4 설정 가이드

> G-140 산출 문서. `ChatterBox` (Vite SPA) 의 전체 빌드 설정.

## 패키지 설치

```bash
cd /Users/family/jason
npm create vite@latest ChatterBox -- --template react-ts
cd ChatterBox

# 핵심 의존성
npm install react-router zustand @tanstack/react-query   # react-router = v8 단일 패키지 (구 react-router-dom 통합, react ≥19.2.7 필수 — PLATFORM-ARCHITECTURE §2.1)
npm install @supabase/supabase-js livekit-client @livekit/components-react
npm install pixi.js @mediapipe/tasks-vision
npm install motion @radix-ui/react-dialog @radix-ui/react-slot
npm install class-variance-authority clsx tailwind-merge

# Tailwind 4 (Vite 플러그인 방식)
npm install -D @tailwindcss/vite

# 빌드 도구
npm install -D rollup-plugin-visualizer @types/node
```

> **Tailwind 4부터 `@tailwindcss/vite` 플러그인이 표준.** PostCSS 설정 불필요.

---

## vite.config.ts (전체)

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // npm run build:analyze 시 번들 시각화 자동 오픈
    mode === 'analyze' && visualizer({ open: true, gzipSize: true, brotliSize: true }),
  ].filter(Boolean),

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    target: 'es2020',
    sourcemap: mode === 'development',
    // ⚠️ Vite 8: manualChunks 객체 형태는 타입에서 제거됨 — 함수형 (id)=>string 으로 작성해야 build 통과.
    //    아래 객체 예시는 개념 설명용. 실제 코드는 함수형으로 변환하거나, vendor가 적으면 생략(vite 자동 청킹).
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom'],
          'vendor-router':   ['react-router'],
          'vendor-state':    ['zustand', '@tanstack/react-query'],
          'vendor-livekit':  ['livekit-client', '@livekit/components-react'],
          'vendor-pixi':     ['pixi.js'],
          'vendor-mediapipe': ['@mediapipe/tasks-vision'],
        },
      },
    },
  },

  server: {
    port: 5173,
    // Supabase Realtime은 WebSocket — 프록시 불필요 (직접 연결)
  },

  // Vitest 설정 (별도 vitest.config.ts 대신 통합)
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup/canvas-mock.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      thresholds: { lines: 70 },
    },
  },
}))
```

---

## Tailwind 4 CSS 설정

Tailwind 4는 JS config 파일 없음. 모든 설정이 CSS 변수로.

```css
/* src/index.css */
@import "tailwindcss";

/* 디자인 토큰 — DESIGN-TOKENS.md §8 참조 (2026-07-01 무채색 개정) */
@theme {
  /* 색상 */
  --color-stage-base:     #0b0b0d;   /* 배경 (무채색 니어블랙) */
  --color-stage-panel:    #18181c;   /* 카드·사이드바 배경 */
  --color-stage-elevated: #222227;   /* 모달·호버 */
  --color-stage-border:   #2e2e35;   /* 경계선 */
  --color-stage-text:     #f5f5f2;   /* 텍스트 */
  --color-stage-text-muted: #9c9ca3; /* 보조 텍스트 */
  --color-fire-amber:     #ff8c2a;   /* 액센트 전용 — 배경 워시 금지 */
  --color-fire-hot:       #ff4500;   /* 녹음/라이브 상태 */
  --color-spring-green:   #56f09f;   /* 트래킹/성공 상태 */

  /* 폰트 */
  --font-sans: 'Noto Sans KR', 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* 레이아웃 토큰 */
  --spacing-panel-sm: 13%;
  --spacing-panel-lg: 22%;
}
```

> **컴포넌트에서 사용**: `className="bg-stage-base text-stage-text"`, 액센트는 `text-fire-amber`/`bg-fire-amber` — Tailwind 4가 CSS 변수에서 자동 추출.

---

## package.json 스크립트

```json
{
  "scripts": {
    "dev":         "vite",
    "build":       "tsc --noEmit && vite build",
    "build:analyze": "cross-env MODE=analyze vite build",
    "preview":     "vite preview",
    "type-check":  "tsc --noEmit",
    "lint":        "eslint src --ext ts,tsx",
    "test":        "vitest run",
    "test:watch":  "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e":    "playwright test"
  }
}
```

---

## tsconfig.json

> **실측 반영(2026-07-02 · Vite 8 / TS 6):** composite + `references` + `tsconfig.node.json` 방식은 `TS6310`(referenced project may not disable emit)로 막힘. **단일 tsconfig + `tsc --noEmit`** 로 단순화했다(`vite.config.ts`를 include, `tsconfig.node.json` 불필요).

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["node", "vite/client"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

---

## index.html

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ChatterBox</title>
  </head>
  <body>
    <div id="root"></div>
    <noscript>
      <div style="text-align:center;padding:2rem;background:#0d1117;color:#f5f0e8;font-family:sans-serif">
        <h1>ChatterBox</h1>
        <p>이 서비스는 JavaScript가 필요합니다.</p>
      </div>
    </noscript>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## src/main.tsx

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

---

## .env.example

```bash
# Supabase
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyXxx...

# LiveKit
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud

# fal.ai (클라이언트 노출 금지 — Edge Function 경유)
# FAL_KEY=fal_xxx (Supabase Edge Function 환경변수로만)

# Sentry
VITE_SENTRY_DSN=https://xxx@oXXX.ingest.sentry.io/XXX

# 환경
VITE_ENV=development
```

---

## 번들 크기 목표 및 PR 검증

| 청크 | gzip 목표 |
|------|----------|
| `index` (앱 코드) | < 80 KB |
| `vendor-react` | < 50 KB |
| `vendor-livekit` | < 120 KB |
| `vendor-pixi` | < 400 KB |
| `vendor-mediapipe` | lazy-load (초기 0 KB) |

### 로컬에서 번들 크기 확인

```bash
# 번들 크기 시각화 (브라우저에서 stats.html 자동 오픈)
npm run build:analyze
```

### PR 검증 프로세스

**현재 상태: 수동 PR 검증 (문서-only 설계 단계)**

PR에서 의존성 추가/변경 시 리뷰어는:

1. **PR 코멘트로 번들 크기 변화 명시 요청:**
   ```
   💾 Bundle size impact:
   - Before: index.js 75 KB
   - After: index.js 82 KB
   - Change: +7 KB (8.6%)
   ```

2. **로컬 확인 명령어:**
   ```bash
   git checkout pr-branch
   npm install
   npm run build:analyze
   
   # stats.html에서 증가분 확인
   # 특히 vendor-* 청크와 index 청크 확인
   ```

3. **승인 기준:**
   - 각 청크가 위 목표 이내 → ✅ 승인
   - 초과하되 정당한 이유(예: LiveKit 대역폭 미미)가 있으면 → 📝 토론
   - 목표 초과 시 최적화 필요 → ❌ 변경 요청

**향후 자동화 (Phase 구현 시):**
```yaml
# .github/workflows/bundle-size.yml
# PR에 자동으로 번들 크기 리포트 코멘트 추가
# 임계값 초과 시 자동 Warning 라벨 추가
```

### 번들 최적화 체크리스트

큰 의존성 추가 전 확인:

- [ ] 라이브러리가 tree-shake 가능한가?
- [ ] 해당 기능이 이미 표준 라이브러리에 있는가?
- [ ] Lazy load (React.lazy)로 연기할 수 있는가?
- [ ] 경량 대체 라이브러리가 있는가? (예: `preact` vs `react`)

### 번들 비용 분석 예시

```
vendor-mediapipe (500 KB 원본)
  └─ React.lazy로 /models 페이지에서만 로드
  └─ 초기 페이지 로드: 0 KB 추가
  └─ 방 진입 후 명시적 로드 시 500 KB 네트워크 비용

최적화 결과: 초기 로드 시간 -3초, 사용성 +1.5점
```

---

## MUST NOT

- `@tailwindcss/postcss` 설치 금지 — v4는 Vite 플러그인 방식 사용
- `tailwind.config.js` 생성 금지 — CSS 변수로 대체
- `VITE_FAL_KEY` 환경변수 노출 금지 — fal.ai 키는 서버사이드 전용
