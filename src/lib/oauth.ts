// 간편인증(OAuth) 활성 프로바이더 목록 — 컴포넌트/페이지가 "OAuth 노출 여부"로 이메일 강등을 판단할 때 공유.
// VITE_OAUTH_PROVIDERS="kakao,google" 설정 시 노출. Supabase 대시보드 프로바이더 등록 선행(카카오=비즈앱 검수).
export const OAUTH_PROVIDERS = (import.meta.env.VITE_OAUTH_PROVIDERS ?? '')
  .split(',')
  .map((p: string) => p.trim())
  .filter((p: string): p is 'google' | 'kakao' => p === 'google' || p === 'kakao')
