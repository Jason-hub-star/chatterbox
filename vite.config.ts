import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// Phase 0: react/router/state/supabase만 설치됨.
// livekit·pixi·mediapipe vendor chunk는 해당 기능 착수 시 설치 후 추가 (전체 스펙: docs/VITE-CONFIG.md).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },

  build: {
    target: 'es2020',
    sourcemap: mode === 'development',
    // Vite 8: manualChunks 는 함수형만 허용(객체 형태 타입 제거). vendor 청킹은
    // 의존성이 늘면 함수형으로 추가한다 (VITE-CONFIG.md §vendor 청킹 참조).
  },

  server: { port: 5173 },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup/canvas-mock.ts'],
    // public/aria-player 는 Vtube 런타임 정적 빌드 — 내부 벤더 테스트(.mjs)를 주워 실행하지 않게 제외.
    exclude: [...configDefaults.exclude, 'public/**'],
  },
}))
