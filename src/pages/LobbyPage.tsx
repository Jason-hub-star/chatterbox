import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { supabase } from '@/lib/supabase'
import { createRoom, fetchPublicRooms, type LobbyRoom } from '@/lib/rooms'

// LOB-01/03: 공개 방 목록(public_rooms 뷰) + 방 생성 + 검색 + Realtime 자동갱신.
// Realtime: rooms 변경 시 트리거가 public 'lobby' 채널로 nudge broadcast(민감컬럼 노출 0·
//   RLS 무변경) → 여기서 debounce 후 뷰 재조회. 마이그 20260705130000_lobby_realtime_broadcast.
// 비번방 입장은 클릭 → join-public-room 403 "Room is locked" → RoomPage 비번단계(기구현).
// ponytail: 장르 필터·초대링크는 후속(genre 컬럼은 있으나 create-room 미배선).
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
  const [query, setQuery] = useState('')

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

  // Realtime nudge 용 조용한 갱신(로딩 스피너 없이 목록만 교체, 일시 오류는 기존 목록 유지).
  const applyRooms = useCallback(async () => {
    try {
      setRooms(await fetchPublicRooms())
    } catch {
      /* transient — 기존 목록 유지 */
    }
  }, [])

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

  // 로비 Realtime: rooms 트리거의 'lobby' broadcast nudge → debounce 후 뷰 재조회.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const nudge = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void applyRooms(), 400)
    }
    const ch = supabase
      .channel('lobby')
      .on('broadcast', { event: 'lobby_change' }, nudge)
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(ch)
    }
  }, [applyRooms])

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

  const q = query.trim().toLowerCase()
  const filtered = q
    ? rooms.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.hostDisplayName ?? '').toLowerCase().includes(q),
      )
    : rooms

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
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-stage-text-muted">
            {t('lobby.publicRooms')} ({filtered.length})
          </h2>
          <div className="flex items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('lobby.searchLabel')}
              placeholder={t('lobby.searchPlaceholder')}
              maxLength={40}
              className="w-40 rounded-lg border border-stage-border bg-transparent px-3 py-1.5 text-xs"
            />
            <button
              onClick={() => void refresh()}
              className="shrink-0 text-xs text-stage-text-muted hover:text-stage-text"
            >
              {t('lobby.refresh')}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-stage-text-muted">{t('common.loading')}</p>
        ) : rooms.length === 0 ? (
          <p className="mt-3 text-sm text-stage-text-muted">
            {t('lobby.noRooms')}
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-3 text-sm text-stage-text-muted">{t('lobby.noMatch')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {filtered.map((r) => {
              const full = r.currentParticipants >= r.maxParticipants
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-stage-border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {r.isLocked && <span aria-label={t('lobby.locked')} title={t('lobby.locked')}>🔒 </span>}
                      {r.title}
                    </p>
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
