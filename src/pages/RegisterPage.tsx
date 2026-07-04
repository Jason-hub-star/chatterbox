import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useUserStore } from '@/stores/userStore'

// SSOT: contracts/AuthPage.md — RegisterPage. 이메일/비밀번호 가입만 (Phase 0).
// 비밀번호 강도: 최소 8자 + 대문자 1 + 숫자 1 (AuthPage.md 회원가입 흐름 §검증).
function validate(email: string, password: string, confirm: string, t: (key: string) => string): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return t('register.errors.invalidEmail')
  if (password.length < 8) return t('register.errors.passwordTooShort')
  if (!/[A-Z]/.test(password)) return t('register.errors.passwordNoUppercase')
  if (!/[0-9]/.test(password)) return t('register.errors.passwordNoNumber')
  if (password !== confirm) return t('register.errors.passwordMismatch')
  return null
}

export default function RegisterPage() {
  const { t } = useTranslation()
  const signUp = useUserStore((s) => s.signUpWithEmail)
  const storeError = useUserStore((s) => s.error)
  const authState = useUserStore((s) => s.authState)
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const submitting = authState === 'AUTHENTICATING'

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
      <main className="min-h-screen bg-stage-base text-stage-text flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4 rounded-2xl bg-stage-panel p-8 text-center">
          <h1 className="text-2xl font-bold">{t('register.verification.title')}</h1>
          <p className="text-sm text-stage-text-muted">
            <span className="text-stage-text">{email}</span> {t('register.verification.message')}
          </p>
          <Link to="/login" className="inline-block text-fire-amber">
            {t('register.verification.backLink')}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-stage-base text-stage-text flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl bg-stage-panel p-8">
        <h1 className="text-2xl font-bold">{t('register.title')}</h1>

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
          className="w-full rounded-lg bg-fire-amber py-2 font-medium text-stage-base disabled:opacity-50"
        >
          {submitting ? t('register.submitting') : t('register.submit')}
        </button>

        <p className="text-center text-sm text-stage-text-muted">
          {t('register.hasAccount')}{' '}
          <Link to="/login" className="text-fire-amber">
            {t('register.loginLink')}
          </Link>
        </p>
      </form>
    </main>
  )
}
