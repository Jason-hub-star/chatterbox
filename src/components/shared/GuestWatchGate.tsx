import { type ReactNode, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'

// LOB-07 게스트 관전 게이트 — /rooms/:roomId 전용(contracts/ViewerGate.md as-built).
// 세션 있으면 통과. 없으면 [게스트로 관전]/[로그인] 선택지 제시.
// 게스트 선택 → ?watch=1 선반영 → signInAnonymously → 세션 유입으로 RoomPage 가 뷰어로 조인.
export default function GuestWatchGate({ children }: { children: ReactNode }) {
  const session = useUserStore((s) => s.session)
  const ready = useUserStore((s) => s.ready)
  const signInGuest = useUserStore((s) => s.signInGuest)
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  // getSession 복원 완료 전엔 판단 보류(ProtectedRoute 와 동일 게이트 — 깜빡 방지).
  if (!ready) return null
  if (session) return <>{children}</>

  const startWatching = async () => {
    setBusy(true)
    setFailed(false)
    // 관전 플래그 선반영 — 세션 유입 직후 RoomPage 조인 이펙트가 ?watch=1 을 읽는다.
    const params = new URLSearchParams(location.search)
    if (!params.has('watch')) {
      params.set('watch', '1')
      navigate(`${location.pathname}?${params.toString()}`, { replace: true })
    }
    const ok = await signInGuest()
    if (!ok) {
      setBusy(false)
      setFailed(true)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stage-base px-6 text-center text-stage-text">
      <h1 className="text-xl font-bold">{t('guest.watchTitle')}</h1>
      <p className="max-w-sm text-sm leading-relaxed text-stage-text-muted">{t('guest.watchBody')}</p>
      {failed && <p className="text-sm text-fire-hot">{t('guest.signInError')}</p>}
      <div className="flex flex-col items-center gap-2 sm:flex-row">
        <button
          onClick={() => void startWatching()}
          disabled={busy}
          className="rounded-lg bg-fire-amber px-5 py-2.5 text-sm font-bold text-stage-base hover:opacity-90 disabled:opacity-40"
        >
          {busy ? t('common.loading') : t('guest.watchCta')}
        </button>
        <button
          onClick={() => navigate('/login', { state: { from: location.pathname + location.search } })}
          className="rounded-lg border border-stage-border px-5 py-2.5 text-sm text-stage-text-muted hover:text-stage-text"
        >
          {t('guest.loginCta')}
        </button>
      </div>
    </main>
  )
}
