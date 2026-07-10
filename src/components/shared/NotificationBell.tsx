import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useUserStore } from '@/stores/userStore'

// 인앱 알림 벨(Phase 5). Edge 불요 — notifications RLS 가 본인 행만 열어주므로 직접 SELECT +
// postgres_changes 구독(INSERT). 읽음 = read_at 만(컬럼 그랜트). 마이그 20260708140000.
interface Notif {
  id: string
  type: string
  payload: {
    invite_code?: string
    room_title?: string
    host_name?: string
    room_id?: string // followed_creator_stream_start — 클릭 시 /rooms/:id/ready 직행
    requester_name?: string | null // friend_request
    name?: string | null // friend_accepted
  }
  read_at: string | null
}

// 반응형 단일 인스턴스: 모바일=텍스트 버튼 / 데스크톱=원형 유리 칩(종 아이콘 — 헤더 바 없는
// 광장 위, 그림 가림 최소). 두 인스턴스 동시 마운트 금지 — 같은 채널 토픽 재구독으로 크래시.
export default function NotificationBell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const appUserId = useUserStore((s) => s.appUserId)
  const [items, setItems] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!appUserId) return
    let cancelled = false
    const load = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, payload, read_at')
        .order('created_at', { ascending: false })
        .limit(10)
      if (!cancelled && data) setItems(data as Notif[])
    }
    void load()
    const ch = supabase
      .channel(`notif:${appUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${appUserId}` },
        () => void load(),
      )
      .subscribe()
    return () => {
      cancelled = true
      void supabase.removeChannel(ch)
    }
  }, [appUserId])

  // 바깥 클릭으로 닫기(드롭다운 관례).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const unread = items.filter((n) => !n.read_at).length

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      // 열람 = 전부 읽음(RLS 가 본인 행으로 한정 — 필터 불요).
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    }
  }

  const onItem = (n: Notif) => {
    setOpen(false)
    // 재초대/예약초대: 초대코드가 있으면 로비 초대 배너 흐름(LOB-05) 재사용.
    if (n.payload.invite_code) navigate(`/lobby?invite=${n.payload.invite_code}`)
    // 팔로우 공연시작(PROFILE-05): 방으로 직행(분장실 경유).
    else if (n.type === 'followed_creator_stream_start' && typeof n.payload.room_id === 'string') {
      navigate(`/rooms/${n.payload.room_id}/ready`)
    }
  }

  const label = (n: Notif): string => {
    const host = n.payload.host_name ?? t('lobby.host')
    const room = n.payload.room_title ?? ''
    if (n.type === 're_invite') return t('notif.reInvite', { host, room })
    if (n.type === 'reservation_invite') return t('notif.reservationInvite', { host, room })
    if (n.type === 'reservation_reminder') return t('notif.reservationReminder', { room })
    // FriendSystem(PROFILE-04/05)
    if (n.type === 'friend_request') return t('notif.friendRequest', { name: n.payload.requester_name ?? '?' })
    if (n.type === 'friend_accepted') return t('notif.friendAccepted', { name: n.payload.name ?? '?' })
    if (n.type === 'followed_creator_stream_start') return t('notif.streamStart', { host, room })
    return n.type
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => void toggle()}
        aria-label={t('lobby.notifications')}
        className="relative hidden h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-stage-base/40 text-stage-text-muted backdrop-blur-sm transition hover:bg-stage-base/60 hover:text-stage-text md:flex"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.3 20a2 2 0 0 0 3.4 0" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-fire-amber px-1 text-center text-xs font-semibold text-stage-base">
            {unread}
          </span>
        )}
      </button>
      <button
        onClick={() => void toggle()}
        aria-label={t('lobby.notifications')}
        className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted hover:text-stage-text md:hidden"
      >
        {t('lobby.notifications')}
        {unread > 0 && (
          <span className="ml-1.5 rounded-full bg-fire-amber px-1.5 text-xs font-semibold text-stage-base">{unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-stage-border bg-stage-elevated py-1 shadow-lg">
          {items.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stage-text-muted">{t('lobby.notifEmpty')}</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => onItem(n)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-stage-panel"
              >
                {label(n)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
