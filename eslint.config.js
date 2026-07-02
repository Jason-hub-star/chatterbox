import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// ESLint 9 flat config — DoD 기본 항목 #2 (npm run lint 에러 0).
export default tseslint.config(
  // docs/ 는 문서·참고용 예제 코드(marketing-automation 등) — 앱 빌드 대상이 아니므로 lint 제외.
  { ignores: ['dist', 'coverage', 'node_modules', 'docs'] },
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
    // 테스트·설정 파일은 Node 전역 허용.
    files: ['tests/**/*.{ts,tsx}', '*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.node } },
  },
)
