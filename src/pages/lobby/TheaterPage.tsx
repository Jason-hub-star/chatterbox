import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/useToast'
import {
  ROOM_GENRES,
  createReservation,
  createRoom,
  fetchMyReservations,
  fetchPublicRooms,
  fetchPublicRoomsGuest,
  listRecentPeople,
  type LobbyRoom,
  type RecentPerson,
  type Reservation,
} from '@/lib/rooms'
import { useInterior } from '@/pages/lobby/useInterior'
import Modal from '@/components/shared/Modal'
import RoomCard from '@/features/theater/RoomCard'
import RoomCardSkeleton from '@/features/theater/RoomCardSkeleton'
import TheaterHero from '@/features/theater/TheaterHero'

// 대극장(로비 v4 — 넷플릭스형 개편, 주인님 콜 2026-07-09): 앵커 붙박이(원화 위 포스터3+리스트)를
// 히어로(원화 재활용) + 무채 미니멀 카드 그리드로 교체. 생성·예약은 기존 로직을 모달로 보존한다.
// ←/Esc 광장 복귀는 직접(InteriorShell 탈피). 방 목록·Realtime nudge·입장 분기는 그대로.

type Filter = 'all' | 'joinable' | 'live'

export default function TheaterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useUserStore((s) => s.session)
  const heroBg = useInterior('rooms')?.hero
  const [searchParams] = useSearchParams()
  const initTab = searchParams.get('tab')

  const [rooms, setRooms] = useState<LobbyRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [genreFilter, setGenreFilter] = useState<string | null>(null)
  const [modal, setModal] = useState<null | 'create' | 'ticket'>(
    initTab === 'ticket' ? 'ticket' : initTab === 'create' ? 'create' : null,
  )

  // LOB-07: 비로그인은 Public 함수(list-public-rooms) 경유 — 뷰 직접 SELECT 는 authenticated 전용 grant.
  const applyRooms = useCallback(async () => {
    try {
      setRooms(session ? await fetchPublicRooms() : await fetchPublicRoomsGuest())
    } catch {
      /* transient — 기존 목록 유지 */
    }
  }, [session])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = session ? await fetchPublicRooms() : await fetchPublicRoomsGuest()
        if (!cancelled) setRooms(data)
      } catch {
        if (!cancelled) toast.error(t('lobby.fetchError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [t, session])

  // 로비 Realtime nudge(기존 채널 재사용) — 방 생성/입퇴장 시 그리드 자동 갱신.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const nudge = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void applyRooms(), 400)
    }
    const ch = supabase.channel('lobby').on('broadcast', { event: 'lobby_change' }, nudge).subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(ch)
    }
  }, [applyRooms])

  // ←/Esc 광장 복귀(InteriorShell 탈피 — 모달 열렸을 땐 모달이 Esc 를 소비하므로 !modal 가드).
  // 게스트는 광장(/lobby, Protected)이 없으므로 복귀 없음.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modal && session) navigate('/lobby')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, modal, session])

  const enter = useCallback(
    (r: LobbyRoom) => {
      // 게스트는 항상 관전 경로 — GuestWatchGate 가 익명 세션 발급을 안내(LOB-07).
      if (!session) {
        navigate(`/rooms/${r.id}?watch=1`)
        return
      }
      const full = r.currentParticipants >= r.maxParticipants
      if (full && !r.isLocked) navigate(`/rooms/${r.id}?watch=1`)
      else navigate(`/rooms/${r.id}/ready`)
    },
    [navigate, session],
  )

  // 무대 만들기 진입 — 게스트는 로그인으로(복귀 경로 보존, LOB-05 리다이렉트 규칙).
  const openCreate = useCallback(() => {
    if (session) setModal('create')
    else navigate('/login', { state: { from: '/lobby/theater' } })
  }, [session, navigate])

  // 히어로 캐러셀 = 인기 상위 무대(LIVE 참여인원순, 없으면 최신순) 최대 5개. 연습방 제외.
  const heroRooms = useMemo(() => {
    const pool = rooms.filter((r) => !r.isPractice)
    const live = pool.filter((r) => r.status === 'live').sort((a, b) => b.currentParticipants - a.currentParticipants)
    return (live.length ? live : pool).slice(0, 5)
  }, [rooms])

  const q = query.trim().toLowerCase()
  const listed = useMemo(
    () =>
      rooms.filter((r) => {
        if (filter === 'live' && r.status !== 'live') return false
        if (filter === 'joinable' && r.currentParticipants >= r.maxParticipants) return false
        if (genreFilter && r.genre !== genreFilter) return false
        if (!q) return true
        return r.title.toLowerCase().includes(q) || (r.hostDisplayName ?? '').toLowerCase().includes(q)
      }),
    [rooms, filter, genreFilter, q],
  )

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: t('theater.filterAll') },
    { key: 'joinable', label: t('theater.filterJoinable') },
    { key: 'live', label: t('theater.filterLive') },
  ]

  return (
    <main className="min-h-screen bg-stage-base text-stage-text">
      {/* 상단 바 — ← 광장 복귀 + 무대 만들기(InteriorShell 헤더 대체) */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-stage-border bg-stage-base/85 px-4 py-3 backdrop-blur md:px-6">
        {session && (
          <button
            onClick={() => navigate('/lobby')}
            className="rounded-lg border border-stage-border px-3 py-1.5 text-sm text-stage-text-muted hover:text-stage-text"
          >
            ← {t('hub.backToPlaza')}
          </button>
        )}
        <h1 className="text-lg font-bold">{t('hub.rooms.title')}</h1>
        <button
          onClick={openCreate}
          className="ml-auto rounded-lg bg-fire-amber px-4 py-1.5 text-sm font-bold text-stage-base hover:opacity-90"
        >
          {session ? t('theater.newStage') : t('guest.loginCta')}
        </button>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 p-4 pb-24 md:p-6">
        <TheaterHero rooms={heroRooms} bgUrl={heroBg} onEnter={enter} onCreate={openCreate} />

        {/* 필터/검색 — 모바일: 칩은 가로 스크롤 1줄(YouTube·CHZZK식), 검색·예약은 아래 한 줄로 분리해
            세로 낭비 제거. 데스크톱(md↑): 칩 줄바꿈 + 검색 우측 정렬. 주인님 콜 2026-07-09 */}
        <div className="space-y-2">
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  filter === f.key
                    ? 'bg-stage-text text-stage-base'
                    : 'border border-stage-border text-stage-text-muted hover:text-stage-text'
                }`}
              >
                {f.label}
              </button>
            ))}
            <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-stage-border" />
            {ROOM_GENRES.map((g) => (
              <button
                key={g}
                onClick={() => setGenreFilter((cur) => (cur === g ? null : g))}
                aria-pressed={genreFilter === g}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  genreFilter === g
                    ? 'bg-stage-text text-stage-base'
                    : 'border border-stage-border text-stage-text-muted hover:text-stage-text'
                }`}
              >
                {t(`lobby.genre.${g}`)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('lobby.searchLabel')}
              placeholder={t('lobby.searchPlaceholder')}
              maxLength={40}
              className="min-w-0 flex-1 rounded-lg border border-stage-border bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-fire-amber md:ml-auto md:w-52 md:flex-none"
            />
            {session && (
              <button
                onClick={() => setModal('ticket')}
                className="shrink-0 rounded-lg border border-stage-border px-3 py-1.5 text-sm text-stage-text-muted hover:text-stage-text"
              >
                {t('theater.reserveOpen')}
              </button>
            )}
          </div>
        </div>

        {/* 카드 그리드 (반응형 2/3/4) */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <RoomCardSkeleton key={i} />)
            : listed.map((r) => <RoomCard key={r.id} room={r} onEnter={enter} />)}
        </div>
        {!loading && listed.length === 0 && (
          // LOBBY-EMPTY-FILTER: 필터/장르 활성 시 "방 없음"은 오해 — 필터별 문구로 구분(검색>필터>기본).
          <p className="py-12 text-center text-sm text-stage-text-muted">
            {q ? t('lobby.noMatch') : filter !== 'all' || genreFilter ? t('lobby.noFilterMatch') : t('lobby.noRooms')}
          </p>
        )}
      </div>

      {modal === 'create' && session && (
        <Modal title={t('theater.newStage')} onClose={() => setModal(null)}>
          <StageCreator accessToken={session.access_token} />
        </Modal>
      )}
      {modal === 'ticket' && session && (
        <Modal title={t('theater.reserveTitle')} onClose={() => setModal(null)} widthClass="max-w-md">
          <TicketOffice accessToken={session.access_token} presetInvitee={searchParams.get('invitee')} />
        </Modal>
      )}
    </main>
  )
}

// 무대 열기 = 방 생성(LOB-03). 생성 즉시 분장실(/ready)로 — 모달은 내비게이션으로 자동 언마운트.
function StageCreator({ accessToken }: { accessToken: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('')
  const [creating, setCreating] = useState(false)

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setCreating(true)
    try {
      const { room_id } = await createRoom(accessToken, trimmed, genre || undefined)
      navigate(`/rooms/${room_id}/ready`)
    } catch {
      toast.error(t('lobby.createError'))
      setCreating(false)
    }
  }

  return (
    <form onSubmit={onCreate} className="mt-3 flex flex-col gap-2">
      <p className="text-xs text-stage-text-muted">{t('workshop.benchHint')}</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label={t('lobby.roomTitleInput')}
        placeholder={t('lobby.roomTitlePlaceholder')}
        maxLength={80}
        className="rounded-lg border border-stage-border bg-transparent px-3 py-1.5 text-sm"
      />
      <select
        value={genre}
        onChange={(e) => setGenre(e.target.value)}
        aria-label={t('lobby.genreLabel')}
        className="rounded-lg border border-stage-border bg-stage-base px-2 py-2 text-sm text-stage-text-muted"
      >
        <option value="">{t('lobby.genreNone')}</option>
        {ROOM_GENRES.map((g) => (
          <option key={g} value={g}>
            {t(`lobby.genre.${g}`)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={creating || !title.trim()}
        className="rounded-lg bg-fire-amber px-4 py-2.5 text-sm font-bold text-stage-base disabled:opacity-40"
      >
        {creating ? t('lobby.creating') : t('workshop.raiseStage')}
      </button>
    </form>
  )
}

// 매표소 = 예약 공연(LOB-06). 찻집 칩 클릭이 ?invitee= 로 넘어오면 자동 체크.
function TicketOffice({ accessToken, presetInvitee }: { accessToken: string; presetInvitee: string | null }) {
  const { t, i18n } = useTranslation()
  const [mine, setMine] = useState<Reservation[]>([])
  const [people, setPeople] = useState<RecentPerson[]>([])
  const [checked, setChecked] = useState<Set<string>>(() => new Set(presetInvitee ? [presetInvitee] : []))
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [res, ppl] = await Promise.all([
          fetchMyReservations(),
          listRecentPeople(accessToken).then((r) => r.people).catch(() => []),
        ])
        if (!cancelled) {
          setMine(res)
          setPeople(ppl)
        }
      } catch {
        /* 폼만으로 성립 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function onReserve(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || !when) return
    setBusy(true)
    try {
      const r = await createReservation(accessToken, trimmed, new Date(when).toISOString(), [...checked])
      toast.success(t('lobby.reserveDone', { count: r.notified }))
      setMine((prev) =>
        [...prev, { id: r.reservation_id, title: trimmed, scheduled_at: r.scheduled_at }].sort((a, b) =>
          a.scheduled_at.localeCompare(b.scheduled_at),
        ),
      )
      setTitle('')
      setWhen('')
      setChecked(new Set())
    } catch {
      toast.error(t('lobby.reserveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {mine.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-stage-border px-2.5 py-2">
          <p className="min-w-0 truncate text-xs font-semibold">{r.title}</p>
          <p className="shrink-0 text-[11px] text-stage-text-muted">
            {new Date(r.scheduled_at).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        </div>
      ))}
      <form onSubmit={onReserve} className="flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label={t('lobby.roomTitleInput')}
          placeholder={t('lobby.roomTitlePlaceholder')}
          maxLength={80}
          className="rounded-lg border border-stage-border bg-transparent px-3 py-1.5 text-xs"
        />
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          aria-label={t('lobby.reserveWhenLabel')}
          className="rounded-lg border border-stage-border bg-transparent px-3 py-1.5 text-xs text-stage-text-muted"
        />
        {people.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] text-stage-text-muted">{t('lobby.reserveInvitees')}</p>
            <div className="flex flex-wrap gap-1.5">
              {people.map((p) => (
                <label key={p.user_id} className="flex items-center gap-1 rounded border border-stage-border px-1.5 py-0.5 text-[11px]">
                  <input type="checkbox" checked={checked.has(p.user_id)} onChange={() => toggle(p.user_id)} />
                  {p.display_name ?? '?'}
                </label>
              ))}
            </div>
          </div>
        )}
        <button
          type="submit"
          disabled={busy || !title.trim() || !when}
          className="self-start rounded-lg bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40"
        >
          {busy ? t('lobby.reserving') : t('lobby.reserveMake')}
        </button>
      </form>
    </div>
  )
}
