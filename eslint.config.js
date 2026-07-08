import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// ESLint 9 flat config — DoD 기본 항목 #2 (npm run lint 에러 0).
export default tseslint.config(
  // docs/ 는 문서·참고용 예제 코드(marketing-automation 등) — 앱 빌드 대상이 아니므로 lint 제외.
  // supabase/functions 는 Deno 런타임(npm:/jsr: import, Deno 전역) — 프론트 lint/tsc 대상 아님.
  // public/aria-player 는 Vtube AUTORIG 런타임 정적 빌드(벤더링) — 프론트 lint/tsc 대상 아님.
  { ignores: ['dist', 'coverage', 'node_modules', 'docs', 'supabase/functions', 'public/aria-player'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // 다국어 강제(DoD 게이트): 제품 UI 의 JSX 에 하드코딩 한글 금지 — 문자열은 t() 키로.
    // i18nCoverage 테스트(en/ja 완역 유지)와 한 쌍: 이 룰이 "키 추출"을, 테스트가 "번역 채움"을 강제한다.
    // PoC/데브 페이지(아리아 경로 B 게이트)는 제품 화면이 아니라 제외.
    files: ['src/pages/**/*.tsx', 'src/components/**/*.tsx', 'src/features/**/*.tsx'],
    ignores: ['src/pages/AriaSelfPage.tsx', 'src/pages/AriaPocPage.tsx', 'src/pages/AvatarInspectorPage.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'JSXText[value=/[\\uAC00-\\uD7AF]/]', message: '하드코딩 한글 JSX 텍스트 — t() 키로 추출하고 ko/en/ja 를 채우세요(DoD 다국어 게이트).' },
        { selector: 'JSXAttribute Literal[value=/[\\uAC00-\\uD7AF]/]', message: '하드코딩 한글 JSX 속성 — t() 키로 추출하고 ko/en/ja 를 채우세요(DoD 다국어 게이트).' },
      ],
    },
  },
  {
    // 테스트·설정 파일은 Node 전역 허용.
    files: ['tests/**/*.{ts,tsx}', '*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.node } },
  },
)
