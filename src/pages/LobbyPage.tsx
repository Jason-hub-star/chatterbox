import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/useToast'
import { acceptInvite, fetchPublicRooms, verifyInviteCode, type LobbyRoom } from '@/lib/rooms'
import NotificationBell from '@/components/shared/NotificationBell'
import HubMap from '@/components/shared/HubMap'
import { SCENES, resolveScene, type HubDest } from '@/scenes/manifest'

// 로비 v3(주인님 확정 스펙): 광장 허브가 화면의 전부 — 레거시 섹션(목록·생성·예약·최근)은
// 내부 4관(/lobby/theater·workshop·teahouse·atelier)으로 전가·삭제. 데스크톱은 헤더 바 없음
// (광장 가림·분위기 — 주인님 콜): 벨 칩만 우상단, 로그아웃은 의상실로. 초대 배너(LOB-05)는
// 조건부 유지 / 모바일 = 제목+벨 헤더 + 배너 + 하단 네비 4탭(같은 라우트).
// rooms 는 대극장 뱃지·연습 무대 라우팅용 최소 유지(Realtime nudge 포함).
export default function LobbyPage() {
  const { t } = useTranslation()
  const [scene] = useState(() => resolveScene(SCENES.lobbyStreet, new Date().getHours()))
  const session = useUserStore((s) => s.session)
  const navigate = useNavigate()

  const [rooms, setRooms] = useState<LobbyRoom[]>([])

  const applyRooms = useCallback(async () => {
    try {
      setRooms(await fetchPublicRooms())
    } catch {
      /* transient — 뱃지·연습 라우팅용이라 조용히 유지 */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchPublicRooms()
        if (!cancelled) setRooms(data)
      } catch {
        /* 뱃지·연습 라우팅용 — 조용히 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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

  const handleDest = useCallback(
    (dest: HubDest) => {
      switch (dest) {
        case 'rooms':
          navigate('/lobby/theater')
          break
        case 'create':
          navigate('/lobby/workshop')
          break
        case 'social':
          navigate('/lobby/teahouse')
          break
        case 'profile':
          navigate('/lobby/atelier')
          break
        case 'practice': {
          const practice = rooms.find((r) => r.isPractice)
          if (practice) navigate(`/rooms/${practice.id}/ready`)
          else toast.info(t('hub.practiceClosed'))
          break
        }
        case 'troupe':
          toast.info(t('hub.troupeSoon'))
          break
        case 'reserved':
          toast.info(t('hub.reservedHint'))
          break
      }
    },
    [rooms, navigate, t],
  )

  // 초대링크 수락(LOB-05): ?invite=<code> → read-only 검증 → 배너 → 수락 → 분장실/관전.
  const [searchParams, setSearchParams] = useSearchParams()
  const inviteCode = searchParams.get('invite')
  const [invite, setInvite] = useState<{ code: string; title: string; host: string | null } | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)

  useEffect(() => {
    if (!inviteCode || !session) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await verifyInviteCode(session.access_token, inviteCode)
        if (!cancelled) setInvite({ code: inviteCode, title: r.title, host: r.host_display_name })
      } catch (e) {
        if (!cancelled) {
          // verify-invite-code 는 revoked/expired/used_up/room_ended 를 error 문자열로 구분 응답
          // (edgeFn 이 Error.message 로 보존) — 원인별 안내로 "왜 안 되는지"를 알린다.
          const msg = e instanceof Error ? e.message : ''
          const key =
            msg === 'expired' ? 'lobby.inviteExpired'
              : msg === 'revoked' ? 'lobby.inviteRevoked'
                : msg === 'used_up' ? 'lobby.inviteUsedUp'
                  : msg === 'room_ended' ? 'lobby.inviteRoomEnded'
                    : 'lobby.inviteInvalid'
          toast.error(t(key))
          setInvite(null)
          setSearchParams({}, { replace: true })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [inviteCode, session, t, setSearchParams])

  async function onAcceptInvite() {
    if (!invite || !session) return
    setInviteBusy(true)
    try {
      const r = await acceptInvite(session.access_token, invite.code)
      navigate(r.role === 'viewer' ? `/rooms/${r.room_id}?watch=1` : `/rooms/${r.room_id}/ready`)
    } catch {
      toast.error(t('lobby.inviteInvalid'))
      setInvite(null)
      setSearchParams({}, { replace: true })
      setInviteBusy(false)
    }
  }

  const roomsCount = rooms.filter((r) => !r.isPractice).length

  return (
    <main
      className="relative min-h-screen bg-stage-base text-stage-text"
      style={scene ? ({ '--scene-accent': scene.accent } as React.CSSProperties) : undefined}
    >
      {/* 모바일 배경 = 데스크톱과 동일 광장(plaza). 레거시 거리(scene.hero=lobby-street/day)가
          아니라 hub hero 로 통일 — 광장 재편 후 모바일에 구 거리가 남던 잔재 제거. */}
      {scene && (
        <div aria-hidden className="fixed inset-0 md:hidden">
          <img
            src={scene.hub?.blocks[0]?.hero ?? scene.hero}
            alt=""
            draggable={false}
            className="h-full w-full select-none object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-stage-base/80 via-stage-base/60 to-stage-base/45" />
        </div>
      )}

      {/* 광장 전체화면(데스크톱): 3/2 씬이 뷰포트를 cover — % 핫스팟은 씬 기준이라 크롭돼도 정합. */}
      {scene?.hub && (
        <div className="fixed inset-0 hidden overflow-hidden md:block">
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: 'max(100vw, 150vh)', height: 'max(100vh, 66.7vw)' }}
          >
            <HubMap blocks={scene.hub.blocks} roomsCount={roomsCount} onDest={handleDest} fullscreen />
          </div>
        </div>
      )}

      <div className="relative flex min-h-screen flex-col p-4 pb-24 md:pointer-events-none md:p-6 md:pb-6">
        {/* 모바일=제목+벨 / 데스크톱=벨 칩만 우측(광장이 화면의 전부). 벨은 단일 인스턴스 —
            반응형 렌더는 컴포넌트 내부(중복 마운트 = Realtime 채널 재구독 크래시). */}
        <div className="pointer-events-auto flex items-center justify-end">
          <h1 className="mr-auto text-2xl font-bold md:hidden">{t('lobby.title')}</h1>
          <NotificationBell />
        </div>

        {invite && (
          <section className="pointer-events-auto mt-4 max-w-sm rounded-lg border border-fire-amber/40 bg-stage-base/80 px-4 py-3 backdrop-blur">
            <p className="text-sm font-semibold">{t('lobby.inviteFrom', { host: invite.host ?? t('lobby.host') })}</p>
            <p className="mt-0.5 truncate text-sm text-stage-text-muted">{invite.title}</p>
            <button
              onClick={() => void onAcceptInvite()}
              disabled={inviteBusy}
              className="mt-2 rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {inviteBusy ? t('lobby.inviteJoining') : t('lobby.inviteJoin')}
            </button>
          </section>
        )}

        {/* 모바일: 광장은 배경이 담당(위 fixed) — 중복 배너 제거. 기능 접근은 하단 네비. */}
      </div>

      {/* 모바일 하단 네비 — 내부 4관 라우트 직행. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-stage-border bg-stage-panel/95 backdrop-blur md:hidden">
        <button onClick={() => navigate('/lobby/theater')} className="flex-1 px-2 py-3 text-xs text-stage-text-muted hover:text-stage-text">
          {t('hub.navRooms')}
        </button>
        <button onClick={() => navigate('/lobby/workshop')} className="flex-1 px-2 py-3 text-xs text-stage-text-muted hover:text-stage-text">
          {t('hub.navCreate')}
        </button>
        <button onClick={() => navigate('/lobby/theater?tab=ticket')} className="flex-1 px-2 py-3 text-xs text-stage-text-muted hover:text-stage-text">
          {t('hub.navReserve')}
        </button>
        <button onClick={() => navigate('/lobby/atelier')} className="flex-1 px-2 py-3 text-xs text-stage-text-muted hover:text-stage-text">
          {t('hub.navSettings')}
        </button>
      </nav>
    </main>
  )
}
