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
  payload: { invite_code?: string; room_title?: string; host_name?: string }
  read_at: string | null
}

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
  }

  const label = (n: Notif): string => {
    const host = n.payload.host_name ?? t('lobby.host')
    const room = n.payload.room_title ?? ''
    if (n.type === 're_invite') return t('notif.reInvite', { host, room })
    if (n.type === 'reservation_invite') return t('notif.reservationInvite', { host, room })
    if (n.type === 'reservation_reminder') return t('notif.reservationReminder', { room })
    return n.type
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => void toggle()}
        aria-label={t('lobby.notifications')}
        className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted hover:text-stage-text"
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
