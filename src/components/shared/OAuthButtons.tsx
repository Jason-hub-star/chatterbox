import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { OAUTH_PROVIDERS } from '@/lib/oauth'
import kakaoIcon from '@/assets/oauth/kakao.svg'
import googleIcon from '@/assets/oauth/google.svg'

// 간편로그인 버튼 묶음 — 소셜 우선 패턴(카카오 주버튼 → Google), 로그인·가입 공용(OAuth는 두 흐름이 동일).
// Supabase 대시보드 프로바이더 설정 후 VITE_OAUTH_PROVIDERS="kakao,google" 로 노출. 미설정 시 null.
// ⚠️ 카카오 앱에서 이메일 scope 필수동의로 받을 것 — 아니면 이메일 가입 계정과 자동 연결이 안 돼 계정 분열.
// 활성 프로바이더 목록(OAUTH_PROVIDERS)은 @/lib/oauth 에서 공유.

export default function OAuthButtons() {
  const { t } = useTranslation()
  const loginWithOAuth = useUserStore((s) => s.loginWithOAuth)
  if (OAUTH_PROVIDERS.length === 0) return null

  return (
    <div className="space-y-3">
      {OAUTH_PROVIDERS.includes('kakao') && (
        <button
          type="button"
          onClick={() => void loginWithOAuth('kakao')}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FEE500] py-2.5 text-sm font-semibold text-[#191919] transition hover:brightness-95"
        >
          <img src={kakaoIcon} alt="" aria-hidden="true" className="h-[18px] w-[18px]" />
          {t('login.withKakao')}
        </button>
      )}
      {OAUTH_PROVIDERS.includes('google') && (
        <button
          type="button"
          onClick={() => void loginWithOAuth('google')}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-stage-border bg-white py-2.5 text-sm font-medium text-[#1f1f1f] transition hover:brightness-95"
        >
          <img src={googleIcon} alt="" aria-hidden="true" className="h-[18px] w-[18px]" />
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
