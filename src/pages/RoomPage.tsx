import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLiveKitRoom } from '@/hooks/useLiveKitRoom'
import { useRoomStore } from '@/stores/roomStore'
import { useReactionStore } from '@/stores/reactionStore'
import { useUserStore } from '@/stores/userStore'
import { joinRoom, joinRoomAsViewer, joinRoomWithPassword, leaveRoom, kickParticipant, setParticipantMute, setRoomPassword, setRoomBackground, setRoomMode, raiseHand, inviteToStage, acceptStageInvite, createRoomInvite, listRecentPeople, fetchRoomMessages, fetchChatPolicy, setChatPolicy, moderateChat, fetchMyBlockedAuthIds, createReport, createBlock, deleteBlock, fetchRoomRecordings, getRecordingUrl, createPoll, setPollStatus } from '@/lib/rooms'
import { useRoomRecording } from '@/features/room/useRoomRecording'
import { useRoomMembers } from '@/features/room/useRoomMembers'
import { useScriptSync } from '@/features/script/useScriptSync'
import { toast } from '@/hooks/useToast'
import { getVgenUrl } from '@/lib/vgen'
import { startBgm, stopBgm } from '@/lib/sound'
import { useStageStore } from '@/stores/stageStore'
import { useVgenStore } from '@/stores/vgenStore'
import { resolveAvatarUrl } from '@/lib/avatars'
import { useInterior } from '@/pages/lobby/useInterior'
import { isNewerSeq, type BlendshapeFrame } from '@/lib/blendshapeCodec'
import Stage from '@/features/stage/Stage'
import ReactionWheel from '@/features/reaction/ReactionWheel'
import ReactionOverlay from '@/features/reaction/ReactionOverlay'
import PollBar from '@/features/room/PollBar'
import type { RemoteFrameSink } from '@/features/avatar/RemoteAvatar'
import DubPanel from '@/features/dub/DubPanel'
import VgenStatusTab from '@/features/vgen/VgenStatusTab'
import ScriptPanel from '@/features/script/ScriptPanel'
import { supabase } from '@/lib/supabase'
import ChatPanel from '@/features/chat/ChatPanel'
import RightPanel, { type RightPanelTab } from '@/features/room/RightPanel'
import ModeBanner from '@/features/room/ModeBanner'
import AudioMixerPanel from '@/features/room/AudioMixerPanel'
import { applyVodSync, readVodSyncState, setVodSyncPublisher } from '@/features/stage/vodSync'
import DirectorNotesTab from '@/features/room/DirectorNotesTab'
import ChatNotesTab from '@/features/room/ChatNotesTab'
import HostConsole from '@/features/room/HostConsole'
import Modal from '@/components/shared/Modal'
import RoomJoinGate from '@/features/room/RoomJoinGate'
import RoomShell from '@/features/room/RoomShell'
import RoomTopBar from '@/features/room/RoomTopBar'
import RoomBottomBar from '@/features/room/RoomBottomBar'
import EmoteConsoleCard from '@/features/reaction/EmoteConsoleCard'

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
  const joinBackdrop = useInterior('rooms')?.hero // 조인 대기 백드롭 — 분장실과 같은 대극장 원화(시각 연속)

  // 입장 단계: LiveKit 연결 전에 반드시 room_participants 행을 만든다(멱등).
  // livekit-token 게이트가 활성 참가자 행을 요구하므로, join 성공 후에만 연결(enabled).
  const [joinPhase, setJoinPhase] = useState<'joining' | 'entering' | 'ready' | 'error' | 'password'>('joining')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [kicked, setKicked] = useState(false)
  const [kickReason, setKickReason] = useState<string | null>(null) // 서버발 강퇴 사유(room-authority 'kicked') — 표시는 kicked 게이트
  // 잠금방: join-public-room 이 "Room is locked" 로 거부하면 비번 입력 단계로. 입장 성공 시 roomLocked=true.
  // (비번 입력 폼의 로컬 상태는 RoomJoinGate 소유 — R-커밋 분리)
  const [roomLocked, setRoomLocked] = useState(false)

  // 취소 버튼(트랙 B)이 진행 중 join fetch 를 끊을 수 있게 컨트롤러를 ref 로 노출.
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
        enterWithGreen(() => cancelled)
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

  // 채팅 히스토리 백필(ChatPanel.md): join 성공 후 1회 RLS(멤버) SELECT — 라이브 수신분과 id dedupe 병합.
  useEffect(() => {
    if (joinPhase !== 'ready' || !roomId) return
    let cancelled = false
    fetchRoomMessages(roomId)
      .then((history) => {
        if (!cancelled && history.length) useRoomStore.getState().seedMessages(history)
      })
      .catch(() => {
        /* 히스토리 실패는 비치명 — 라이브 채팅은 정상 동작 */
      })
    return () => {
      cancelled = true
    }
  }, [joinPhase, roomId])

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
        setIsPractice(!!data.is_practice) // 연습 방 ref 동기는 useScriptSync 내부
        setRoomName(data.title || '')
        setRoomGenre(data.genre || '')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [roomId])

  // ── R-커밋 허브: 스토어 파생(연결·좌석·호스트) → 멤버 명단 동기 → 대본 동기 훅.
  //    훅 배선(useScriptSync·useRoomMembers)이 아래 useLiveKitRoom 옵션·bg 복원 effect 보다 먼저 서야 한다(TDZ).
  const connectionState = useRoomStore((s) => s.connectionState)
  const participants = useRoomStore((s) => s.participants)
  // 관전 모드(서버 진실): 무대에서 내 좌석·카메라·마이크가 없다 — SelfAvatar 미마운트로 웹캠 요청 자체가 없음.
  const isViewer = useRoomStore((s) => s.myRole) === 'viewer'
  const micEnabled = useRoomStore((s) => s.micEnabled)
  const mutedByHost = useRoomStore((s) => s.mutedByHost)
  const error = useRoomStore((s) => s.error)
  const connected = connectionState === 'CONNECTED'
  const mySlotIndex = useRoomStore((s) => s.mySlotIndex)
  // 호스트 판정은 rooms.host_id(서버 진실) 우선 — 호스트 이양 시 이 값 갱신으로 새 호스트가 컨트롤을 얻는다.
  // hostId 로드 전(초기)엔 기존 slot 프록시로 폴백(2인 경로 무변화). 서버는 host_id 로 권한 재검증.
  const isHost = hostId != null && appUserId != null ? hostId === appUserId : mySlotIndex === 0

  // 멤버 명단 동기(아바타·좌석·음소거·배우·호스트 authId·손들기) — useRoomMembers 분리(R-커밋).
  const [raiseHandRefetch, setRaiseHandRefetch] = useState(0) // raise_hand/promoted broadcast → 재조회 카운터
  const members = useRoomMembers({ roomId, joined: joinPhase === 'ready', raiseHandRefetch })

  // 대본 동기(cue·역할 클레임·리허설 모드) — useScriptSync 분리(R-커밋). sendCue 는 useLiveKitRoom 반환이라 ref 브리지.
  const sendCueRef = useRef<(sceneId: string, cueIndex: number) => Promise<void>>(() => Promise.resolve())
  const bridgedSendCue = useCallback((sceneId: string, cueIndex: number) => sendCueRef.current(sceneId, cueIndex), [])
  const scriptSync = useScriptSync({
    roomId,
    connected,
    memberKey: members.memberKey,
    isHost,
    isViewer,
    isPractice,
    myIdentity,
    actorIds: members.actorIds,
    sendCue: bridgedSendCue,
  })
  const { applyServerScriptMode } = scriptSync // effect/콜백 deps 용 안정 참조

  // G6 U-2 BGM: 입장(연결) 동안만 3곡 순환 재생 — 자산·순환·autoplay 게이트는 lib/sound.ts 소유.
  useEffect(() => {
    if (!connected) return
    startBgm()
    return () => stopBgm()
  }, [connected])

  // 무대 배경 초기 로드(HOST-04·05): 입장 후(멤버 RLS) rooms.background_url 을 읽어 이미 설정된 배경을 반영.
  // 이후 변경은 room-authority bg_change 로 실시간 동기. 방 이탈 시 초기화(다음 방 배경 잔상 방지).
  useEffect(() => {
    if (joinPhase !== 'ready') return
    let cancelled = false
    ;(async () => {
      let { data } = await supabase.from('rooms').select('background_url, script_mode, current_mode').eq('id', roomId).maybeSingle()
      if (!data) {
        // 마이그(20260710093000_add_room_current_mode) 배포 전 프로드 호환: 미지 컬럼 select 는 PostgREST 400 →
        // current_mode 없이 재조회해 배경·대본모드 복원은 지킨다. 마이그 배포 후 이 폴백은 도달하지 않는다.
        ;({ data } = await supabase.from('rooms').select('background_url, script_mode').eq('id', roomId).maybeSingle())
      }
      if (!cancelled && data) {
        const row = data as { background_url?: string | null; script_mode?: string; current_mode?: string }
        useStageStore.getState().setBackground(row.background_url ?? null)
        // 대본 모드 초기 동기(ROOM-14) — 이후 변경은 room-authority script_mode 로.
        applyServerScriptMode(row.script_mode)
        // 진행 모드 복원(G-261, late joiner) — setMode 는 조용(배너 없음). 이후 변경은 mode_change broadcast 로.
        if (row.current_mode === 'vgen' || row.current_mode === 'dub') useStageStore.getState().setMode(row.current_mode)
      }
    })()
    return () => {
      cancelled = true
      useStageStore.getState().setBackground(null)
      useStageStore.getState().setMode('normal') // 다음 방 모드 잔상 방지
    }
  }, [joinPhase, roomId, applyServerScriptMode])

  // VGEN 공유재생(VGEN-04): 호스트가 방송한 jobId 로 각자 서명 URL 을 발급받아 센터 MainView 에 재생.
  const playSharedVgen = useCallback(async (jobId: string) => {
    if (!session) return
    try {
      const url = await getVgenUrl(session.access_token, jobId)
      useStageStore.getState().setMainVideo(url, jobId)
    } catch { /* 접근 불가·미완성 → 무시(서버 get-vgen-url 이 멤버십·visibility 게이트) */ }
  }, [session])
  const [reconnectNonce, setReconnectNonce] = useState(0) // 승격 시 ++ → useLiveKitRoom 재연결(새 토큰 canPublish=true)
  const [stageInvite, setStageInvite] = useState(false)   // 무대 초대 수락 모달(대상 본인만)
  // V-3 녹화: useRoomRecording 은 isHost(아래 파생) 뒤에 호출되므로 ref 브리지로 수신을 위임(TDZ 회피).
  const recAuthorityRef = useRef<((msg: { type: string; recording_id?: string; all_consented?: boolean }) => void) | null>(null)
  const recAudioRef = useRef<((track: MediaStreamTrack) => void) | null>(null)
  const handleRoomAuthority = useCallback((msg: { type: string; jobId?: string; url?: string | null; mode?: string; target_auth_id?: string; auth_id?: string; slot_index?: number | null; reason?: string; new_mode?: string; position_ms?: number; playing?: boolean; at_ms?: number; rate?: number; recording_id?: string; all_consented?: boolean }) => {
    if (msg.type === 'vgen_result' && typeof msg.jobId === 'string') void playSharedVgen(msg.jobId)
    else if (msg.type === 'vgen_stop') useStageStore.getState().clearMainVideo()
    else if (msg.type === 'bg_change') useStageStore.getState().setBackground(msg.url ?? null)
    else if (msg.type === 'script_mode') {
      // 대본 모드 전환(ROOM-14, set-script-mode Edge 발). 호스트 자신도 echo 를 받지만 같은 값 → 멱등.
      applyServerScriptMode(msg.mode)
    }
    else if (msg.type === 'raise_hand') setRaiseHandRefetch((n) => n + 1) // 손든 관객 변동 → 큐 재조회(호스트 UI)
    else if (msg.type === 'vod_sync') {
      // ROOM-01 동기: 적용자(applier)는 비호스트 MainView 만 등록 → 호스트/미재생 화면엔 no-op. 형태 검증 후 적용.
      if (
        typeof msg.position_ms === 'number' && Number.isFinite(msg.position_ms) && msg.position_ms >= 0 &&
        typeof msg.at_ms === 'number' && Number.isFinite(msg.at_ms)
      ) {
        // rate 는 후행 추가(U-3) — 구 페이로드 하위호환 1 폴백 + 형태검증(0<r≤4)
        const rate = typeof msg.rate === 'number' && Number.isFinite(msg.rate) && msg.rate > 0 && msg.rate <= 4 ? msg.rate : 1
        applyVodSync({ positionMs: msg.position_ms, playing: msg.playing === true, atMs: msg.at_ms, rate })
      }
    }
    else if (msg.type === 'mode_change') {
      // G-261: 서버(set-room-mode) broadcast. 배너 표출+탭 자동전환은 stageStore 구독측(ModeBanner·RightPanel).
      if (msg.new_mode === 'normal' || msg.new_mode === 'vgen' || msg.new_mode === 'dub') {
        useStageStore.getState().announceMode(msg.new_mode)
      }
    }
    else if (msg.type === 'kicked') {
      // 강퇴 사유(HOST-01): 서버(kick-participant)가 절단 직전 대상에게만 전송(destinationIdentities).
      // 표시는 kicked 상태(PARTICIPANT_REMOVED)에 게이트 — 참가자 스푸핑만으로는 화면에 못 띄운다.
      if (typeof msg.reason === 'string' && msg.reason) setKickReason(msg.reason.slice(0, 200))
    }
    else if (msg.type === 'stage_invite') {
      // 무대 초대(ROOM-21) — 대상 본인만 수락 모달, 다른 참가자는 무시.
      if (msg.target_auth_id === useUserStore.getState().user?.id) setStageInvite(true)
    } else if (msg.type.startsWith('recording_')) {
      // V-3 녹화 이벤트(consent/consent_update/started/done) — useRoomRecording 에 위임.
      recAuthorityRef.current?.(msg)
    } else if (msg.type === 'promoted') {
      setRaiseHandRefetch((n) => n + 1) // 전원 좌석 갱신(승격자 새 slot 반영)
      if (msg.auth_id === useUserStore.getState().user?.id) {
        // 본인 승격 → actor 전환 + 재연결(새 토큰 canPublish=true). 수락 모달 닫기.
        setStageInvite(false)
        useRoomStore.getState().setRoomContext({ myRole: 'actor', mySlotIndex: msg.slot_index ?? null })
        setReconnectNonce((n) => n + 1)
      }
    }
  }, [playSharedVgen, applyServerScriptMode])

  const { toggleMic, sendChat, sendNote, sendBlendshapes, sendCue, sendRoomAuthority, sendReaction, leave, getAudioTracks } = useLiveKitRoom(roomId, {
    onBlendshapes: handleBlendshapes,
    onCue: scriptSync.handleCue,
    onRoomAuthority: handleRoomAuthority,
    onScriptRole: scriptSync.handleScriptRole,
    enabled: joinPhase === 'ready',
    onKicked: () => setKicked(true),
    onAudioTrack: (track) => recAudioRef.current?.(track), // 녹화 믹스 — 녹화 중 오디오 증감 합류
    reconnectNonce,
    hostIdentity: members.hostAuthId ?? undefined, // room-authority 발신자 검증(SEC-RA-1)
  })
  // 대본 진행 송신 브리지 — useScriptSync 가 훅 순서상 먼저 서므로 여기서 실제 sendCue 를 연결.
  useEffect(() => { sendCueRef.current = sendCue }, [sendCue])

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

  // 멤버 명단(아바타·좌석·음소거·호스트 authId·손들기)은 useRoomMembers 소유 — 여기선 파생만 사용.
  const { memberAvatars, memberSlots, mutedIdentities, hostAuthId, raisedHands, handRaised, setHandRaised } = members

  const selfProjectUrl = resolveAvatarUrl(myAvatarUrl)
  const remoteProjectUrl = useCallback(
    (identity: string) => resolveAvatarUrl(memberAvatars[identity]),
    [memberAvatars],
  )
  const slotOf = useCallback((identity: string) => memberSlots[identity], [memberSlots])

  // 리액션 휠: 무대 우클릭(button 2)으로 커서 위치에 개화(홀드-드래그-릴리즈). origin=null=닫힘.
  const [reactionOrigin, setReactionOrigin] = useState<{ x: number; y: number } | null>(null)
  const [reactionSticky, setReactionSticky] = useState(false) // 터치 개화는 sticky(탭 선택) 모드로 시작
  const [mixerOpen, setMixerOpen] = useState(false) // ROOM-08 음량 믹서 개방(하단바 🎧 소유)
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

  // V-3 인앱 녹화(ROOM-13): 동의 게이트→무대 합성 캡처→R2→작품. room-authority 수신·오디오 증감은 ref 브리지.
  const recording = useRoomRecording({ roomId, isHost, joined: joinPhase === 'ready', getAudioTracks })
  useEffect(() => {
    recAuthorityRef.current = recording.onAuthorityMessage
    recAudioRef.current = recording.onAudioTrack
  }, [recording.onAuthorityMessage, recording.onAudioTrack])
  // HostConsole 녹화 다시보기 — RLS(멤버) 목록 + presigned GET(서버 visibility 게이트).
  const loadRecordings = useCallback(() => fetchRoomRecordings(roomId), [roomId])
  const playRecording = useCallback(async (id: string): Promise<string> => {
    if (!session) throw new Error('no session')
    return (await getRecordingUrl(session.access_token, id)).url
  }, [session])

  // G-261 호스트 관찰자: VGEN 생성 시작/종료를 방 모드로 승격(set-room-mode → 서버 broadcast → 전원 반영).
  // RoomPage 에만 배선 — VgenStatusTab/VgenPromptPanel 은 스튜디오(공방)에서도 재사용되므로 방 의미론은 여기서만.
  const vgenGenerating = useVgenStore((s) => s.isGenerating)
  const prevVgenGeneratingRef = useRef(false)
  useEffect(() => {
    const prev = prevVgenGeneratingRef.current
    prevVgenGeneratingRef.current = vgenGenerating
    if (!isHost || !session || joinPhase !== 'ready' || prev === vgenGenerating) return
    // 모드 전파는 best-effort — 실패해도 생성 흐름은 무손상(배너·탭 전환만 빠짐).
    void setRoomMode(session.access_token, roomId, vgenGenerating ? 'vgen' : 'normal').catch(() => {})
  }, [vgenGenerating, isHost, session, roomId, joinPhase])

  // ROOM-01 동기: 호스트 = 타임라인 진실. MainView 이벤트를 LiveKit 으로 발행(publisher) +
  // 5s 하트비트(늦은 입장 ≤5s 수렴·주기 드리프트 보정). 영상 없으면 reader 가 null → 무발행.
  useEffect(() => {
    if (!isHost) return
    setVodSyncPublisher((s) => {
      void sendRoomAuthority({ type: 'vod_sync', position_ms: s.positionMs, playing: s.playing, at_ms: s.atMs, rate: s.rate })
    })
    const id = setInterval(() => {
      const s = readVodSyncState()
      if (s) void sendRoomAuthority({ type: 'vod_sync', position_ms: s.positionMs, playing: s.playing, at_ms: s.atMs, rate: s.rate })
    }, 5000)
    return () => {
      setVodSyncPublisher(null)
      clearInterval(id)
    }
  }, [isHost, sendRoomAuthority])
  // 대본 진행·역할 클레임·모드 전환은 useScriptSync 소유(R-커밋) — ScriptPanel 배선은 아래 leftDock.

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
  }, [session, roomId, handRaised, setHandRaised])
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
  // 채팅 정책(HOST-09·10) — 초기값은 rooms RLS(멤버 SELECT), 저장은 set-chat-policy Edge(호스트 재검증).
  const loadChatPolicy = useCallback(() => fetchChatPolicy(roomId), [roomId])
  const saveChatPolicy = useCallback(async (policy: { slow_mode_sec: number; banned_words: string[] }) => {
    if (!session) throw new Error('no session')
    await setChatPolicy(session.access_token, roomId, policy)
  }, [session, roomId])
  // 관객 투표(ROOM-22) — 생성/전이는 서버(create-poll/set-poll-status)가 host 재검증 후 'poll' broadcast
  // → 전원(호스트 포함) pollStore 반영. 투표 UI 는 무대 PollBar, 초기 동기는 PollBar fetch.
  const createPollCb = useCallback(async (question: string, options: string[]) => {
    if (!session) throw new Error('no session')
    await createPoll(session.access_token, roomId, question, options)
  }, [session, roomId])
  const setPollStatusCb = useCallback(async (pollId: string, status: 'revealed' | 'closed') => {
    if (!session) throw new Error('no session')
    await setPollStatus(session.access_token, roomId, pollId, status)
  }, [session, roomId])
  // 채팅 클리어/개별 숨김(HOST-11) — 성공 시 서버 'chat-mod' broadcast 가 전원(호스트 포함) 스토어에 반영.
  const clearChat = useCallback(async () => {
    if (!session) throw new Error('no session')
    await moderateChat(session.access_token, roomId, { action: 'clear' })
  }, [session, roomId])
  const hideMessage = useCallback((id: string) => {
    if (!session) return
    void moderateChat(session.access_token, roomId, { action: 'hide', message_id: id }).catch(() => {
      toast.error(t('host.hideMessageFailed'))
    })
  }, [session, roomId, t])
  // V-2 차단(개인 경험 필터 — reporting-logging-feedback §16.2): 내 차단 목록으로 채팅 접힘.
  const [blockedAuthIds, setBlockedAuthIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (joinPhase !== 'ready') return
    let cancelled = false
    fetchMyBlockedAuthIds()
      .then((ids) => { if (!cancelled && ids.length) setBlockedAuthIds(new Set(ids)) })
      .catch(() => { /* 차단 목록 실패는 비치명 — 필터 없이 표시 */ })
    return () => { cancelled = true }
  }, [joinPhase])
  // 신고 제출(+선택 차단). 신고 실패는 throw 로 모달 유지, 차단 실패는 신고와 독립 안내.
  const submitReport = useCallback(async (r: { messageId: string; senderAuthId: string; reason: string; alsoBlock: boolean }) => {
    if (!session) return
    try {
      await createReport(session.access_token, { room_id: roomId, message_id: r.messageId, reason: r.reason })
      toast.success(t('room.reportDone'))
    } catch {
      toast.error(t('room.reportFailed'))
      throw new Error('report failed')
    }
    if (r.alsoBlock) {
      try {
        await createBlock(session.access_token, { blocked_auth_id: r.senderAuthId })
        setBlockedAuthIds((prev) => new Set(prev).add(r.senderAuthId))
        toast.success(t('room.blockDone'))
      } catch {
        toast.error(t('room.blockFailed'))
      }
    }
  }, [session, roomId, t])
  const unblock = useCallback((senderAuthId: string) => {
    if (!session) return
    void deleteBlock(session.access_token, { blocked_auth_id: senderAuthId })
      .then(() => setBlockedAuthIds((prev) => { const n = new Set(prev); n.delete(senderAuthId); return n }))
      .catch(() => toast.error(t('room.unblockFailed')))
  }, [session, t])
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

  // F-6: 노트는 채팅 탭 안 세그먼트로 통합(탭 5→4) — ChatNotesTab 이 둘 다 마운트 유지.
  const tabs: RightPanelTab[] = [
    { id: 'chat', label: t('room.tabChat'), render: () => (
      <ChatNotesTab
        chat={<ChatPanel connected={connected} onSend={sendChat} isHost={isHost} onHideMessage={isHost ? hideMessage : undefined} blockedAuthIds={blockedAuthIds} onSubmitReport={submitReport} onUnblock={unblock} />}
        notes={<DirectorNotesTab connected={connected} hostAuthId={hostAuthId} onSend={sendNote} />}
      />
    ) },
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
          loadChatPolicy={loadChatPolicy}
          onSetChatPolicy={saveChatPolicy}
          onClearChat={clearChat}
          initialLocked={roomLocked}
          initialMuted={mutedIdentities}
          loadRecordings={loadRecordings}
          onPlayRecording={playRecording}
          recordingsNonce={recording.recordingsNonce}
          connected={connected}
          recordPhase={recording.phase}
          onToggleRecord={() => void recording.toggleRecording()}
          onCreatePoll={createPollCb}
          onSetPollStatus={setPollStatusCb}
        />
      ),
    })
  }

  // 잠금방 비번 입장(입장 단계 'password'). 성공 시 roomLocked=true(호스트면 콘솔에 잠금 상태 반영).
  // 실패는 throw — RoomJoinGate 가 오류 표시·busy 해제를 소유(R-커밋).
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

  // 상단바 액션: 링크 공유 — 호스트는 초대코드 링크(비공개 방·온보딩 경로 유효, ROOM-REDESIGN "초대 상단 승격" 해소),
  // 그 외는 방 URL 직행(공개 방). F-3(2026-07-12).
  const handleShareLink = useCallback(async () => {
    try {
      const url = isHost
        ? `${window.location.origin}/lobby?invite=${await createInvite('actor')}`
        : `${window.location.origin}/rooms/${roomId}${isViewer ? '?watch=1' : ''}`
      await navigator.clipboard.writeText(url)
      toast.success(t('room.linkCopied'))
    } catch {
      toast.error(t('room.linkCopyFailed'))
    }
  }, [roomId, isViewer, isHost, createInvite, t])

  // 입장 게이트(joining/entering/error/password/kicked) — RoomJoinGate 로 분리(R-커밋).
  const gatePhase = kicked ? ('kicked' as const) : joinPhase !== 'ready' ? joinPhase : null
  if (gatePhase) {
    return (
      <RoomJoinGate
        phase={gatePhase}
        backdrop={joinBackdrop}
        joinError={joinError}
        kickReason={kickReason}
        onCancel={() => { joinAbortRef.current?.abort(); navigate('/lobby', { replace: true }) }}
        onSubmitPassword={submitJoinPassword}
      />
    )
  }

  // 반응형: 태그는 장르 하나만(공간 제한)
  const roomTags = roomGenre ? [roomGenre] : []

  // 좌도크: 대본 텔레프롬프터(연결 후, ROOM-14/06) — 세션정보 카드는 상단바 중복이라 제거(2026-07-13).
  const leftDockContent = (
    <div className="flex flex-col gap-3">
      {connected && (
        <ScriptPanel
          script={scriptSync.script}
          cueIndex={scriptSync.cueIndex}
          canAdvance={scriptSync.canAdvanceCue}
          isHost={isHost}
          isViewer={isViewer}
          scriptMode={scriptSync.scriptMode}
          roleMap={scriptSync.liveRoleMap}
          myAuthId={myIdentity}
          actors={scriptSync.actorOptions}
          onClaim={scriptSync.claimRole}
          onRelease={scriptSync.releaseRole}
          onAssign={scriptSync.assignRole}
          onToggleMode={scriptSync.toggleScriptMode}
          onAdvance={scriptSync.advanceCue}
        />
      )}
    </div>
  )

  // 무대 영역: Stage + ReactionOverlay/Wheel + 에러 표시
  const stageContent = (
    <div className="relative flex h-full flex-col gap-4">
      {error && (
        <p className="rounded-lg bg-fire-hot/10 px-3 py-2 text-xs text-fire-hot sm:text-sm" role="alert">
          {error}
        </p>
      )}
      {connected && (
        <div
          data-stage-area
          className="relative min-h-0 flex-1 overflow-hidden rounded-xl"
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={openReactionWheel}
          onTouchStart={onStageTouchStart}
          onTouchMove={onStageTouchMove}
          onTouchEnd={onStageTouchEnd}
          onTouchCancel={cancelStageTouch}
          style={{ minHeight: '280px' }}
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
          <PollBar roomId={roomId} />
          <ModeBanner />
          {/* REC 배지(V-3) — 전원 고지(늦입장 포함). 라틴 'REC' 는 i18n 불요(하드코딩 허용 범위). */}
          {recording.recActive && (
            <span
              role="status"
              data-rec-badge
              className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-fire-hot backdrop-blur-sm"
            >
              <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-fire-hot" /> REC
            </span>
          )}
          {/* U-0 온보딩 데드엔드: 혼자 입장 시 빈 무대 안내 + 초대 CTA(F-3 공유 재사용). */}
          {connected && participants.length === 1 && (
            <button
              type="button"
              onClick={handleShareLink}
              className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-stage-border bg-stage-panel/90 px-3 py-1.5 text-xs text-stage-text-muted backdrop-blur-sm transition-colors hover:border-fire-amber/60 hover:text-stage-text"
            >
              💌 {t('room.soloInviteHint')}
            </button>
          )}
        </div>
      )}
      {reactionOrigin && (
        <ReactionWheel origin={reactionOrigin} initialSticky={reactionSticky} onFire={sendReaction} onClose={closeReactionWheel} />
      )}
    </div>
  )

  // 우도크: 방분위기(상단) + 라이브피드 탭 패널(중앙) + 사운드보드(하단) — R4 카드 스택.
  const rightDockContent = (
    <div className="flex h-full flex-col gap-3">
      <div className="min-h-0 flex-1">
        <RightPanel tabs={tabs} />
      </div>
      <EmoteConsoleCard onReaction={sendReaction} disabled={!connected} />
    </div>
  )

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

  // 하단바: 마이크·오디오(믹서)·나가기 — 리액션=무대 제스처, 손들기=가림, 아바타=무대 클릭 크게보기로 이관
  const bottomBarContent = (
    <RoomBottomBar
      isViewer={isViewer}
      micEnabled={micEnabled}
      mutedByHost={mutedByHost}
      handRaised={handRaised}
      connected={connected}
      mixerOpen={mixerOpen}
      onToggleMic={toggleMic}
      onToggleHand={toggleHand}
      onToggleMixer={() => setMixerOpen((v) => !v)}
      mixerSlot={<AudioMixerPanel open={mixerOpen} onClose={() => setMixerOpen(false)} />}
      onLeave={onLeave}
      recordPhase={isHost ? recording.phase : undefined}
      onToggleRecord={isHost ? () => void recording.toggleRecording() : undefined}
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

      {/* 녹화 동의 모달(V-3·§11.1.1) — 닫기(Esc)도 거절로 기록(무응답 방치 방지, 호스트는 취소 가능). */}
      {recording.consentRequest && (
        <Modal title={t('room.recConsentTitle')} onClose={() => void recording.respondConsent(false)}>
          <p className="mt-2 text-sm text-stage-text-muted">{t('room.recConsentBody')}</p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void recording.respondConsent(true)}
              className="flex-1 rounded-lg bg-fire-amber px-3 py-2 text-sm font-semibold text-stage-base"
            >
              {t('room.recConsentAccept')}
            </button>
            <button
              onClick={() => void recording.respondConsent(false)}
              className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted"
            >
              {t('room.recConsentDecline')}
            </button>
          </div>
        </Modal>
      )}

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
