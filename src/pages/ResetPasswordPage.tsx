import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useUserStore } from '@/stores/userStore'
import { passwordIssue } from '@/lib/authValidation'
import AuthShell from '@/components/shared/AuthShell'

// A-FUNC-2: 재설정 메일 링크 착지점. supabase-js 가 URL 의 복구 토큰으로 임시 세션을 세팅하면
// updateUser({ password }) 로 새 비번을 확정한다. 강도 규칙은 가입과 동일(authValidation 공유).
const ISSUE_KEY = {
  tooShort: 'register.errors.passwordTooShort',
  noUppercase: 'register.errors.passwordNoUppercase',
  noNumber: 'register.errors.passwordNoNumber',
} as const

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const updatePassword = useUserStore((s) => s.updatePassword)
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const issue = passwordIssue(password)
    if (issue) { setError(t(ISSUE_KEY[issue])); return }
    if (password !== confirm) { setError(t('register.errors.passwordMismatch')); return }
    setBusy(true); setError(null)
    const ok = await updatePassword(password)
    setBusy(false)
    if (ok) navigate('/lobby', { replace: true })
    else setError(t('reset.failed'))
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit} className="space-y-4">
        <h1 className="text-2xl font-bold">{t('reset.title')}</h1>

        <label className="block space-y-1">
          <span className="text-sm text-stage-text-muted">{t('reset.password')}</span>
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
          <span className="text-sm text-stage-text-muted">{t('reset.confirm')}</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
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
          disabled={busy}
          className="w-full rounded-lg py-2 font-semibold text-[#241605] transition hover:brightness-110 disabled:opacity-50"
          style={{ background: 'var(--scene-accent)' }}
        >
          {busy ? t('reset.submitting') : t('reset.submit')}
        </button>
      </form>
    </AuthShell>
  )
}
