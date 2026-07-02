import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useUserStore } from '@/stores/userStore'

// SSOT: contracts/AuthPage.md — LoginPage. 이메일/비밀번호 로그인만 (Phase 0).
export default function LoginPage() {
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
        <h1 className="text-2xl font-bold">로그인</h1>

        <label className="block space-y-1">
          <span className="text-sm text-stage-text-muted">이메일</span>
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
          <span className="text-sm text-stage-text-muted">비밀번호</span>
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
          {submitting ? '로그인 중…' : '로그인'}
        </button>

        <p className="text-center text-sm text-stage-text-muted">
          계정이 없으신가요?{' '}
          <Link to="/register" className="text-fire-amber">
            회원가입
          </Link>
        </p>
      </form>
    </main>
  )
}
