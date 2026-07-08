import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import { useUserStore } from '@/stores/userStore'
import AuthShell from '@/components/shared/AuthShell'
import OAuthButtons from '@/components/shared/OAuthButtons'
import EntryVideoOverlay from '@/components/shared/EntryVideoOverlay'
import { SCENES, resolveScene } from '@/scenes/manifest'

// SSOT: contracts/AuthPage.md — LoginPage. LoL식 셸(AuthShell), 소셜 우선(OAuthButtons) + 이메일 보조.
// 입장 영상(ONBOARDING-01): 로그인 성공 → 첫 방문 1회 재생(localStorage) · 클릭/Esc 스킵 ·
//   reduced-motion/영상 미등재/로드 실패는 즉시 내비. '인트로 다시 보기'는 로그인 없이 재생만.
const INTRO_SEEN_KEY = 'cb.introSeen'

export default function LoginPage() {
  const { t } = useTranslation()
  const login = useUserStore((s) => s.login)
  const requestPasswordReset = useUserStore((s) => s.requestPasswordReset)
  const error = useUserStore((s) => s.error)
  const authState = useUserStore((s) => s.authState)
  const navigate = useNavigate()
  const location = useLocation()
  // ProtectedRoute 가 넘겨준 원래 목적지로 복귀, 없으면 로비.
  const from = (location.state as { from?: string } | null)?.from ?? '/lobby'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  // 'login' = 성공 연출(종료 시 내비) / 'replay' = 다시 보기(종료 시 닫기만)
  const [entryMode, setEntryMode] = useState<null | 'login' | 'replay'>(null)
  const [scene] = useState(() => resolveScene(SCENES.loginSplash, new Date().getHours()))
  const submitting = authState === 'AUTHENTICATING'

  // 영상 프리로드: 성공 순간 버퍼링 갭 없이 시작(이음새 4중 설계 ④).
  useEffect(() => {
    if (!scene?.video) return
    const v = document.createElement('video')
    v.preload = 'auto'
    v.muted = true
    v.src = scene.video
  }, [scene])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!(await login(email, password))) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const seen = localStorage.getItem(INTRO_SEEN_KEY) === '1'
    if (scene?.video && !seen && !reduce) {
      localStorage.setItem(INTRO_SEEN_KEY, '1')
      setEntryMode('login')
    } else {
      navigate(from, { replace: true })
    }
  }

  async function onForgotPassword() {
    if (!email) { setNotice(t('login.resetNeedEmail')); return }
    await requestPasswordReset(email)
    // enumeration 방지: 계정 존재 여부와 무관하게 동일 안내.
    setNotice(t('login.resetSent'))
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit} className="space-y-4">
        <h1 className="text-2xl font-bold">{t('login.title')}</h1>

        <OAuthButtons />

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
        {notice && (
          <p role="status" className="text-sm text-stage-text-muted">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg py-2 font-semibold text-[#241605] transition hover:brightness-110 disabled:opacity-50"
          style={{ background: 'var(--scene-accent)' }}
        >
          {submitting ? t('login.submitting') : t('login.submit')}
        </button>

        <button
          type="button"
          onClick={() => void onForgotPassword()}
          className="w-full text-center text-sm text-stage-text-muted hover:text-stage-text"
        >
          {t('login.forgotPassword')}
        </button>

        <p className="text-center text-sm text-stage-text-muted">
          {t('login.noAccount')}{' '}
          <Link to="/register" className="text-fire-amber">
            {t('login.signupLink')}
          </Link>
        </p>

        {scene?.video && (
          <button
            type="button"
            onClick={() => setEntryMode('replay')}
            className="w-full text-center text-xs text-stage-text-muted/70 hover:text-stage-text"
          >
            {t('login.introReplay')}
          </button>
        )}
      </form>

      {entryMode && scene?.video && (
        <EntryVideoOverlay
          hero={scene.hero}
          video={scene.video}
          onDone={() => (entryMode === 'login' ? navigate(from, { replace: true }) : setEntryMode(null))}
        />
      )}
    </AuthShell>
  )
}
