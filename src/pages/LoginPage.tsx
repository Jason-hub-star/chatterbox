import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import { useUserStore } from '@/stores/userStore'
import AuthShell from '@/components/shared/AuthShell'
import OAuthButtons from '@/components/shared/OAuthButtons'
import { OAUTH_PROVIDERS } from '@/lib/oauth'
import EntryVideoOverlay from '@/components/shared/EntryVideoOverlay'
import { resolveWorld } from '@/scenes/manifest'
import { useEffectiveWorld } from '@/stores/worldStore'

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
  // 로그인 스플래시·입장영상은 현재 세계관(worldStore)의 loginSplash 에서. 월드에 영상 없으면 인트로 스킵.
  const worldId = useEffectiveWorld()
  const splash = useMemo(() => resolveWorld(worldId).loginSplash, [worldId])
  // 이메일 강등: 간편인증(OAuth)이 활성일 때 이메일 폼을 토글 뒤로 접는다. OAuth 미설정이면 이메일이 유일 수단이라 바로 노출.
  const [showEmail, setShowEmail] = useState(OAUTH_PROVIDERS.length === 0)
  const submitting = authState === 'AUTHENTICATING'

  // 영상 프리로드: 성공 순간 버퍼링 갭 없이 시작(이음새 4중 설계 ④).
  useEffect(() => {
    if (!splash.video) return
    const v = document.createElement('video')
    v.preload = 'auto'
    v.muted = true
    v.src = splash.video
  }, [splash])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!(await login(email, password))) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const seen = localStorage.getItem(INTRO_SEEN_KEY) === '1'
    if (splash.video && !seen && !reduce) {
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

        {showEmail ? (
          <>
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
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="w-full text-center text-sm text-stage-text-muted hover:text-stage-text"
          >
            {t('login.useEmail')}
          </button>
        )}

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

        <p className="text-center text-sm text-stage-text-muted">
          {t('login.noAccount')}{' '}
          <Link to="/register" className="text-fire-amber">
            {t('login.signupLink')}
          </Link>
        </p>

        {/* 인트로 다시 보기 — 영상 있는 월드만 활성. 없어도 자리를 예약(invisible)해
            월드 전환 시 폼 높이 변동으로 중앙정렬 패널이 흔들리는 것 방지. */}
        <button
          type="button"
          onClick={() => splash.video && setEntryMode('replay')}
          aria-hidden={!splash.video}
          tabIndex={splash.video ? 0 : -1}
          className={`w-full text-center text-xs text-stage-text-muted/70 hover:text-stage-text ${splash.video ? '' : 'invisible'}`}
        >
          {t('login.introReplay')}
        </button>
      </form>

      {entryMode && splash.video && (
        <EntryVideoOverlay
          hero={splash.hero}
          video={splash.video}
          onDone={() => (entryMode === 'login' ? navigate(from, { replace: true }) : setEntryMode(null))}
        />
      )}
    </AuthShell>
  )
}
