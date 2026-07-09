import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLiveKitRoom } from '@/hooks/useLiveKitRoom'
import { useRoomStore } from '@/stores/roomStore'
import { useReactionStore } from '@/stores/reactionStore'
import { useUserStore } from '@/stores/userStore'
import { joinRoom, joinRoomAsViewer, joinRoomWithPassword, leaveRoom, kickParticipant, setParticipantMute, setRoomPassword, setRoomBackground, raiseHand, inviteToStage, acceptStageInvite, createRoomInvite, listRecentPeople, scriptRoleAction, setScriptMode } from '@/lib/rooms'
import { applyRoleEvent, isRoleEvent, pruneRoleMap, roleOf, type RoleMap } from '@/features/script/roleMap'
import { toast } from '@/hooks/useToast'
import { getVgenUrl } from '@/lib/vgen'
import { useStageStore } from '@/stores/stageStore'
import { fetchRoomMembers, fetchRoomHostId } from '@/lib/dub'
import { resolveAvatarUrl } from '@/lib/avatars'
import { isNewerSeq, type BlendshapeFrame } from '@/lib/blendshapeCodec'
import Stage from '@/features/stage/Stage'
import ReactionWheel from '@/features/reaction/ReactionWheel'
import ReactionOverlay from '@/features/reaction/ReactionOverlay'
import type { RemoteFrameSink } from '@/features/avatar/RemoteAvatar'
import DubPanel from '@/features/dub/DubPanel'
import VgenStatusTab from '@/features/vgen/VgenStatusTab'
import ScriptPanel from '@/features/script/ScriptPanel'
import { supabase } from '@/lib/supabase'
import ChatPanel from '@/features/chat/ChatPanel'
import RightPanel, { type RightPanelTab } from '@/features/room/RightPanel'
import HostConsole from '@/features/room/HostConsole'
import CampfireGlyph from '@/components/shared/CampfireGlyph'
import Modal from '@/components/shared/Modal'
import { SEED_SCRIPTS } from '@/features/script/cues'
import RoomShell from '@/features/room/RoomShell'
import RoomTopBar from '@/features/room/RoomTopBar'
import RoomBottomBar from '@/features/room/RoomBottomBar'

// Phase 1B PoC → 우측 패널 셸 도입: 채팅·DUB·VGen 을 RightPanel 탭 블록으로 통합(contracts/RightPanel.md).
// 좌측 컬럼 = 참가자·무대·대본 텔레프롬프터·마이크/나가기. 우측 = RightPanel(탭 콘텐츠 주입식).
// 경로 B: 아바타는 네이티브 아리아 실 rig. 참가자별 avatar URL(users.avatar_url) — 미설정은 기본 아바타(resolveAvatarUrl).

export default function RoomPage() {
  const { t } = useTranslation()

  const { roomId = '' } = useParams()
  const navigate = useNavigate()
  const session = useUserStore((s) => s.session)
  const myAvatarUrl = useUserStore((s) => s.avatarUrl)
  const appUserId = useUserStore((s) => s.appUserId)
  const hostId = useRoomStore((s) => s.hostId)
  const myIdentity = session?.user?.id ?? '' // LiveKit identity = auth uid

  // 입장 단계: LiveKit 연결 전에 반드시 room_participants 행을 만든다(멱등).
  // livekit-token 게이트가 활성 참가자 행을 요구하므로, join 성공 후에만 연결(enabled).
  const [joinPhase, setJoinPhase] = useState<'joining' | 'ready' | 'error' | 'password'>('joining')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [kicked, setKicked] = useState(false)
  const [kickReason, setKickReason] = useState<string | null>(null) // 서버발 강퇴 사유(room-authority 'kicked') — 표시는 kicked 게이트
  // 잠금방: join-public-room 이 "Room is locked" 로 거부하면 비번 입력 단계로. 입장 성공 시 roomLocked=true.
  const [roomLocked, setRoomLocked] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [pwPhaseBusy, setPwPhaseBusy] = useState(false)
  const [pwPhaseErr, setPwPhaseErr] = useState<string | null>(null)

  // 취소 버튼(트랙 B)이 진행 중 join fetch 를 끊을 수 있게 컨트롤러를 ref 로 노출.
  const joinAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    if (!session || !roomId) return
    let cancelled = false
    const ac = new AbortController()
    joinAbortRef.current = ac
    ;(async () => {
      setJoinPhase('joining')
      try {
        // ?watch=1 → 관전 입장(ViewerGate MVP): 좌석 비점유·발행권 없음. 이미 뷰어로 조인된 상태라면
        // 어느 경로든 rejoined 가 실제 role 을 돌려주므로(마이그 v2) myRole 은 항상 서버 진실.
        const watch = new URLSearchParams(window.location.search).has('watch')
        const r = watch
          ? await joinRoomAsViewer(session.access_token, roomId, ac.signal)
          : await joinRoom(session.access_token, roomId, ac.signal)
        if (cancelled) return
        useRoomStore.getState().setRoomContext({
          currentRoomId: roomId,
          myParticipantId: r.participant_id,
          mySlotIndex: r.slot_index,
          myRole: r.role === 'viewer' ? 'viewer' : 'actor',
        })
        setJoinPhase('ready')
      } catch (e) {
        if (cancelled) return
        if (e instanceof DOMException && e.name === 'AbortError') return // 사용자 취소 — 내비게이션이 처리(에러 화면 금지)
        const msg = e instanceof Error ? e.message : ''
        if (msg === 'Room is locked') { setJoinPhase('password'); return } // 비번 입력 단계로
        setJoinError(msg || t('room.joinError'))
        setJoinPhase('error')
      }
    })()
    return () => {
      cancelled = true
      ac.abort() // 언마운트/재조인 시 고아 fetch 정리
      useStageStore.getState().clearMainVideo() // 방 이탈/전환 시 공유 영상 초기화
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t 는 안정적, 언어 변경 시 재조인 방지 위해 제외
  }, [session, roomId])

  // 원격 아바타 프레임 싱크(participant identity → 구동 함수)와 마지막 seq. 고빈도 구동은 ref로만(리렌더 없음).
  // 싱크는 RemoteAvatar가 자기 RigAvatar+드라이버로 등록 — RoomPage는 아바타 타입을 모른다(디커플).
  const remoteAvatars = useRef<Map<string, RemoteFrameSink>>(new Map())
  const lastSeq = useRef<Map<string, number>>(new Map())
  const handleBlendshapes = useCallback((identity: string, frame: BlendshapeFrame) => {
    if (!isNewerSeq(lastSeq.current.get(identity) ?? 0, frame.seq)) return // 역전·중복 드롭
    lastSeq.current.set(identity, frame.seq)
    // RT-02 프레임엔 head pose 없음 → 싱크가 headPose=null로 구동(gaze는 blendshape이라 반영).
    remoteAvatars.current.get(identity)?.(frame)
  }, [])

  // 연습 방(LOB-10): 시스템 호스트라 아무도 host 가 아님 — 대본 진행권을 참가자 전원에게(서버도 동일 예외).
  const isPracticeRef = useRef(false)
  const [isPractice, setIsPractice] = useState(false)
  // 방 메타(이름·장르): 상단바에 표시
  const [roomName, setRoomName] = useState('')
  const [roomGenre, setRoomGenre] = useState('')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('public_rooms')
        .select('is_practice, title, genre')
        .eq('id', roomId)
        .maybeSingle()
      if (!cancelled && data) {
        setIsPractice(!!data.is_practice)
        isPracticeRef.current = !!data.is_practice
        setRoomName(data.title || '')
        setRoomGenre(data.genre || '')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [roomId])

  // 대본 텔레프롬프터: 호스트가 진행한 cue_index 를 수신 → 전원이 같은 위치를 본다.
  const [cueIndex, setCueIndex] = useState(0)
  // 역할 클레임 맵(ROOM-14): 쓰기 경로는 서버 릴레이 수신뿐(자기 액션도 서버 echo 로 반영 → 전 클라 순서 일치).
  const [roleMap, setRoleMap] = useState<RoleMap>({})
  const handleScriptRole = useCallback((payload: unknown) => {
    if (!isRoleEvent(payload)) return // 형태 방어(변조 페이로드 드롭)
    setRoleMap((m) => applyRoleEvent(m, payload))
  }, [])
  // 대본 모드(ROOM-14): 서버 진실(rooms.script_mode) — 입장 시 로드 + room-authority 로 실시간 동기.
  const [scriptMode, setScriptModeLocal] = useState<'rehearsal' | 'performance'>('performance')
  // handleCue 는 stable 콜백이라 ref 로 현재 모드를 읽는다(연습 방 ref 와 동형).
  const scriptModeRef = useRef(scriptMode)
  useEffect(() => { scriptModeRef.current = scriptMode }, [scriptMode])
  // 수신 방어: 다른 씬 메시지 무시 + cueIndex 범위 클램프(변조·스테일·멀티씬 대비).
  const handleCue = useCallback((p: { sceneId: string; cueIndex: number }) => {
    // 본공연: 진행자는 호스트뿐 — 호스트는 자기 진행이 소스(로컬 갱신)라 서버 self-echo 를 무시해 회귀 방지(SEC-5).
    // 연습 방·리허설: 전원이 진행자 — 호스트도 남의 진행을 받아야 하므로 스킵 없음(자기 echo 는 같은 값 → 멱등).
    // (2026-07-09 프로드 2탭 E2E 가 잡은 버그: 리허설에서 배우 진행이 호스트에 영원히 미반영 → 모드 조건 추가.)
    if (!isPracticeRef.current && scriptModeRef.current !== 'rehearsal' && useRoomStore.getState().mySlotIndex === 0) return
    const sc = SEED_SCRIPTS[0]
    if (p.sceneId !== sc.id) return
    setCueIndex(Math.max(0, Math.min(sc.cues.length - 1, p.cueIndex)))
  }, [])

  // 무대 배경 초기 로드(HOST-04·05): 입장 후(멤버 RLS) rooms.background_url 을 읽어 이미 설정된 배경을 반영.
  // 이후 변경은 room-authority bg_change 로 실시간 동기. 방 이탈 시 초기화(다음 방 배경 잔상 방지).
  useEffect(() => {
    if (joinPhase !== 'ready') return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('rooms').select('background_url, script_mode').eq('id', roomId).maybeSingle()
      if (!cancelled && data) {
        useStageStore.getState().setBackground((data.background_url as string | null) ?? null)
        // 대본 모드 초기 동기(ROOM-14) — 이후 변경은 room-authority script_mode 로.
        if (data.script_mode === 'rehearsal' || data.script_mode === 'performance') setScriptModeLocal(data.script_mode)
      }
    })()
    return () => {
      cancelled = true
      useStageStore.getState().setBackground(null)
    }
  }, [joinPhase, roomId])

  // VGEN 공유재생(VGEN-04): 호스트가 방송한 jobId 로 각자 서명 URL 을 발급받아 센터 MainView 에 재생.
  const playSharedVgen = useCallback(async (jobId: string) => {
    if (!session) return
    try {
      const url = await getVgenUrl(session.access_token, jobId)
      useStageStore.getState().setMainVideo(url, jobId)
    } catch { /* 접근 불가·미완성 → 무시(서버 get-vgen-url 이 멤버십·visibility 게이트) */ }
  }, [session])
  // 손들기 큐(ROOM-20): 호스트가 보는 손든 관객 목록 + 본인 손들기 상태. raise_hand broadcast 수신 시 refetch 카운터로 재조회.
  const [raisedHands, setRaisedHands] = useState<{ authId: string; userId: string; name: string | null }[]>([])
  const [raiseHandRefetch, setRaiseHandRefetch] = useState(0)
  const [handRaised, setHandRaised] = useState(false)
  const [reconnectNonce, setReconnectNonce] = useState(0) // 승격 시 ++ → useLiveKitRoom 재연결(새 토큰 canPublish=true)
  const [stageInvite, setStageInvite] = useState(false)   // 무대 초대 수락 모달(대상 본인만)
  const handleRoomAuthority = useCallback((msg: { type: string; jobId?: string; url?: string | null; mode?: string; target_auth_id?: string; auth_id?: string; slot_index?: number | null; reason?: string }) => {
    if (msg.type === 'vgen_result' && typeof msg.jobId === 'string') void playSharedVgen(msg.jobId)
    else if (msg.type === 'vgen_stop') useStageStore.getState().clearMainVideo()
    else if (msg.type === 'bg_change') useStageStore.getState().setBackground(msg.url ?? null)
    else if (msg.type === 'script_mode') {
      // 대본 모드 전환(ROOM-14, set-script-mode Edge 발). 호스트 자신도 echo 를 받지만 같은 값 → 멱등.
      if (msg.mode === 'rehearsal' || msg.mode === 'performance') setScriptModeLocal(msg.mode)
    }
    else if (msg.type === 'raise_hand') setRaiseHandRefetch((n) => n + 1) // 손든 관객 변동 → 큐 재조회(호스트 UI)
    else if (msg.type === 'kicked') {
      // 강퇴 사유(HOST-01): 서버(kick-participant)가 절단 직전 대상에게만 전송(destinationIdentities).
      // 표시는 kicked 상태(PARTICIPANT_REMOVED)에 게이트 — 참가자 스푸핑만으로는 화면에 못 띄운다.
      if (typeof msg.reason === 'string' && msg.reason) setKickReason(msg.reason.slice(0, 200))
    }
    else if (msg.type === 'stage_invite') {
      // 무대 초대(ROOM-21) — 대상 본인만 수락 모달, 다른 참가자는 무시.
      if (msg.target_auth_id === useUserStore.getState().user?.id) setStageInvite(true)
    } else if (msg.type === 'promoted') {
      setRaiseHandRefetch((n) => n + 1) // 전원 좌석 갱신(승격자 새 slot 반영)
      if (msg.auth_id === useUserStore.getState().user?.id) {
        // 본인 승격 → actor 전환 + 재연결(새 토큰 canPublish=true). 수락 모달 닫기.
        setStageInvite(false)
        useRoomStore.getState().setRoomContext({ myRole: 'actor', mySlotIndex: msg.slot_index ?? null })
        setReconnectNonce((n) => n + 1)
      }
    }
  }, [playSharedVgen])

  const { toggleMic, sendChat, sendBlendshapes, sendCue, sendRoomAuthority, sendReaction, leave } = useLiveKitRoom(roomId, {
    onBlendshapes: handleBlendshapes,
    onCue: handleCue,
    onRoomAuthority: handleRoomAuthority,
    onScriptRole: handleScriptRole,
    enabled: joinPhase === 'ready',
    onKicked: () => setKicked(true),
    reconnectNonce,
  })

  const connectionState = useRoomStore((s) => s.connectionState)
  const participants = useRoomStore((s) => s.participants)
  // 관전 모드(서버 진실): 무대에서 내 좌석·카메라·마이크가 없다 — SelfAvatar 미마운트로 웹캠 요청 자체가 없음.
  const isViewer = useRoomStore((s) => s.myRole) === 'viewer'
  const micEnabled = useRoomStore((s) => s.micEnabled)
  const mutedByHost = useRoomStore((s) => s.mutedByHost)
  const error = useRoomStore((s) => s.error)

  const connected = connectionState === 'CONNECTED'

  // 라이브 경과 시간(클라이언트 타이머) — connected 시점부터 카운트.
  const connectedAtRef = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState('00:00:00')
  useEffect(() => {
    if (connected) {
      if (!connectedAtRef.current) {
        connectedAtRef.current = Date.now()
      }
    } else {
      connectedAtRef.current = null
    }
  }, [connected])

  useEffect(() => {
    if (!connectedAtRef.current) return
    const timer = setInterval(() => {
      const ms = Date.now() - (connectedAtRef.current ?? 0)
      const s = Math.floor(ms / 1000)
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = s % 60
      setElapsed(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // 떠난 참가자의 seq 추적을 정리한다. (안 지우면 같은 identity로 재입장 시 옛 seq가 남아
  // 새 프레임을 전부 stale로 드롭 → 아바타 프리즈.)
  useEffect(() => {
    const present = new Set(participants.map((p) => p.identity))
    for (const id of lastSeq.current.keys()) {
      if (!present.has(id)) lastSeq.current.delete(id)
    }
  }, [participants])

  // 참가자별 아바타: LiveKit identity(=auth uid)로 각 멤버의 avatar_url 을 찾는다.
  // memberKey(정렬된 identity 문자열)로만 재조회 — participants 참조는 발화/메타 이벤트마다 바뀌므로
  // 멤버 집합이 실제로 바뀔 때(입장/퇴장)에만 list-room-members 를 호출한다(불필요 재조회 방지).
  // ponytail: 세션 중 아바타 변경 실시간 전파는 후속(현재는 멤버 변동 시 반영).
  const memberKey = participants.map((p) => p.identity).sort().join(',')
  const [memberAvatars, setMemberAvatars] = useState<Record<string, string | null>>({})
  const [memberSlots, setMemberSlots] = useState<Record<string, number>>({})
  const [mutedIdentities, setMutedIdentities] = useState<Set<string>>(new Set())
  const [actorIds, setActorIds] = useState<Set<string>>(new Set()) // 배우만(호스트 역할 배정 후보 — 관전자 제외)
  useEffect(() => {
    if (joinPhase !== 'ready' || !session) return
    let cancelled = false
    ;(async () => {
      try {
        // 참가자 변동(memberKey)마다 재실행 — 호스트 퇴장도 참가자 변동이므로 hostId 가 새 호스트로 갱신된다(A-FUNC-3 이양).
        const [members, newHostId] = await Promise.all([
          fetchRoomMembers(session.access_token, roomId),
          fetchRoomHostId(roomId),
        ])
        if (cancelled) return
        const avatars: Record<string, string | null> = {}
        const slots: Record<string, number> = {}
        const muted = new Set<string>()
        const actorSet = new Set<string>()
        const raised: { authId: string; userId: string; name: string | null; at: string }[] = []
        for (const m of members) {
          avatars[m.authId] = m.avatarUrl
          slots[m.authId] = m.slotIndex // 절대좌석용(identity=auth uid)
          if (m.mutedByHost) muted.add(m.authId)
          if (m.role !== 'viewer') actorSet.add(m.authId) // 역할 배정 후보(ROOM-14)
          if (m.raiseHandAt) raised.push({ authId: m.authId, userId: m.userId, name: m.displayName, at: m.raiseHandAt })
        }
        raised.sort((a, b) => a.at.localeCompare(b.at)) // 시간순(먼저 든 사람 위)
        setMemberAvatars(avatars)
        setMemberSlots(slots)
        setMutedIdentities(muted)
        setActorIds(actorSet)
        setRaisedHands(raised.map(({ authId, userId, name }) => ({ authId, userId, name })))
        useRoomStore.getState().setRoomContext({ hostId: newHostId })
        // mute 마운트 로드(A-FUNC-3): 새로고침 후에도 내 muted_by_host 를 서버 진실로 재동기(desync 제거).
        const myAuthId = useUserStore.getState().user?.id
        if (myAuthId) {
          useRoomStore.getState().setMutedByHost(muted.has(myAuthId))
          setHandRaised(raised.some((r) => r.authId === myAuthId)) // 내 손들기도 서버 진실로 동기(새로고침 desync 제거)
          // 내 역할·좌석도 서버 진실로 동기 — 승격(ROOM-21) 재연결 시 cleanup reset() 후 myRole 복원(무대 등단 반영).
          const mine = members.find((m) => m.authId === myAuthId)
          if (mine) useRoomStore.getState().setRoomContext({ myRole: mine.role === 'viewer' ? 'viewer' : 'actor', mySlotIndex: mine.slotIndex })
        }
      } catch { /* 명단 조회 실패 → 기본 아바타 fallback + slot 미상은 임시배치 */ }
    })()
    return () => { cancelled = true }
  }, [joinPhase, session, roomId, memberKey, raiseHandRefetch])

  const selfProjectUrl = resolveAvatarUrl(myAvatarUrl)
  const remoteProjectUrl = useCallback(
    (identity: string) => resolveAvatarUrl(memberAvatars[identity]),
    [memberAvatars],
  )
  const slotOf = useCallback((identity: string) => memberSlots[identity], [memberSlots])

  // 리액션 휠: 무대 우클릭(button 2)으로 커서 위치에 개화(홀드-드래그-릴리즈). origin=null=닫힘.
  const [reactionOrigin, setReactionOrigin] = useState<{ x: number; y: number } | null>(null)
  const [reactionSticky, setReactionSticky] = useState(false) // 터치 개화는 sticky(탭 선택) 모드로 시작
  const openReactionWheel = useCallback((e: MouseEvent) => {
    if (e.button !== 2) return
    e.preventDefault()
    setReactionSticky(false)
    setReactionOrigin({ x: e.clientX, y: e.clientY })
  }, [])
  const closeReactionWheel = useCallback(() => setReactionOrigin(null), [])

  // 터치 롱프레스(≥500ms) → 휠 sticky 개화(P-5 — 우클릭의 모바일 등가). 10px 이동 = 스크롤 의도 → 취소.
  const touchTimer = useRef<number | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const touchFired = useRef(false)
  const cancelStageTouch = useCallback(() => {
    if (touchTimer.current != null) { clearTimeout(touchTimer.current); touchTimer.current = null }
  }, [])
  const onStageTouchStart = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length !== 1) return
    const t0 = e.touches[0]
    touchStart.current = { x: t0.clientX, y: t0.clientY }
    touchFired.current = false
    touchTimer.current = window.setTimeout(() => {
      touchTimer.current = null
      touchFired.current = true
      setReactionSticky(true)
      setReactionOrigin(touchStart.current)
    }, 500)
  }, [])
  const onStageTouchMove = useCallback((e: ReactTouchEvent) => {
    const s = touchStart.current
    if (!s || touchTimer.current == null) return
    const t0 = e.touches[0]
    if (Math.hypot(t0.clientX - s.x, t0.clientY - s.y) > 10) cancelStageTouch()
  }, [cancelStageTouch])
  const onStageTouchEnd = useCallback((e: ReactTouchEvent) => {
    cancelStageTouch()
    // 개화 직후의 합성 마우스 이벤트 억제 — 없으면 mousedown 이 sticky 백드롭을 즉시 닫는다.
    if (touchFired.current) e.preventDefault()
  }, [cancelStageTouch])

  // 숫자키 1~N 핫키(P-5): 입력 필드 밖에서 숫자키 → 해당 슬롯 리액션 즉발(휠 안 거침).
  useEffect(() => {
    if (!connected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return
      const n = Number(e.key)
      if (!Number.isInteger(n) || n < 1 || n > 9) return
      const slots = useReactionStore.getState().slots
      if (n <= slots.length) sendReaction(slots[n - 1].emoji)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [connected, sendReaction])

  // dev 전용: 헤드리스 E2E 에서 리액션 DataChannel 왕복을 검증하는 주입 훅(SelfAvatar.__room 패턴과 동형).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __reactionE2E?: { send: (e: string) => void; floats: () => unknown[] } }
    w.__reactionE2E = { send: sendReaction, floats: () => useReactionStore.getState().floats }
    return () => { delete w.__reactionE2E }
  }, [sendReaction])

  // 대본 진행 권한 = 호스트(생성자=slot 0). ponytail: 정확한 host_id 판정(현재 public_rooms 뷰는 host_id 제외).
  const mySlotIndex = useRoomStore((s) => s.mySlotIndex)
  // 호스트 판정은 rooms.host_id(서버 진실) 우선 — 호스트 이양 시 이 값 갱신으로 새 호스트가 컨트롤을 얻는다.
  // hostId 로드 전(초기)엔 기존 slot 프록시로 폴백(2인 경로 무변화). 서버는 host_id 로 권한 재검증.
  const isHost = hostId != null && appUserId != null ? hostId === appUserId : mySlotIndex === 0
  // 대본 진행권: 호스트 또는 연습 방/리허설 모드의 배우(서버 advance-script-cue 가 동일 규칙으로 재검증 — 관전자 403).
  const canAdvanceCue = !isViewer && (isHost || isPractice || scriptMode === 'rehearsal')
  const script = SEED_SCRIPTS[0]
  // ponytail: cue 진행 권한은 현재 **클라이언트 게이트만**(호스트에게만 버튼 노출) — 악의적 참가자가
  // 'script' 토픽을 직접 publish 하면 desync 가능. Phase 2 서버 권한(scripts 테이블 host-only UPDATE +
  // Edge Function 검증, contracts/ScriptPanel.md·state-machines/Script.md)으로 승급. MVP(초대 기반 협업방)는 수용.
  const advanceCue = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(script.cues.length - 1, cueIndex + delta))
    if (next === cueIndex) return
    setCueIndex(next)
    void sendCue(script.id, next) // 서버 릴레이 → 전 참가자 동기(호스트는 로컬 갱신·서버 echo 무시, SEC-5)
  }, [cueIndex, sendCue, script])

  // 호스트: 연결 직후 + 참가자 변동 시 현재 cue 를 재브로드캐스트.
  // reliable DataChannel 은 첫 publishData 로 개설되며 그 메시지가 유실될 수 있어(모든 세션 첫 진행 유실),
  // 연결 시 warm-up 겸 현재 상태를 흘려 채널을 연다. 겸사겸사 늦게 입장한 참가자도 현재 cue 로 동기.
  const cueIndexRef = useRef(cueIndex)
  useEffect(() => { cueIndexRef.current = cueIndex }, [cueIndex])
  useEffect(() => {
    if (!isHost || !connected) return
    void sendCue(script.id, cueIndexRef.current)
  }, [isHost, connected, memberKey, sendCue, script])

  // 역할 맵 표시는 퇴장자 제외(렌더 파생 — set-state-in-effect 회피). 재입장자는 아래 재클레임으로 자가복구.
  const liveRoleMap = useMemo(() => {
    const present = new Set(participants.map((p) => p.identity))
    return pruneRoleMap(roleMap, present)
  }, [roleMap, participants])
  const myScriptRole = roleOf(liveRoleMap, myIdentity)
  // 내 클레임 재전송(ROOM-14 늦입장 동기 — cue warm-up 동형): 멤버 변동 시 자기 역할을 멱등 재클레임.
  // 각자 자기 상태를 복구하므로 호스트 새로고침에도 전원 클레임이 살아남는다(호스트 전체맵 sync 방식의 회귀 회피).
  const myScriptRoleRef = useRef(myScriptRole)
  useEffect(() => { myScriptRoleRef.current = myScriptRole }, [myScriptRole])
  useEffect(() => {
    if (!connected || !session) return
    const role = myScriptRoleRef.current
    if (!role) return
    void scriptRoleAction(session.access_token, roomId, { action: 'claim', role }).catch(() => { /* 다음 멤버 변동에 재시도 */ })
  }, [connected, memberKey, roomId, session])

  // 역할 클레임/해제/배정·모드 전환 콜백(ROOM-14). 본인 액션은 낙관 self-echo(리액션 동형) —
  // 신규 참가자의 서버→클라 채널 첫 수신이 드롭될 수 있어(프로드 2탭 E2E 실측) 로컬 즉시 반영하고,
  // 서버 echo 는 같은 값이라 멱등(경합은 서버 순서 LWW 로 수렴).
  const claimRole = useCallback((role: string) => {
    if (!session) return
    const myName = useRoomStore.getState().participants.find((p) => p.isLocal)?.name ?? null
    setRoleMap((m) => applyRoleEvent(m, { kind: 'set', role, authId: myIdentity, name: myName }))
    void scriptRoleAction(session.access_token, roomId, { action: 'claim', role }).catch(() => toast.error(t('script.roleSyncFailed')))
  }, [session, roomId, t, myIdentity])
  const releaseRole = useCallback((role: string) => {
    if (!session) return
    setRoleMap((m) => applyRoleEvent(m, { kind: 'clear', role }))
    void scriptRoleAction(session.access_token, roomId, { action: 'release', role }).catch(() => toast.error(t('script.roleSyncFailed')))
  }, [session, roomId, t])
  const assignRole = useCallback((role: string, targetAuthId: string | null) => {
    if (!session) return
    void scriptRoleAction(session.access_token, roomId, { action: 'assign', role, target_auth_id: targetAuthId }).catch(() => toast.error(t('script.roleSyncFailed')))
  }, [session, roomId, t])
  const toggleScriptMode = useCallback(() => {
    if (!session) return
    const prev = scriptMode
    const next = prev === 'rehearsal' ? 'performance' : 'rehearsal'
    setScriptModeLocal(next) // 낙관 반영(서버 echo 는 같은 값 → 멱등), 실패 시 롤백
    setScriptMode(session.access_token, roomId, next).catch(() => {
      setScriptModeLocal(prev)
      toast.error(t('script.modeSyncFailed'))
    })
  }, [session, roomId, scriptMode, t])
  // 배우 목록(호스트 배정 셀렉트 후보) — LiveKit 참가자 ∩ 배우(관전자 제외).
  const actorOptions = useMemo(
    () => participants.filter((p) => actorIds.has(p.identity)).map((p) => ({ identity: p.identity, name: p.name })),
    [participants, actorIds],
  )

  // 우측 패널 탭(주입식 블록): 채팅·DUB·VGen. 각 탭은 자족적 컴포넌트 — 셸은 전환만 담당.
  // ponytail: 대본 미러(script)·디렉터 노트(notes, ROOM-17)·사운드보드 탭은 후속(contracts/RightPanel.md 구현 현황).
  const kick = useCallback(
    async (identity: string, reason?: string) => {
      if (!session) return
      await kickParticipant(session.access_token, roomId, identity, reason)
    },
    [session, roomId],
  )
  const mute = useCallback(
    async (identity: string, muted: boolean) => {
      if (!session) return
      await setParticipantMute(session.access_token, roomId, identity, muted)
    },
    [session, roomId],
  )
  // 방 비밀번호 설정/해제 → 서버가 반환한 is_locked 를 HostConsole 에 반영.
  const changePassword = useCallback(
    async (password: string): Promise<boolean> => {
      if (!session) return roomLocked
      const r = await setRoomPassword(session.access_token, roomId, password)
      setRoomLocked(r.is_locked)
      return r.is_locked
    },
    [session, roomId, roomLocked],
  )
  // 무대 배경 교체/해제(HOST-04·05) → 서버 검증·broadcast. 성공 시 로컬 즉시 반영(서버 echo 는 같은 값 멱등).
  const changeBackground = useCallback(
    async (backgroundUrl: string): Promise<void> => {
      if (!session) return
      const r = await setRoomBackground(session.access_token, roomId, backgroundUrl)
      useStageStore.getState().setBackground(r.background_url)
    },
    [session, roomId],
  )
  // 관객 손들기 토글(ROOM-20). 낙관적 반영 + 실패 롤백.
  const toggleHand = useCallback(async () => {
    if (!session) return
    const next = !handRaised
    setHandRaised(next)
    try {
      await raiseHand(session.access_token, roomId, next)
    } catch {
      setHandRaised(!next) // 실패 시 롤백
    }
  }, [session, roomId, handRaised])
  // 무대 초대 수락(ROOM-21, 대상 관객) → viewer→actor 승격. promoted broadcast 로 재연결·좌석갱신 처리(여기선 낙관적 모달 닫기).
  const acceptStage = useCallback(async () => {
    if (!session) return
    try {
      await acceptStageInvite(session.access_token, roomId)
      setStageInvite(false)
    } catch { /* 실패(정원 참 등) → 모달 유지 */ }
  }, [session, roomId])
  // 호스트가 손든 관객을 무대로 초대(ROOM-21). 대상에게 수락 모달 broadcast(아직 승격 아님).
  const inviteToStageCb = useCallback(async (targetUserId: string) => {
    if (!session) return
    await inviteToStage(session.access_token, roomId, targetUserId)
  }, [session, roomId])
  // 초대링크 발급(LOB-05, role: actor/viewer) — 원문 코드 반환, URL 조립·복사는 HostConsole.
  const createInvite = useCallback(async (role: 'actor' | 'viewer'): Promise<string> => {
    if (!session) throw new Error('no session')
    return (await createRoomInvite(session.access_token, roomId, role)).invite_code
  }, [session, roomId])
  // 최근 함께한 사람(LOB-08) — 현재 방 참가자 제외 후보 + 지명 초대(상대 인앱 알림).
  const loadRecentPeople = useCallback(async () => {
    if (!session) return []
    return (await listRecentPeople(session.access_token, roomId)).people
  }, [session, roomId])
  const directInvite = useCallback(async (userId: string) => {
    if (!session) throw new Error('no session')
    await createRoomInvite(session.access_token, roomId, 'actor', userId)
  }, [session, roomId])
  // VGEN 공유: jobId 방송 + 자기 화면 로컬 반영(publishData self-echo 없음). 중지도 방송+로컬.
  const shareVgen = useCallback(
    async (jobId: string) => {
      await sendRoomAuthority({ type: 'vgen_result', jobId })
      await playSharedVgen(jobId)
    },
    [sendRoomAuthority, playSharedVgen],
  )
  const stopShareVgen = useCallback(async () => {
    await sendRoomAuthority({ type: 'vgen_stop' })
    useStageStore.getState().clearMainVideo()
  }, [sendRoomAuthority])

  const tabs: RightPanelTab[] = [
    { id: 'chat', label: t('room.chat'), render: () => <ChatPanel connected={connected} onSend={sendChat} /> },
    { id: 'dub', label: t('room.tabDub'), render: () => <DubPanel roomId={roomId} /> },
    { id: 'vgen', label: t('room.tabVgen'), render: () => <VgenStatusTab roomId={roomId} isHost={isHost} onShare={shareVgen} /> },
  ]
  if (isHost) {
    tabs.push({
      id: 'host',
      label: t('host.tab'),
      render: () => (
        <HostConsole
          participants={participants}
          myIdentity={myIdentity}
          onKick={kick}
          onSetMute={mute}
          onSetPassword={changePassword}
          onSetBackground={changeBackground}
          onCreateInvite={createInvite}
          loadRecentPeople={loadRecentPeople}
          onDirectInvite={directInvite}
          raisedHands={raisedHands}
          onInviteToStage={inviteToStageCb}
          initialLocked={roomLocked}
          initialMuted={mutedIdentities}
        />
      ),
    })
  }

  // 잠금방 비번 입장(입장 단계 'password'). 성공 시 roomLocked=true(호스트면 콘솔에 잠금 상태 반영).
  async function submitJoinPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return
    setPwPhaseBusy(true)
    setPwPhaseErr(null)
    try {
      const r = await joinRoomWithPassword(session.access_token, roomId, passwordInput)
      useRoomStore.getState().setRoomContext({
        currentRoomId: roomId,
        myParticipantId: r.participant_id,
        mySlotIndex: r.slot_index,
        myRole: r.role === 'viewer' ? 'viewer' : 'actor',
      })
      setRoomLocked(true)
      setJoinPhase('ready')
    } catch {
      setPwPhaseErr(t('room.wrongPassword'))
      setPwPhaseBusy(false)
    }
  }

  async function onLeave() {
    if (session) {
      try {
        await leaveRoom(session.access_token, roomId) // DB soft-leave + 호스트 승계
      } catch {
        /* 네트워크 실패해도 화면 이탈은 진행 */
      }
    }
    await leave()
    useStageStore.getState().clearMainVideo()
    useRoomStore.getState().setRoomContext({
      currentRoomId: null,
      roomStatus: null,
      hostId: null,
      myParticipantId: null,
      mySlotIndex: null,
      myRole: null,
    })
    navigate('/lobby', { replace: true })
  }

  // 상단바 액션: 링크 공유(클립보드 복사)
  const handleShareLink = useCallback(() => {
    const url = `${window.location.origin}/room/${roomId}${isViewer ? '?watch=1' : ''}`
    navigator.clipboard.writeText(url)
    // ponytail: 토스트는 후속. 현재는 클립보드만 처리.
  }, [roomId, isViewer])

  if (joinPhase === 'joining') {
    return (
      <main className="grid min-h-screen place-items-center bg-stage-base text-stage-text-muted">
        <div className="flex flex-col items-center gap-4">
          <CampfireGlyph />
          <p role="status" aria-live="polite">{t('room.joining')}</p>
          <button
            onClick={() => { joinAbortRef.current?.abort(); navigate('/lobby', { replace: true }) }}
            className="rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
          >
            {t('room.joinCancel')}
          </button>
        </div>
      </main>
    )
  }

  if (joinPhase === 'error') {
    return (
      <main className="grid min-h-screen place-items-center bg-stage-base text-stage-text">
        <div className="text-center">
          <p className="text-fire-hot" role="alert">{joinError}</p>
          <button
            onClick={() => navigate('/lobby', { replace: true })}
            className="mt-4 rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
          >
            {t('room.backToLobby')}
          </button>
        </div>
      </main>
    )
  }

  if (joinPhase === 'password') {
    return (
      <main className="grid min-h-screen place-items-center bg-stage-base text-stage-text">
        <form onSubmit={submitJoinPassword} className="w-full max-w-xs px-6 text-center">
          <p className="mb-4 text-sm text-stage-text-muted">{t('room.passwordPrompt')}</p>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            aria-label={t('room.passwordLabel')}
            placeholder={t('room.passwordLabel')}
            maxLength={64}
            autoFocus
            className="w-full rounded-lg border border-stage-border bg-transparent px-4 py-2 text-sm"
          />
          {pwPhaseErr && <p className="mt-2 text-xs text-fire-hot" role="alert">{pwPhaseErr}</p>}
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="submit"
              disabled={pwPhaseBusy || !passwordInput}
              className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {t('room.passwordSubmit')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/lobby', { replace: true })}
              className="rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </main>
    )
  }

  if (kicked) {
    return (
      <main className="grid min-h-screen place-items-center bg-stage-base text-stage-text">
        <div className="text-center">
          <p className="text-fire-hot" role="alert">{t('host.kickedNotice')}</p>
          {kickReason && (
            <p className="mt-2 text-sm text-stage-text-muted">{t('host.kickReasonShown', { reason: kickReason })}</p>
          )}
          <button
            onClick={() => navigate('/lobby', { replace: true })}
            className="mt-4 rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
          >
            {t('room.backToLobby')}
          </button>
        </div>
      </main>
    )
  }

  // 반응형: 태그는 장르 하나만(공간 제한)
  const roomTags = roomGenre ? [roomGenre] : []

  // 좌도크: 대본 패널(연결 후) — 역할 클레임·모드는 서버 동기(ROOM-14)
  const leftDockContent = connected ? (
    <ScriptPanel
      script={script}
      cueIndex={cueIndex}
      canAdvance={canAdvanceCue}
      isHost={isHost}
      isViewer={isViewer}
      scriptMode={scriptMode}
      roleMap={liveRoleMap}
      myAuthId={myIdentity}
      actors={actorOptions}
      onClaim={claimRole}
      onRelease={releaseRole}
      onAssign={assignRole}
      onToggleMode={toggleScriptMode}
      onAdvance={advanceCue}
    />
  ) : null

  // 무대 영역: Stage + ReactionOverlay/Wheel + 에러 표시
  const stageContent = (
    <div className="relative flex flex-col gap-4">
      {error && (
        <p className="rounded-lg bg-fire-hot/10 px-3 py-2 text-xs text-fire-hot sm:text-sm" role="alert">
          {error}
        </p>
      )}
      {connected && (
        <div
          data-stage-area
          className="relative flex flex-col items-center justify-center rounded-lg border border-stage-border p-4"
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={openReactionWheel}
          onTouchStart={onStageTouchStart}
          onTouchMove={onStageTouchMove}
          onTouchEnd={onStageTouchEnd}
          onTouchCancel={cancelStageTouch}
          style={{ aspectRatio: '16/9', minHeight: '300px' }}
        >
          <Stage
            participants={isViewer ? participants.filter((p) => !p.isLocal) : participants}
            selfProjectUrl={selfProjectUrl}
            remoteProjectUrl={remoteProjectUrl}
            slotOf={slotOf}
            sendBlendshapes={sendBlendshapes}
            remoteAvatars={remoteAvatars}
            isHost={isHost}
            hostId={hostId}
            onStopShare={stopShareVgen}
          />
          <ReactionOverlay slotOf={slotOf} />
        </div>
      )}
      {reactionOrigin && (
        <ReactionWheel origin={reactionOrigin} initialSticky={reactionSticky} onFire={sendReaction} onClose={closeReactionWheel} />
      )}
    </div>
  )

  // 우도크: RightPanel 탭
  const rightDockContent = <RightPanel tabs={tabs} />

  // 상단바
  const topBarContent = (
    <RoomTopBar
      roomName={roomName}
      tags={roomTags}
      connected={connected}
      elapsed={elapsed}
      count={participants.length}
      capacity={6}
      onShare={handleShareLink}
    />
  )

  // 하단바: 마이크/손들기·리액션·나가기
  const bottomBarContent = (
    <RoomBottomBar
      isViewer={isViewer}
      micEnabled={micEnabled}
      mutedByHost={mutedByHost}
      handRaised={handRaised}
      connected={connected}
      onToggleMic={toggleMic}
      onToggleHand={toggleHand}
      onReaction={() => {
        if (connected) {
          const rect = document.querySelector('[data-stage-area]')?.getBoundingClientRect()
          if (rect) {
            setReactionSticky(true)
            setReactionOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
          }
        }
      }}
      onLeave={onLeave}
    />
  )

  return (
    <>
      <RoomShell
        topBar={topBarContent}
        leftDock={leftDockContent}
        stage={stageContent}
        rightDock={rightDockContent}
        bottomBar={bottomBarContent}
      />

      {/* 무대 초대 수락 모달(ROOM-21) — 대상 관객 본인만. 수락 시 viewer→actor 승격 + 재연결. */}
      {stageInvite && (
        <Modal title={t('room.stageInviteTitle')} onClose={() => setStageInvite(false)}>
          <p className="mt-2 text-sm text-stage-text-muted">{t('room.stageInviteBody')}</p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void acceptStage()}
              className="flex-1 rounded-lg bg-fire-amber px-3 py-2 text-sm font-semibold text-stage-base"
            >
              {t('room.stageInviteAccept')}
            </button>
            <button
              onClick={() => setStageInvite(false)}
              className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted"
            >
              {t('room.stageInviteDecline')}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
