import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { createRoom, fetchPublicRooms, type LobbyRoom } from '@/lib/rooms'

// LOB-01/03: 공개 방 목록(public_rooms 뷰) + 방 생성.
// ponytail: 장르/언어 필터·Realtime 라이브 갱신·초대링크·비밀번호는 후속 슬라이스.
//   (Realtime 로비는 rooms 공개 SELECT 정책이 필요 — 현재 RLS는 참가자 전용이라 수동 새로고침.)
export default function LobbyPage() {
  const { t } = useTranslation()
  const email = useUserStore((s) => s.user?.email)
  const session = useUserStore((s) => s.session)
  const logout = useUserStore((s) => s.logout)
  const navigate = useNavigate()

  const [rooms, setRooms] = useState<LobbyRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 버튼용 새로고침(이벤트 핸들러 — 여기서 setState 는 규칙 위반 아님).
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setRooms(await fetchPublicRooms())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('lobby.fetchError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  // 최초 로드: setState 는 async IIFE 안(await 이후)에서만 — set-state-in-effect 회피.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchPublicRooms()
        if (!cancelled) {
          setRooms(data)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('lobby.fetchError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [t])

  async function onLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle || !session) return
    setCreating(true)
    setError(null)
    try {
      const { room_id } = await createRoom(session.access_token, trimmedTitle)
      navigate(`/rooms/${room_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('lobby.createError'))
      setCreating(false)
    }
  }

  return (
    <main className="min-h-screen bg-stage-base text-stage-text p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('lobby.title')}</h1>
        <button
          onClick={onLogout}
          className="rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
        >
          {t('lobby.logout')}
        </button>
      </div>
      {email && <p className="mt-2 text-stage-text-muted">{t('lobby.welcome', { email })}</p>}

      <form onSubmit={onCreate} className="mt-6 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label={t('lobby.roomTitleInput')}
          placeholder={t('lobby.roomTitlePlaceholder')}
          maxLength={80}
          className="flex-1 max-w-sm rounded-lg border border-stage-border bg-transparent px-4 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={creating || !title.trim()}
          className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
        >
          {creating ? t('lobby.creating') : t('lobby.createRoom')}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg bg-fire-hot/10 px-4 py-2 text-sm text-fire-hot" role="alert">
          {error}
        </p>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stage-text-muted">
            {t('lobby.publicRooms')} ({rooms.length})
          </h2>
          <button
            onClick={() => void refresh()}
            className="text-xs text-stage-text-muted hover:text-stage-text"
          >
            {t('lobby.refresh')}
          </button>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-stage-text-muted">{t('common.loading')}</p>
        ) : rooms.length === 0 ? (
          <p className="mt-3 text-sm text-stage-text-muted">
            {t('lobby.noRooms')}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rooms.map((r) => {
              const full = r.currentParticipants >= r.maxParticipants
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-stage-border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.title}</p>
                    <p className="text-xs text-stage-text-muted">
                      {r.hostDisplayName ?? t('lobby.host')} · {t('lobby.participantCount', { currentParticipants: r.currentParticipants, maxParticipants: r.maxParticipants })}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/rooms/${r.id}`)}
                    disabled={full}
                    className="shrink-0 rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
                  >
                    {full ? t('lobby.full') : t('lobby.join')}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
