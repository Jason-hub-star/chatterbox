import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import { useUserStore } from '@/stores/userStore'

// SSOT: contracts/AuthPage.md — LoginPage. 이메일/비밀번호 로그인만 (Phase 0).
export default function LoginPage() {
  const { t } = useTranslation()
  const login = useUserStore((s) => s.login)
  const error = useUserStore((s) => s.error)
  const authState = useUserStore((s) => s.authState)
  const navigate = useNavigate()
  const location = useLocation()
  // ProtectedRoute 가 넘겨준 원래 목적지로 복귀, 없으면 로비.
  const from = (location.state as { from?: string } | null)?.from ?? '/lobby'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const submitting = authState === 'AUTHENTICATING'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (await login(email, password)) navigate(from, { replace: true })
  }

  return (
    <main className="min-h-screen bg-stage-base text-stage-text flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl bg-stage-panel p-8">
        <h1 className="text-2xl font-bold">{t('login.title')}</h1>

        <label className="block space-y-1">
          <span className="text-sm text-stage-text-muted">{t('login.email')}</span>
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
          <span className="text-sm text-stage-text-muted">{t('login.password')}</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-stage-border bg-stage-base px-3 py-2 outline-none focus:border-fire-amber"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-fire-hot">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-fire-amber py-2 font-medium text-stage-base disabled:opacity-50"
        >
          {submitting ? t('login.submitting') : t('login.submit')}
        </button>

        <p className="text-center text-sm text-stage-text-muted">
          {t('login.noAccount')}{' '}
          <Link to="/register" className="text-fire-amber">
            {t('login.signupLink')}
          </Link>
        </p>
      </form>
    </main>
  )
}
