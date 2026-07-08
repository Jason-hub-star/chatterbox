import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'

// 간편로그인 버튼 묶음 — 소셜 우선 패턴(카카오 주버튼 → Google), 로그인·가입 공용(OAuth는 두 흐름이 동일).
// Supabase 대시보드 프로바이더 설정 후 VITE_OAUTH_PROVIDERS="kakao,google" 로 노출. 미설정 시 null.
// ⚠️ 카카오 앱에서 이메일 scope 필수동의로 받을 것 — 아니면 이메일 가입 계정과 자동 연결이 안 돼 계정 분열.
const PROVIDERS = (import.meta.env.VITE_OAUTH_PROVIDERS ?? '')
  .split(',')
  .map((p: string) => p.trim())
  .filter((p: string): p is 'google' | 'kakao' => p === 'google' || p === 'kakao')

export default function OAuthButtons() {
  const { t } = useTranslation()
  const loginWithOAuth = useUserStore((s) => s.loginWithOAuth)
  if (PROVIDERS.length === 0) return null

  return (
    <div className="space-y-3">
      {PROVIDERS.includes('kakao') && (
        <button
          type="button"
          onClick={() => void loginWithOAuth('kakao')}
          className="w-full rounded-lg bg-[#FEE500] py-2.5 text-sm font-semibold text-[#191919] transition hover:brightness-95"
        >
          {t('login.withKakao')}
        </button>
      )}
      {PROVIDERS.includes('google') && (
        <button
          type="button"
          onClick={() => void loginWithOAuth('google')}
          className="w-full rounded-lg border border-stage-border bg-white py-2.5 text-sm font-medium text-[#1f1f1f] transition hover:brightness-95"
        >
          {t('login.withGoogle')}
        </button>
      )}
      <div className="flex items-center gap-3 text-xs text-stage-text-muted">
        <span className="h-px flex-1 bg-stage-border" />
        {t('login.or')}
        <span className="h-px flex-1 bg-stage-border" />
      </div>
    </div>
  )
}
