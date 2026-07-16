import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/useToast'
import { acceptInvite, fetchPublicRooms, fetchPublicRoomsGuest, verifyInviteCode, type LobbyRoom } from '@/lib/rooms'
import LiveRail from '@/features/theater/LiveRail'
import CreateMenu from '@/components/shared/CreateMenu'
import NotificationBell from '@/components/shared/NotificationBell'
import AvatarForgePill from '@/features/avatar/AvatarForgePill'
import LanguageToggle from '@/components/shared/LanguageToggle'
import FriendsButton from '@/components/shared/FriendsButton'
import HubMap from '@/components/shared/HubMap'
import OnboardingGuide from '@/features/onboarding/OnboardingGuide'
import { resolveWorld, type HubDest } from '@/scenes/manifest'
import { useEffectiveWorld } from '@/stores/worldStore'

// 로비 v3(주인님 확정 스펙): 광장 허브가 화면의 전부 — 레거시 섹션(목록·생성·예약·최근)은
// 내부 4관(/lobby/theater·workshop·teahouse·atelier)으로 전가·삭제. 데스크톱은 헤더 바 없음
// (광장 가림·분위기 — 주인님 콜): 우상단 칩 클러스터(언어·로그아웃·벨 — 설정 이관 P0). 초대 배너(LOB-05)는
// 조건부 유지 / 모바일 = 제목+벨 헤더 + 배너 + 하단 네비 4탭(같은 라우트).
// v4(2026-07-16, UIUX-OVERHAUL P1): `/` 공개 광장 홈 — 비로그인도 렌더(치지직식 디스커버리).
// 게스트는 목록=list-public-rooms·칩=로그인 CTA·라이브 레일 관전 진입, 정식 세션은 기존 동선 그대로.
// rooms 는 대극장 뱃지·연습 무대 라우팅 + 라이브 레일 공용(Realtime nudge 포함).
export default function LobbyPage() {
  const { t } = useTranslation()
  // 광장 허브·액센트는 현재 세계관(worldStore)에서 — 로그인에서 이어진 그 월드.
  const worldId = useEffectiveWorld()
  const scene = useMemo(() => resolveWorld(worldId), [worldId])
  const session = useUserStore((s) => s.session)
  const user = useUserStore((s) => s.user)
  const ready = useUserStore((s) => s.ready)
  // named = 정식(비익명) 로그인. 익명 게스트 세션은 관전 전용이라 칩 클러스터·온보딩에서 게스트 취급.
  const named = !!session && user?.is_anonymous !== true
  const onboardingStep = useUserStore((s) => s.onboardingStep)
  const showOnboarding = named && (onboardingStep === 'intro' || onboardingStep === 'genre')
  const navigate = useNavigate()

  const [rooms, setRooms] = useState<LobbyRoom[]>([])

  const applyRooms = useCallback(async () => {
    try {
      setRooms(session ? await fetchPublicRooms() : await fetchPublicRoomsGuest())
    } catch {
      /* transient — 뱃지·연습 라우팅용이라 조용히 유지 */
    }
  }, [session])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = session ? await fetchPublicRooms() : await fetchPublicRoomsGuest()
        if (!cancelled) setRooms(data)
      } catch {
        /* 뱃지·연습 라우팅용 — 조용히 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session])

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

  // 초대 링크 비로그인 도달(구 ProtectedRoute 경로 보존): 로그인 후 초대가 살아 돌아오도록 from 에 쿼리째 보존.
  useEffect(() => {
    if (inviteCode && !session && ready) {
      navigate('/login', { replace: true, state: { from: `/?invite=${inviteCode}` } })
    }
  }, [inviteCode, session, ready, navigate])

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

  // 라이브 레일 입장(P1): 게스트=관전 고정(GuestWatchGate 경유), 정식 세션=대극장 enter 와 동일 분기.
  const enterFromRail = useCallback(
    (r: LobbyRoom) => {
      if (!named) {
        navigate(`/rooms/${r.id}?watch=1`)
        return
      }
      const full = r.currentParticipants >= r.maxParticipants
      if (full && !r.isLocked) navigate(`/rooms/${r.id}?watch=1`)
      else navigate(`/rooms/${r.id}/ready`)
    },
    [named, navigate],
  )

  // 세션 복원 판정 전 렌더 보류 — 로그인 사용자에게 게스트 뷰가 깜빡이는 것 방지(ProtectedRoute 동형).
  // 훅 선언 뒤에 위치(rules-of-hooks).
  if (!ready) return null

  return (
    <main
      className="relative min-h-screen bg-stage-base text-stage-text"
      style={{ '--scene-accent': scene.accent } as React.CSSProperties}
    >
      {/* 모바일 배경 = 데스크톱과 동일 광장(plaza hero, 현재 월드). */}
      <div aria-hidden className="fixed inset-0 md:hidden">
        <img
          src={scene.plaza.blocks[0].hero}
          alt=""
          draggable={false}
          className="h-full w-full select-none object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-stage-base/80 via-stage-base/60 to-stage-base/45" />
      </div>

      {/* 광장 전체화면(데스크톱): 3/2 씬이 뷰포트를 cover — % 핫스팟은 씬 기준이라 크롭돼도 정합. */}
      <div className="fixed inset-0 hidden overflow-hidden md:block">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: 'max(100vw, 150vh)', height: 'max(100vh, 66.7vw)' }}
        >
          <HubMap blocks={scene.plaza.blocks} roomsCount={roomsCount} onDest={handleDest} fullscreen />
        </div>
      </div>

      <div className="relative flex min-h-screen flex-col p-4 pb-24 md:pointer-events-none md:p-6 md:pb-6">
        {/* 모바일=제목+벨 / 데스크톱=벨 칩만 우측(광장이 화면의 전부). 벨은 단일 인스턴스 —
            반응형 렌더는 컴포넌트 내부(중복 마운트 = Realtime 채널 재구독 크래시). */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <h1 className="mr-auto text-2xl font-bold md:hidden">{t('lobby.title')}</h1>
          {/* 글로벌 [+ 만들기](P2) — 게스트에게도 노출(전환 CTA), 클릭 시 목적지 보존 로그인. */}
          <CreateMenu />
          {named ? (
            <>
              {/* 전역 진행 pill(대기 UX): 아바타 제작 중이면 광장에서도 보이고, 클릭하면 의상실로. 활성 잡 없으면 null. */}
              <AvatarForgePill />
              {/* 설정 이관(P0, 트랙 2): 의상실 v5 에서 제거된 언어·로그아웃을 광장 칩 클러스터로 — 별도 설정 패널 없이 배선만. */}
              {/* 친구(PROFILE-04, LoL식 로비 상시): 벨 옆 팝오버 — IA 결정(ROADMAP §찻집). */}
              <FriendsButton />
              <LanguageToggle />
              <button
                type="button"
                onClick={() => void useUserStore.getState().logout()}
                className="rounded px-2 py-1 text-sm text-stage-text/60 hover:text-stage-text"
              >
                {t('lobby.logout')}
              </button>
              <NotificationBell />
            </>
          ) : (
            <>
              {/* 게스트(비로그인·익명): 개인화 칩 대신 로그인 CTA 하나 — 구경은 자유, 참여는 로그인(LOB-07). */}
              <LanguageToggle />
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="rounded-lg bg-fire-amber px-4 py-1.5 text-sm font-bold text-stage-base hover:opacity-90"
              >
                {t('guest.loginCta')}
              </button>
            </>
          )}
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

        {/* 지금 열린 무대 레일(P1) — 좌하단 플로팅. 데스크톱은 광장 핫스팟을 가리지 않게 컴팩트 1장. */}
        <div className="mt-auto flex justify-start pt-4">
          <LiveRail rooms={rooms} onEnter={enterFromRail} onMore={() => navigate('/lobby/theater')} />
        </div>
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

      {showOnboarding && <OnboardingGuide />}
    </main>
  )
}
