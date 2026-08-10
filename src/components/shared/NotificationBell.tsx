import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useUserStore } from '@/stores/userStore'
import { useFriendStore } from '@/stores/friendStore'
import { usePopoverA11y } from '@/hooks/usePopoverA11y'
import { resolveNotifTarget, type NotifPayload } from '@/components/shared/notifRouting'
import { toast } from '@/hooks/useToast'

// 인앱 알림 벨(Phase 5). Edge 불요 — notifications RLS 가 본인 행만 열어주므로 직접 SELECT +
// postgres_changes 구독(INSERT). 읽음 = read_at 만(컬럼 그랜트). 마이그 20260708140000.
// 클릭 목적지는 `notifRouting.ts` 가 단독 소유 — 분기를 여기 두면 type 이 늘 때 데드클릭이 재발한다.
interface Notif {
  id: string
  type: string
  room_id: string | null // 서버가 채우는 FK — vgen/dub/recording 완료 알림의 목적지
  payload: NotifPayload & {
    room_title?: string
    host_name?: string
    requester_name?: string | null // friend_request
    name?: string | null // friend_accepted
    job_id?: string // avatar_job_done|avatar_job_failed|vgen_job_*
    result_project_url?: string | null
  }
  read_at: string | null
}

// NOTI-PAGE: 한 번에 받아오는 개수. 예전엔 10개 고정이라 그 뒤 알림은 도달 경로가 아예 없었다.
const PAGE = 20

// 반응형 단일 인스턴스: 모바일=텍스트 버튼 / 데스크톱=원형 유리 칩(종 아이콘 — 헤더 바 없는
// 광장 위, 그림 가림 최소). 두 인스턴스 동시 마운트 금지 — 같은 채널 토픽 재구독으로 크래시.
export default function NotificationBell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const appUserId = useUserStore((s) => s.appUserId)
  const [items, setItems] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // 현재 페이지 크기를 ref 로 든다 — state 로 두면 [더 보기] 마다 아래 effect 가 다시 돌아
  // realtime 채널을 재구독한다(구독 해제/재개설 왕복이 곧 유실 창).
  const limitRef = useRef(PAGE)
  // 언마운트 후 도착하는 응답을 버린다(기존 cancelled 플래그와 같은 역할 — load 가 effect 밖
  // [더 보기]에서도 불리므로 effect 지역 변수로는 못 덮는다).
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, type, room_id, payload, read_at')
      .order('created_at', { ascending: false })
      .limit(limitRef.current + 1) // +1 = 다음 장 존재 탐지(별도 count 쿼리 없이)
    if (!data || !aliveRef.current) return
    setHasMore(data.length > limitRef.current)
    setItems(data.slice(0, limitRef.current) as Notif[])
  }, [])

  const loadMore = () => {
    limitRef.current += PAGE
    void load()
  }

  useEffect(() => {
    if (!appUserId) return
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
      void supabase.removeChannel(ch)
    }
  }, [appUserId, load])

  // A11Y-POPOVER: Esc·초기 포커스·트랩·복귀(바깥클릭만 있던 자리). 마크업은 그대로 — 로직만 공유.
  const panelRef = usePopoverA11y<HTMLDivElement>(open, () => setOpen(false))

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

  // 여는 것만으로 전부 읽음 처리하지 않는다(감사 #12) — 스크롤 아래 못 본 알림까지 지워져
  // 뱃지가 사라지면 그 알림은 두 번 다시 눈에 띄지 않는다. 읽음은 명시 버튼 또는 항목 클릭으로만.
  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)))
    // RLS 가 본인 행으로 한정하므로 user 필터 불요. is(null) 로 이미 읽은 건 건너뛴다.
    await supabase.from('notifications').update({ read_at: now }).in('id', ids).is('read_at', null)
  }

  const markAllRead = () => void markRead(items.filter((n) => !n.read_at).map((n) => n.id))

  const onItem = async (n: Notif) => {
    setOpen(false)
    if (!n.read_at) void markRead([n.id]) // 도착한 알림은 읽음 — 뱃지가 영원히 남지 않게.
    const target = resolveNotifTarget(n)
    if (!target) return // notifRouting 이 전수를 덮으므로 여기 오면 신규 type 미등록(테스트가 먼저 막는다)
    if (target.kind === 'navigate') {
      navigate(target.to)
      return
    }
    if (target.kind === 'friends') {
      // NOTI-FRIEND: 친구 패널은 벨과 같은 로비 헤더 — 이동이 아니라 열기다(수락/거절이 거기 있다).
      useFriendStore.getState().setPanelOpen(true)
      return
    }
    // roomIfLive: 팔로우 공연시작(PROFILE-05) — 방 상태 재검증 후 분기(UX-2, 델타 감사).
    //   종료/만석이면 데드엔드 대신 안내.
    const { data } = await supabase
      .from('public_rooms')
      .select('status, current_participants, max_participants')
      .eq('id', target.roomId)
      .maybeSingle()
    if (!data || data.status === 'ended') { toast.info(t('notif.roomEnded')); return }
    if ((data.current_participants ?? 0) >= (data.max_participants ?? 6)) { toast.info(t('notif.roomFull')); return }
    navigate(`/rooms/${target.roomId}/ready`)
  }

  const label = (n: Notif): string => {
    const host = n.payload.host_name ?? t('lobby.host')
    const room = n.payload.room_title ?? ''
    if (n.type === 're_invite') return t('notif.reInvite', { host, room })
    if (n.type === 'reservation_invite') return t('notif.reservationInvite', { host, room })
    if (n.type === 'reservation_reminder') return t('notif.reservationReminder', { room })
    // 취소 통지(LOB-06 취소) — 이게 없으면 label 이 타입 문자열로 새어나온다(:122 폴백).
    if (n.type === 'reservation_cancelled') return t('notif.reservationCancelled', { host, room })
    // RES-ROOM: 예약한 공연의 방이 실제로 열렸다 — 이 알림만 갈 방을 확실히 갖는다.
    if (n.type === 'reservation_room_open') return t('notif.reservationRoomOpen', { room })
    // FriendSystem(PROFILE-04/05)
    if (n.type === 'friend_request') return t('notif.friendRequest', { name: n.payload.requester_name ?? '?' })
    if (n.type === 'friend_accepted') return t('notif.friendAccepted', { name: n.payload.name ?? '?' })
    if (n.type === 'followed_creator_stream_start') return t('notif.streamStart', { host, room })
    // 아바타 포지(대기 UX) — 완료/실패, 클릭 시 의상실로.
    if (n.type === 'avatar_job_done') return t('notif.avatarJobDone')
    if (n.type === 'avatar_job_failed') return t('notif.avatarJobFailed')
    // 장수명 작업 완료(U1) — 화면을 떠나 있어도 여기 남는다.
    if (n.type === 'vgen_job_done') return t('notif.vgenJobDone')
    if (n.type === 'vgen_job_failed') return t('notif.vgenJobFailed')
    if (n.type === 'dub_output_ready') return t('notif.dubOutputReady')
    if (n.type === 'recording_ready') return t('notif.recordingReady', { room })
    return n.type
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
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
      {/* TOUCH-44: 모바일 전용 진입점인데 px-3 py-2 ≈36px 로 coarse 포인터 44px 에 못 미쳤다. */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t('lobby.notifications')}
        className="touch-target rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted hover:text-stage-text md:hidden"
      >
        {t('lobby.notifications')}
        {unread > 0 && (
          <span className="ml-1.5 rounded-full bg-fire-amber px-1.5 text-xs font-semibold text-stage-base">{unread}</span>
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t('lobby.notifications')}
          tabIndex={-1}
          className="absolute right-0 z-40 mt-2 max-h-[70vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-stage-border bg-stage-elevated py-1 shadow-lg"
        >
          {unread > 0 && (
            <div className="flex justify-end border-b border-stage-border px-2 pb-1">
              <button
                type="button"
                onClick={markAllRead}
                className="touch-target rounded px-2 text-xs text-stage-text-muted hover:text-stage-text"
              >
                {t('lobby.notifMarkAllRead')}
              </button>
            </div>
          )}
          {items.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stage-text-muted">{t('lobby.notifEmpty')}</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => void onItem(n)}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-stage-panel ${n.read_at ? 'text-stage-text-muted' : 'font-semibold text-stage-text'}`}
              >
                {label(n)}
              </button>
            ))
          )}
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              className="block w-full border-t border-stage-border px-3 py-2 text-center text-xs text-stage-text-muted hover:text-stage-text"
            >
              {t('lobby.notifMore')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
