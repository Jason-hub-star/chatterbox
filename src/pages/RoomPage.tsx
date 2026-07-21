import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLiveKitRoom } from '@/hooks/useLiveKitRoom'
import { useRoomStore } from '@/stores/roomStore'
import { useUserStore } from '@/stores/userStore'
import { leaveRoom, kickParticipant, setParticipantMute, setRoomPassword, setRoomBackground, setRoomMode, transferHost, updateRoomSettings, leaveRoomKeepalive, raiseHand, inviteToStage, acceptStageInvite, createRoomInvite, listRecentPeople, fetchRoomMessages, fetchChatPolicy, setChatPolicy, moderateChat, fetchMyBlockedAuthIds, createReport, createBlock, deleteBlock, fetchRoomRecordings, getRecordingUrl, createPoll, setPollStatus } from '@/lib/rooms'
import { useRoomRecording } from '@/features/room/useRoomRecording'
import { useRoomMembers } from '@/features/room/useRoomMembers'
import { useRoomJoin } from '@/features/room/useRoomJoin'
import { useRoomAuthority } from '@/features/room/useRoomAuthority'
import { useScriptSync } from '@/features/script/useScriptSync'
import { toast } from '@/hooks/useToast'
import { getVgenUrl } from '@/lib/vgen'
import { startBgm, stopBgm } from '@/lib/sound'
import { useStageStore } from '@/stores/stageStore'
import { useDubStore } from '@/stores/dubStore'
import { useVgenStore } from '@/stores/vgenStore'
import { resolveAvatarUrl } from '@/lib/avatars'
import { useInterior } from '@/pages/lobby/useInterior'
import { isNewerSeq, type BlendshapeFrame } from '@/lib/blendshapeCodec'
import Stage from '@/features/stage/Stage'
import ReactionWheel from '@/features/reaction/ReactionWheel'
import { useReactionWheel } from '@/features/reaction/useReactionWheel'
import ReactionOverlay from '@/features/reaction/ReactionOverlay'
import PollBar from '@/features/room/PollBar'
import type { RemoteFrameSink } from '@/features/avatar/RemoteAvatar'
import DubPanel from '@/features/dub/DubPanel'
import VgenStatusTab from '@/features/vgen/VgenStatusTab'
import ScriptPanel from '@/features/script/ScriptPanel'
import DubScriptPanel from '@/features/dub/DubScriptPanel'
import { supabase } from '@/lib/supabase'
import ChatPanel from '@/features/chat/ChatPanel'
import RightPanel, { type RightPanelTab } from '@/features/room/RightPanel'
import { useRightPanelStore } from '@/stores/rightPanelStore'
import ModeBanner from '@/features/room/ModeBanner'
import AudioMixerPanel from '@/features/room/AudioMixerPanel'
import { readVodSyncState, setVodSyncPublisher } from '@/features/stage/vodSync'
import DirectorNotesTab from '@/features/room/DirectorNotesTab'
import ChatNotesTab from '@/features/room/ChatNotesTab'
import HostConsole from '@/features/room/HostConsole'
import Modal from '@/components/shared/Modal'
import RoomJoinGate from '@/features/room/RoomJoinGate'
import RoomShell from '@/features/room/RoomShell'
import RoomTopBar from '@/features/room/RoomTopBar'
import RoomBottomBar from '@/features/room/RoomBottomBar'
import EmoteLoadoutPicker from '@/features/reaction/EmoteLoadoutPicker'

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
  // DUB-UX: 더빙 활성 여부(좌도크가 더빙 대본↔연기 대본 전환) — 조기 return 이전 최상위 훅.
  const dubActive = useDubStore((s) => !!s.activeSessionId)
  const dubScreening = useDubStore((s) => s.screening)
  const hostId = useRoomStore((s) => s.hostId)
  const myIdentity = session?.user?.id ?? '' // LiveKit identity = auth uid
  const joinBackdrop = useInterior('rooms')?.hero // 조인 대기 백드롭 — 분장실과 같은 대극장 원화(시각 연속)

  const [loadoutOpen, setLoadoutOpen] = useState(false) // 이모트 로드아웃 편집 모달(우클릭 휠에서 진입 — 우측패널 카드 대체)

  // 입장·연결 라이프사이클(NR 분리 → useRoomJoin): 조인 상태머신 + 멱등 재조인(RM-JOIN-RETRY) + 세션 중
  // 종단 끊김 판별(RM-DEADROOM). kicked/kickReason·roomLocked setter 는 아래 수신핸들러·HostConsole 이 쓴다.
  const {
    joinPhase, gatePhase, deadRoom, joinError, setKicked, kickReason, setKickReason,
    roomLocked, setRoomLocked, retryJoin, submitJoinPassword, cancelJoin, setLeaving, chooseRole,
  } = useRoomJoin(roomId)

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
  // room-authority 수신 프로토콜(NR 분리 → useRoomAuthority): broadcast 이벤트 스위치. dubEditBadgeTimer 는 훅 소유.
  const handleRoomAuthority = useRoomAuthority({
    playSharedVgen, applyServerScriptMode, setRaiseHandRefetch, setRoomName, setRoomGenre,
    setKickReason, setStageInvite, setReconnectNonce, recAuthorityRef,
  })

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
  const [mixerOpen, setMixerOpen] = useState(false) // ROOM-08 음량 믹서 개방(하단바 🎧 소유)
  // 리액션 휠(NR 분리 → useReactionWheel): 우클릭·롱프레스 개화 + 숫자키 1~N 즉발 + DEV E2E 훅.
  const {
    reactionOrigin, reactionSticky, openReactionWheel, closeReactionWheel,
    onStageTouchStart, onStageTouchMove, onStageTouchEnd, cancelStageTouch,
  } = useReactionWheel({ sendReaction, connected })

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

  // G9-P3: 호스트 시사회 토글(MainView 버튼 → dubStore) → 방 전체 broadcast(publishData 는 자기 echo 없음).
  // 초회 마운트(off)는 발행 생략. 늦은 입장자는 신호를 못 받음 — 호스트 재토글로 합류(ponytail, 하트비트는 후속).
  const screeningPrevRef = useRef(false)
  useEffect(() => {
    if (!isHost || screeningPrevRef.current === dubScreening) return
    screeningPrevRef.current = dubScreening
    void sendRoomAuthority({ type: 'dub_screening', on: dubScreening })
  }, [isHost, dubScreening, sendRoomAuthority])
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
    async (identity: string, muted: boolean, durationSec?: number) => {
      if (!session) return
      await setParticipantMute(session.access_token, roomId, identity, muted, durationSec)
      // UX-STAGE-VIS: 무대 mute 배지(mutedIdentities)를 서버 진실로 즉시 재동기 — 호스트 본인 화면 라이브 반영.
      // (비호스트 클라의 라이브 전파는 mute broadcast 부재로 memberKey 변동까지 지연 — 기존 ceiling.)
      setRaiseHandRefetch((n) => n + 1)
    },
    [session, roomId],
  )
  // R5 탭닫기 soft-leave(완화): SPA 내 나가기는 onLeave 가 처리 — pagehide 는 리로드/탭닫기/브라우저 종료.
  // 호스트는 제외: 리로드가 승계를 오발화하면 복귀 시 방장을 잃는다 — 호스트 공석은 livekit-webhook(근본,
  // 재실 대조 포함)이 유예 만료 후 회수. bfcache 진입(persisted)도 스킵(복귀 가능 페이지를 left 처리 금지).
  useEffect(() => {
    if (joinPhase !== 'ready' || !session || isHost) return
    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return
      leaveRoomKeepalive(session.access_token, roomId)
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [joinPhase, session, roomId, isHost])
  // R4 시간제 음소거 자가해제: 내 muted_until 경과 시 서버에 해제 요청(서버가 만료 재검증) —
  // canPublish 복원은 ParticipantPermissionsChanged 가 mutedByHost 를 자동으로 풀어준다.
  const myMutedUntil = members.mutedUntil[myIdentity]
  useEffect(() => {
    if (!myMutedUntil || !session) return
    const delay = Math.max(0, new Date(myMutedUntil).getTime() - Date.now()) + 1000 // 서버 시계 여유 1s
    const timer = window.setTimeout(() => {
      setParticipantMute(session.access_token, roomId, myIdentity, false)
        .then(() => setRaiseHandRefetch((n) => n + 1))
        .catch(() => { /* 만료 전 경합·네트워크 실패 — 재연결(livekit-token 파생)이 최종 해제 경로 */ })
    }, delay)
    return () => window.clearTimeout(timer)
  }, [myMutedUntil, session, roomId, myIdentity])
  // 방 설정 편집(R2) — 성공 시 로컬 즉시 반영(서버 echo 는 같은 값 멱등, setRoomBackground 동형).
  const saveRoomSettings = useCallback(
    async (settings: { title: string; genre: string }) => {
      if (!session) throw new Error('no session')
      const r = await updateRoomSettings(session.access_token, roomId, settings)
      setRoomName(r.title)
      setRoomGenre(r.genre ?? '')
    },
    [session, roomId],
  )
  // HostConsole 방 설정 초기값 — 현재 상단바 상태를 그대로 급식(loadChatPolicy 패턴).
  const loadRoomSettings = useCallback(async () => ({ title: roomName, genre: roomGenre }), [roomName, roomGenre])
  // 호스트 명시 이양(R1) — 서버 검증·broadcast 후 본인도 즉시 재조회(broadcast echo 는 같은 갱신이라 멱등).
  const transferHostCb = useCallback(
    async (identity: string) => {
      if (!session) throw new Error('no session')
      await transferHost(session.access_token, roomId, identity)
      setRaiseHandRefetch((n) => n + 1)
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
    [session, roomId, roomLocked, setRoomLocked],
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
    } catch {
      toast.error(t('room.stageInviteFailed')) // R7: 정원 참 등 실패 무피드백 해소 — 모달은 유지(재시도 가능)
    }
  }, [session, roomId, t])
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

  // R7 채팅 미읽음 뱃지: 채팅 탭 비활성 중 도착분 카운트 — 스토어 구독 콜백(이벤트)에서만 setState
  // (믹서 브리지 패턴 동형·컴파일러 lint 의 렌더 ref/effect setState 제약 회피). 탭 복귀 시 0.
  const [chatUnread, setChatUnread] = useState(0)
  useEffect(() => {
    const unsubMsg = useRoomStore.subscribe((s, prev) => {
      if (s.messages.length > prev.messages.length && useRightPanelStore.getState().activeTab !== 'chat') {
        setChatUnread((n) => n + (s.messages.length - prev.messages.length))
      }
    })
    const unsubTab = useRightPanelStore.subscribe((s) => {
      if (s.activeTab === 'chat') setChatUnread(0)
    })
    return () => { unsubMsg(); unsubTab() }
  }, [])

  // F-6: 노트는 채팅 탭 안 세그먼트로 통합(탭 5→4) — ChatNotesTab 이 둘 다 마운트 유지.
  const tabs: RightPanelTab[] = [
    { id: 'chat', label: t('room.tabChat'), badge: chatUnread, render: () => (
      <ChatNotesTab
        chat={<ChatPanel connected={connected} onSend={sendChat} isHost={isHost} onHideMessage={isHost ? hideMessage : undefined} blockedAuthIds={blockedAuthIds} onSubmitReport={submitReport} onUnblock={unblock} guestLocked={session?.user.is_anonymous === true} onGuestCta={() => navigate('/login', { state: { from: window.location.pathname + window.location.search } })} />}
        notes={<DirectorNotesTab connected={connected} hostAuthId={hostAuthId} onSend={sendNote} readOnly={isViewer} />}
      />
    ) },
    { id: 'dub', label: t('room.tabDub'), render: () => <DubPanel roomId={roomId} isViewer={isViewer} /> },
    { id: 'vgen', label: t('room.tabVgen'), render: () => <VgenStatusTab roomId={roomId} isHost={isHost} isViewer={isViewer} onShare={shareVgen} /> },
  ]
  if (isHost) {
    tabs.push({
      id: 'host',
      label: t('host.tab'),
      render: () => (
        <HostConsole
          participants={participants}
          myIdentity={myIdentity}
          actorIds={members.actorIds}
          onKick={kick}
          onSetMute={mute}
          mutedUntil={members.mutedUntil}
          onTransferHost={transferHostCb}
          onSetPassword={changePassword}
          onSetBackground={changeBackground}
          loadRoomSettings={loadRoomSettings}
          onUpdateRoomSettings={saveRoomSettings}
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

  async function onLeave() {
    setLeaving(true) // DISCONNECTED 전이로 방종료 모달이 잠깐 뜨는 것 방지
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

  // 입장 게이트(joining/entering/error/password/kicked) — gatePhase 는 useRoomJoin 파생.
  if (gatePhase) {
    return (
      <RoomJoinGate
        phase={gatePhase}
        backdrop={joinBackdrop}
        joinError={joinError}
        kickReason={kickReason}
        onCancel={cancelJoin}
        onSubmitPassword={submitJoinPassword}
        onRetry={retryJoin}
        onChooseRole={chooseRole}
      />
    )
  }


  // 반응형: 태그는 장르 하나만(공간 제한)
  const roomTags = roomGenre ? [roomGenre] : []

  // 좌도크: 대본 텔레프롬프터(연결 후, ROOM-14/06) — 세션정보 카드는 상단바 중복이라 제거(2026-07-13).
  // DUB-UX: 더빙 활성 시 연기 대본 대신 더빙 대본(센터 영상과 동기 하이라이트)을 건다(dubActive 는 상단 훅).
  const leftDockContent = (
    <div className="flex flex-col gap-3">
      {connected && (dubActive ? (
        <DubScriptPanel isHost={isHost} />
      ) : !scriptSync.script ? (
        // 실데이터만(2026-07-19): 대본 없으면 아무것도 안 그림(안내 문구도 삭제 — 주인님 결정).
        null
      ) : (
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
      ))}
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
            mutedIdentities={mutedIdentities}
            onStopShare={stopShareVgen}
            onDubEdit={(segmentId) => void sendRoomAuthority({ type: 'dub_edit', segment_id: segmentId })}
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
          {/* U-0 온보딩 데드엔드: 혼자 입장 시 빈 무대 안내 + 초대 CTA(F-3 공유 재사용).
              U2: 더빙 중엔 숨김 — 같은 자리(top-3 center·z-20)가 내차례 배너/녹음 HUD(z-10)를 덮어 클릭 가로챔. */}
          {connected && participants.length === 1 && !dubActive && (
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
        <ReactionWheel origin={reactionOrigin} initialSticky={reactionSticky} onFire={sendReaction} onClose={closeReactionWheel} onEdit={() => setLoadoutOpen(true)} />
      )}
      {loadoutOpen && <EmoteLoadoutPicker onClose={() => setLoadoutOpen(false)} />}
    </div>
  )

  // 우도크: 탭 패널 전체. 이모트 카드는 제거(우클릭 휠로 발사+편집 이관) → 더빙 등 탭 내용이 안 가려짐.
  const rightDockContent = (
    <div className="flex h-full flex-col">
      <RightPanel tabs={tabs} />
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
      isViewer={isViewer}
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

      {/* RM-DEADROOM: 세션 중 연결 종단 끊김 — 얼어붙은 무대 대신 사유+행동. Esc/재연결=멱등 재조인
          (방 종료면 join 이 'Room ended' 로 error 단계 수렴), 로비=이탈. */}
      {deadRoom && (
        <Modal title={t('room.connLostTitle')} onClose={retryJoin}>
          <p className="mt-2 text-sm text-stage-text-muted">{t('room.connLostBody')}</p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={retryJoin}
              className="flex-1 rounded-lg bg-fire-amber px-3 py-2 text-sm font-semibold text-stage-base hover:opacity-90"
            >
              {t('room.reconnect')}
            </button>
            <button
              onClick={() => void onLeave()}
              className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted hover:text-stage-text"
            >
              {t('room.backToLobby')}
            </button>
          </div>
        </Modal>
      )}

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
