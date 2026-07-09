import { useState, useEffect, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useUserStore } from '@/stores/userStore'
import { passwordIssue } from '@/lib/authValidation'
import AuthShell from '@/components/shared/AuthShell'
import OAuthButtons from '@/components/shared/OAuthButtons'
import { OAUTH_PROVIDERS } from '@/lib/oauth'

// SSOT: contracts/AuthPage.md — RegisterPage. 이메일/비밀번호 가입만 (Phase 0).
// 비밀번호 강도 규칙은 lib/authValidation(가입·재설정 공유)에서 단일 정의.
const ISSUE_KEY = {
  tooShort: 'register.errors.passwordTooShort',
  noUppercase: 'register.errors.passwordNoUppercase',
  noNumber: 'register.errors.passwordNoNumber',
} as const

function validate(email: string, password: string, confirm: string, t: (key: string) => string): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return t('register.errors.invalidEmail')
  const issue = passwordIssue(password)
  if (issue) return t(ISSUE_KEY[issue])
  if (password !== confirm) return t('register.errors.passwordMismatch')
  return null
}

export default function RegisterPage() {
  const { t } = useTranslation()
  const signUp = useUserStore((s) => s.signUpWithEmail)
  const resendVerification = useUserStore((s) => s.resendVerification)
  const storeError = useUserStore((s) => s.error)
  const authState = useUserStore((s) => s.authState)
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)

  const submitting = authState === 'AUTHENTICATING'
  // 이메일 강등: 간편인증(OAuth) 활성 시 이메일 가입 폼을 토글 뒤로 접는다. OAuth 미설정이면 바로 노출.
  const [showEmail, setShowEmail] = useState(OAUTH_PROVIDERS.length === 0)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [resendCooldown])

  async function onResend() {
    await resendVerification(email)
    setResendCooldown(60) // 남용/스팸 방지 쿨다운
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const v = validate(email, password, confirm, t)
    if (v) {
      setLocalError(v)
      return
    }
    setLocalError(null)
    const ok = await signUp(email, password)
    // 이메일 확인 OFF → 즉시 AUTHENTICATED. ponytail: 계약서상 /models(아바타 선택)로 가야 하나 Phase 0엔 없어 /lobby.
    if (ok && useUserStore.getState().authState === 'AUTHENTICATED') {
      navigate('/lobby', { replace: true })
    }
    // 이메일 확인 ON → PENDING_VERIFICATION 이면 아래 안내를 렌더한다.
  }

  if (authState === 'PENDING_VERIFICATION') {
    return (
      <AuthShell>
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-bold">{t('register.verification.title')}</h1>
          <p className="text-sm text-stage-text-muted">
            <span className="text-stage-text">{email}</span> {t('register.verification.message')}
          </p>
          <button
            type="button"
            onClick={() => void onResend()}
            disabled={resendCooldown > 0}
            className="text-sm text-fire-amber disabled:text-stage-text-muted"
          >
            {resendCooldown > 0
              ? t('register.verification.resendCooldown', { sec: resendCooldown })
              : t('register.verification.resend')}
          </button>
          <Link to="/login" className="block text-fire-amber">
            {t('register.verification.backLink')}
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit} className="space-y-4">
        <h1 className="text-2xl font-bold">{t('register.title')}</h1>

        <OAuthButtons />

        {showEmail ? (
          <>
            <label className="block space-y-1">
              <span className="text-sm text-stage-text-muted">{t('register.email')}</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-stage-border bg-stage-base px-3 py-2 outline-none focus:border-fire-amber"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-stage-text-muted">{t('register.password')}</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-stage-border bg-stage-base px-3 py-2 outline-none focus:border-fire-amber"
              />
              <span className="text-xs text-stage-text-muted">{t('register.passwordHint')}</span>
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-stage-text-muted">{t('register.passwordConfirm')}</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-stage-border bg-stage-base px-3 py-2 outline-none focus:border-fire-amber"
              />
            </label>

            {(localError || storeError) && (
              <p role="alert" className="text-sm text-fire-hot">
                {localError ?? storeError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg py-2 font-semibold text-[#241605] transition hover:brightness-110 disabled:opacity-50"
              style={{ background: 'var(--scene-accent)' }}
            >
              {submitting ? t('register.submitting') : t('register.submit')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="w-full text-center text-sm text-stage-text-muted hover:text-stage-text"
          >
            {t('register.useEmail')}
          </button>
        )}

        <p className="text-center text-sm text-stage-text-muted">
          {t('register.hasAccount')}{' '}
          <Link to="/login" className="text-fire-amber">
            {t('register.loginLink')}
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
