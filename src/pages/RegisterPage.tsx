import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useUserStore } from '@/stores/userStore'

// SSOT: contracts/AuthPage.md — RegisterPage. 이메일/비밀번호 가입만 (Phase 0).
// 비밀번호 강도: 최소 8자 + 대문자 1 + 숫자 1 (AuthPage.md 회원가입 흐름 §검증).
function validate(email: string, password: string, confirm: string): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return '이메일 형식이 올바르지 않습니다.'
  if (password.length < 8) return '비밀번호는 최소 8자 이상이어야 합니다.'
  if (!/[A-Z]/.test(password)) return '비밀번호에 대문자를 1개 이상 포함하세요.'
  if (!/[0-9]/.test(password)) return '비밀번호에 숫자를 1개 이상 포함하세요.'
  if (password !== confirm) return '비밀번호가 일치하지 않습니다.'
  return null
}

export default function RegisterPage() {
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
    const v = validate(email, password, confirm)
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
          <h1 className="text-2xl font-bold">메일함을 확인해주세요</h1>
          <p className="text-sm text-stage-text-muted">
            <span className="text-stage-text">{email}</span> 로 인증 메일을 보냈어요. 링크를 눌러 가입을 완료하세요.
          </p>
          <Link to="/login" className="inline-block text-fire-amber">
            로그인으로 돌아가기
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-stage-base text-stage-text flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl bg-stage-panel p-8">
        <h1 className="text-2xl font-bold">회원가입</h1>

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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-stage-border bg-stage-base px-3 py-2 outline-none focus:border-fire-amber"
          />
          <span className="text-xs text-stage-text-muted">최소 8자, 대문자·숫자 각 1개 이상</span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-stage-text-muted">비밀번호 확인</span>
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
          {submitting ? '가입 중…' : '회원가입'}
        </button>

        <p className="text-center text-sm text-stage-text-muted">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="text-fire-amber">
            로그인
          </Link>
        </p>
      </form>
    </main>
  )
}
