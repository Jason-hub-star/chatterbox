import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { joinRoom, joinRoomAsViewer, joinRoomWithPassword } from '@/lib/rooms'
import { useRoomStore } from '@/stores/roomStore'
import { useStageStore } from '@/stores/stageStore'
import { useUserStore } from '@/stores/userStore'

export type JoinPhase = 'joining' | 'entering' | 'ready' | 'error' | 'password'
export type GatePhase = 'choose' | 'joining' | 'entering' | 'error' | 'password' | 'kicked'

// 입장·연결 라이프사이클(R-커밋 허브에서 분리, 2026-07-21 NR) — 조인 상태머신 + 멱등 재조인(RM-JOIN-RETRY)
// + 세션 중 종단 끊김 판별(RM-DEADROOM). kicked/kickReason 은 room-authority 수신·onKicked 도 세팅하므로
// setter 를 노출한다. roomLocked 는 HostConsole 이 읽고, leaving 은 onLeave 가 세팅한다.
export function useRoomJoin(roomId: string) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useUserStore((s) => s.session)
  const connectionState = useRoomStore((s) => s.connectionState)

  const [joinPhase, setJoinPhase] = useState<JoinPhase>('joining')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [kicked, setKicked] = useState(false)
  const [kickReason, setKickReason] = useState<string | null>(null) // 서버발 강퇴 사유(room-authority 'kicked')
  // 잠금방: join-public-room 이 "Room is locked" 로 거부하면 비번 입력 단계로. 입장 성공 시 roomLocked=true.
  const [roomLocked, setRoomLocked] = useState(false)
  // RM-JOIN-RETRY: bump 시 조인 effect 재발화(멱등 join). RM-DEADROOM 재연결도 이 경로 공유.
  const [rejoinNonce, setRejoinNonce] = useState(0)
  const [leaving, setLeaving] = useState(false) // onLeave 진행 중 — DISCONNECTED 방종료 모달 플래시 방지
  // RM-JOIN-ROLE: 입장 전 배우/관전 선택. ?watch=1(딥링크·초대) 은 관전 자동선택으로 게이트 건너뜀.
  // null 이면 게이트가 선택 화면을 띄우고, 조인 effect 는 선택 전까지 대기(자동 배우 입장 제거).
  const [roleChoice, setRoleChoice] = useState<'actor' | 'viewer' | null>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('watch') ? 'viewer' : null,
  )

  // 취소 버튼이 진행 중 join fetch 를 끊을 수 있게 컨트롤러를 ref 로 노출.
  const joinAbortRef = useRef<AbortController | null>(null)

  // 입장 연출(U-6): join 성공 → 네온 green 'entering' 을 잠깐 경유 후 ready. reduced-motion=즉시.
  const enterWithGreen = useCallback((isStale?: () => boolean) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setJoinPhase('ready')
      return
    }
    setJoinPhase('entering')
    window.setTimeout(() => {
      if (!isStale?.()) setJoinPhase('ready')
    }, 650)
  }, [])

  useEffect(() => {
    if (!session || !roomId || !roleChoice) return // 선택 전(roleChoice null)엔 대기 — 게이트가 선택 화면
    let cancelled = false
    const ac = new AbortController()
    joinAbortRef.current = ac
    ;(async () => {
      setJoinPhase('joining')
      try {
        // 관전 입장(ViewerGate MVP): 좌석 비점유·발행권 없음. 이미 뷰어로 조인된 상태라면 어느 경로든
        // rejoined 가 실제 role 을 돌려주므로(마이그 v2) myRole 은 항상 서버 진실.
        const r = roleChoice === 'viewer'
          ? await joinRoomAsViewer(session.access_token, roomId, ac.signal)
          : await joinRoom(session.access_token, roomId, ac.signal)
        if (cancelled) return
        useRoomStore.getState().setRoomContext({
          currentRoomId: roomId,
          myParticipantId: r.participant_id,
          mySlotIndex: r.slot_index,
          myRole: r.role === 'viewer' ? 'viewer' : 'actor',
        })
        enterWithGreen(() => cancelled)
      } catch (e) {
        if (cancelled) return
        if (e instanceof DOMException && e.name === 'AbortError') return // 사용자 취소 — 내비게이션이 처리
        const msg = e instanceof Error ? e.message : ''
        if (msg === 'Room is locked') { setJoinPhase('password'); return } // 비번 입력 단계로
        // RM-JOIN-RETRY: 기술 원문(Forbidden/Room ended…) 대신 원인별 친화 카피.
        const friendly =
          msg === 'Room ended' ? t('notif.roomEnded')
            : msg === 'Room not found' ? t('room.roomNotFound')
              : /full/i.test(msg) ? t('notif.roomFull')
                : (msg || t('room.joinError'))
        setJoinError(friendly)
        setJoinPhase('error')
      }
    })()
    return () => {
      cancelled = true
      ac.abort() // 언마운트/재조인 시 고아 fetch 정리
      useStageStore.getState().clearMainVideo() // 방 이탈/전환 시 공유 영상 초기화
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t 는 안정적, 언어 변경 시 재조인 방지 위해 제외
  }, [session, roomId, rejoinNonce, roleChoice])

  // RM-JOIN-ROLE: 게이트 선택 → 조인 effect 발화(배우/관전). 선택 후 재조인(retry)은 roleChoice 유지 → 무재프롬프트.
  const chooseRole = useCallback((role: 'actor' | 'viewer') => setRoleChoice(role), [])

  // 잠금방 비번 입장. 성공 시 roomLocked=true(호스트면 콘솔에 잠금 상태 반영). 실패는 throw — RoomJoinGate 소유.
  const submitJoinPassword = useCallback(async (password: string) => {
    if (!session) throw new Error('no session')
    const r = await joinRoomWithPassword(session.access_token, roomId, password)
    useRoomStore.getState().setRoomContext({
      currentRoomId: roomId,
      myParticipantId: r.participant_id,
      mySlotIndex: r.slot_index,
      myRole: r.role === 'viewer' ? 'viewer' : 'actor',
    })
    setRoomLocked(true)
    enterWithGreen()
  }, [session, roomId, enterWithGreen])

  // RM-JOIN-RETRY / RM-DEADROOM: 이탈 없이 재조인 — 조인 실패 재시도 + 세션 중 끊김 재연결 공유.
  const retryJoin = useCallback(() => {
    setJoinError(null)
    setKicked(false)
    setKickReason(null)
    setJoinPhase('joining')
    setRejoinNonce((n) => n + 1)
  }, [])

  const cancelJoin = useCallback(() => {
    joinAbortRef.current?.abort()
    navigate('/lobby', { replace: true })
  }, [navigate])

  // 입장 게이트: kicked 우선 → 역할 미선택이면 'choose' → joinPhase(ready 이외). ready면 null(무대 렌더).
  const gatePhase: GatePhase | null = kicked
    ? 'kicked'
    : !roleChoice
      ? 'choose'
      : joinPhase !== 'ready'
        ? joinPhase
        : null
  // RM-DEADROOM: 세션 중 연결 종단 끊김(RECONNECTING 순단 제외). 강퇴는 gate 가, 이탈 중은 스킵.
  const deadRoom = !kicked && !leaving && connectionState === 'DISCONNECTED'

  return {
    joinPhase,
    gatePhase,
    deadRoom,
    joinError,
    kicked,
    setKicked,
    kickReason,
    setKickReason,
    roomLocked,
    setRoomLocked,
    retryJoin,
    submitJoinPassword,
    cancelJoin,
    setLeaving,
    chooseRole,
  }
}
