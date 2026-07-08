import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/useToast'
import {
  createReservation,
  fetchMyReservations,
  fetchPublicRooms,
  listRecentPeople,
  type LobbyRoom,
  type RecentPerson,
  type Reservation,
} from '@/lib/rooms'
import InteriorShell from '@/pages/lobby/InteriorShell'
import { useInterior } from '@/pages/lobby/useInterior'

// 대극장(로비 v3) — 레거시 전가: 공개 방 목록·검색·Realtime nudge + 예약(매표소).
// 살아있는 앵커: 좌측 금박 액자 게시판에 최신 방 3개가 "포스터로 걸림"(방이 그림을 바꾼다).
// 진입 즉시 기본 UI 오픈(주인님 스펙) — 추가 클릭은 카드의 입장/관전뿐, 매표소만 탭 1클릭.
const vars = (a: { l: number; t: number; w: number; h: number }) =>
  ({ '--al': `${a.l}%`, '--at': `${a.t}%`, '--aw': `${a.w}%` }) as React.CSSProperties

export default function TheaterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useUserStore((s) => s.session)
  const interior = useInterior('rooms')
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<'shows' | 'ticket'>(searchParams.get('tab') === 'ticket' ? 'ticket' : 'shows')

  const [rooms, setRooms] = useState<LobbyRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const applyRooms = useCallback(async () => {
    try {
      setRooms(await fetchPublicRooms())
    } catch {
      /* transient — 기존 목록 유지 */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchPublicRooms()
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
  }, [t])

  // 로비 Realtime nudge(기존 채널 재사용) — 방 생성/입퇴장 시 포스터·목록이 자동 갱신.
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

  const enter = (r: LobbyRoom) => {
    const full = r.currentParticipants >= r.maxParticipants
    if (full && !r.isLocked) navigate(`/rooms/${r.id}?watch=1`)
    else navigate(`/rooms/${r.id}/ready`)
  }

  const q = query.trim().toLowerCase()
  const listed = rooms.filter(
    (r) => !q || r.title.toLowerCase().includes(q) || (r.hostDisplayName ?? '').toLowerCase().includes(q),
  )
  const posters = rooms.filter((r) => !r.isPractice).slice(0, 3)

  const statusDot = (r: LobbyRoom) => (
    <span className={r.status === 'live' ? 'text-fire-hot' : 'text-stage-text-muted'}>
      {r.status === 'live' ? '●' : '○'}
    </span>
  )

  return (
    <InteriorShell dest="rooms" title={t('hub.rooms.title')}>
      {/* 살아있는 앵커: 액자 게시판 — 최신 방 3개가 포스터로 걸림(없으면 빈 액자 그대로). */}
      {interior && (
        <div className="interior-anchor" style={vars(interior.anchors.posterBoard)}>
          <div className="grid grid-cols-1 gap-2 md:h-full md:grid-cols-3 md:gap-[4%] md:px-[3%] md:py-[6%]">
            {posters.map((r) => (
              <button
                key={r.id}
                onClick={() => enter(r)}
                className="interior-panel flex flex-col items-start gap-1 text-left transition hover:border-fire-amber md:h-full md:justify-between"
              >
                <span className="text-xs text-stage-text-muted">
                  {statusDot(r)} {r.status === 'live' ? t('lobby.statusLive') : t('lobby.statusWaiting')}
                </span>
                <span className="line-clamp-3 text-sm font-bold text-stage-text">{r.title}</span>
                <span className="text-xs text-stage-text-muted">
                  {r.genre && <span className="mr-1">{t(`lobby.genre.${r.genre}`)}</span>}
                  {t('lobby.participantCount', { currentParticipants: r.currentParticipants, maxParticipants: r.maxParticipants })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 우측 패널(매표소 창구 자리): 공연 목록 ↔ 매표소(예약) 탭 — 진입 시 목록이 기본 오픈. */}
      {interior && (
        <div className="interior-anchor md:h-[64%]" style={vars(interior.anchors.ticketBooth)}>
          <div className="interior-panel flex flex-col gap-2 md:h-full">
            <div className="flex gap-1">
              <button
                onClick={() => setTab('shows')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === 'shows' ? 'bg-fire-amber text-stage-base' : 'text-stage-text-muted hover:text-stage-text'}`}
              >
                {t('theater.tabShows')}
              </button>
              <button
                onClick={() => setTab('ticket')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === 'ticket' ? 'bg-fire-amber text-stage-base' : 'text-stage-text-muted hover:text-stage-text'}`}
              >
                {t('theater.tabTicket')}
              </button>
            </div>

            {tab === 'shows' ? (
              <>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label={t('lobby.searchLabel')}
                  placeholder={t('lobby.searchPlaceholder')}
                  maxLength={40}
                  className="rounded-lg border border-stage-border bg-transparent px-3 py-1.5 text-xs"
                />
                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                  {loading ? (
                    <p className="text-xs text-stage-text-muted">{t('common.loading')}</p>
                  ) : listed.length === 0 ? (
                    <p className="text-xs text-stage-text-muted">{q ? t('lobby.noMatch') : t('lobby.noRooms')}</p>
                  ) : (
                    listed.map((r) => {
                      const full = r.currentParticipants >= r.maxParticipants
                      return (
                        <div key={r.id} className="flex items-center gap-2 rounded-lg border border-stage-border px-2.5 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold">
                              {statusDot(r)} {r.isLocked && '🔒 '}
                              {r.title}
                              {r.isPractice && (
                                <span className="ml-1.5 rounded bg-spring-green/15 px-1 py-0.5 text-[10px] text-spring-green">
                                  {t('lobby.practiceBadge')}
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-stage-text-muted">
                              {r.hostDisplayName ?? t('lobby.host')} · {r.currentParticipants}/{r.maxParticipants}
                            </p>
                          </div>
                          <button
                            onClick={() => enter(r)}
                            className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${
                              full && !r.isLocked
                                ? 'border border-stage-border text-stage-text-muted hover:text-stage-text'
                                : 'bg-fire-amber text-stage-base'
                            }`}
                          >
                            {full && !r.isLocked ? t('lobby.watch') : t('lobby.join')}
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </>
            ) : (
              session && <TicketOffice accessToken={session.access_token} presetInvitee={searchParams.get('invitee')} />
            )}
          </div>
        </div>
      )}
    </InteriorShell>
  )
}

// 매표소 = 예약 공연(LOB-06, 로비 레거시 이전). 찻집 칩 클릭이 ?invitee= 로 넘어오면 자동 체크.
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
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
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
