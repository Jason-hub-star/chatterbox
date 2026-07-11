import { useCallback, useEffect, useRef } from 'react'
import {
  ConnectionState,
  DisconnectReason,
  RemoteParticipant,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from 'livekit-client'
import { useUserStore } from '@/stores/userStore'
import { useRoomStore } from '@/stores/roomStore'
import { useReactionStore } from '@/stores/reactionStore'
import { useNotesStore } from '@/stores/notesStore'
import { useAudioStore, mixedVolume } from '@/stores/audioStore'
import { fetchRoomToken, mapParticipant } from '@/lib/livekit'
import { sendReactionRelay, advanceScriptCueRelay, sendChatRelay } from '@/lib/rooms'
import { sanitizeChatInput } from '@/lib/chatSanitize'
import { toast } from '@/hooks/useToast'
import i18n from '@/i18n'
import {
  encodeBlendshapeFrame,
  decodeBlendshapeFrame,
  type BlendshapeFrame,
} from '@/lib/blendshapeCodec'

// SSOT: reference/patterns/livekit-client.md · state-machines/WebRTC.md
// Phase 1B PoC: 오디오 + 채팅 + blendshape(표정) 2인 연결. 영상·토큰갱신·재정렬버퍼는 Phase 2 (ponytail).

// blendshape 송신 스로틀: 계약 30Hz 이하로 상한(~20Hz). lossy 채널이라 프레임 드롭 무해.
const BLENDSHAPE_SEND_INTERVAL_MS = 50

function mapConnState(s: ConnectionState) {
  switch (s) {
    case ConnectionState.Connecting:
      return 'CONNECTING' as const
    case ConnectionState.Connected:
      return 'CONNECTED' as const
    case ConnectionState.Reconnecting:
    case ConnectionState.SignalReconnecting:
      return 'RECONNECTING' as const
    default:
      return 'DISCONNECTED' as const
  }
}

export function useLiveKitRoom(
  roomId: string,
  opts?: {
    onBlendshapes?: (identity: string, frame: BlendshapeFrame) => void
    // 대본 cue 동기: 호스트가 진행한 cue_index 를 수신(reliable·ordered 'script-cue' 토픽, API-SURFACE §DataChannel).
    onCue?: (payload: { sceneId: string; cueIndex: number }) => void
    // room-authority(reliable): 방 권위 이벤트. { type:'vgen_result', jobId } | { type:'vgen_stop' } | { type:'bg_change', url }(HOST-04·05).
    onRoomAuthority?: (msg: { type: string; jobId?: string; url?: string | null }) => void
    // 대본 역할 클레임 동기(ROOM-14): 서버 릴레이(sync-script-role)만 수락. 형태 검증은 수신측(isRoleEvent).
    onScriptRole?: (payload: unknown) => void
    // false면 연결 보류 — 방 입장(room_participants 행 생성)이 끝난 뒤에만 연결한다.
    // livekit-token 게이트가 활성 참가자 행을 요구하므로, join 전에 연결하면 403으로 실패한다.
    enabled?: boolean
    // 호스트 강퇴(HOST-01): 서버 removeParticipant → Disconnected(PARTICIPANT_REMOVED) 로 통지.
    onKicked?: () => void
    // 값이 바뀌면 재연결(새 토큰 발급) — viewer→actor 승격 시 canPublish=true 토큰으로 갈아끼운다(ROOM-21).
    reconnectNonce?: number
    // room-authority 클라 발행(vod_sync/vgen_*)의 발신자 검증용 — 방 호스트 identity(=auth uid, SEC-RA-1).
    hostIdentity?: string
  },
) {
  const roomRef = useRef<Room | null>(null)
  const session = useUserStore((s) => s.session)
  const enabled = opts?.enabled ?? true
  const reconnectNonce = opts?.reconnectNonce ?? 0

  // 수신 콜백은 ref로 (effect deps 오염 방지). 송신 스로틀·seq도 ref로 유지.
  const onBlendshapesRef = useRef(opts?.onBlendshapes)
  useEffect(() => {
    onBlendshapesRef.current = opts?.onBlendshapes
  }, [opts?.onBlendshapes])
  const onCueRef = useRef(opts?.onCue)
  useEffect(() => {
    onCueRef.current = opts?.onCue
  }, [opts?.onCue])
  const onRoomAuthorityRef = useRef(opts?.onRoomAuthority)
  useEffect(() => {
    onRoomAuthorityRef.current = opts?.onRoomAuthority
  }, [opts?.onRoomAuthority])
  const hostIdentityRef = useRef(opts?.hostIdentity)
  useEffect(() => {
    hostIdentityRef.current = opts?.hostIdentity
  }, [opts?.hostIdentity])
  const onKickedRef = useRef(opts?.onKicked)
  useEffect(() => {
    onKickedRef.current = opts?.onKicked
  }, [opts?.onKicked])
  const onScriptRoleRef = useRef(opts?.onScriptRole)
  useEffect(() => {
    onScriptRoleRef.current = opts?.onScriptRole
  }, [opts?.onScriptRole])
  const lastSentRef = useRef(0)
  const seqRef = useRef(0)
  const lastReactionRef = useRef(0)
  const seenReactionsRef = useRef<Set<string>>(new Set()) // 리액션 재전송 dedupe(rid)
  const seenChatRef = useRef<Set<string>>(new Set()) // 채팅 self-echo dedupe(rid) — 서버가 발신자에게도 broadcast

  // 믹서(ROOM-08) 브리지: audioStore 변경 → 모든 원격 참가자 setVolume 적용(스토어는 SDK 미보유 — 컨벤션 §2).
  useEffect(() => {
    return useAudioStore.subscribe((s) => {
      const room = roomRef.current
      if (!room) return
      room.remoteParticipants.forEach((p) => p.setVolume(mixedVolume(s, p.identity)))
    })
  }, [])
  const {
    setConnectionState,
    setParticipants,
    addMessage,
    setMicEnabled,
    setMutedByHost,
    setError,
    reset,
  } = useRoomStore.getState()

  useEffect(() => {
    if (!session || !enabled) return
    let cancelled = false

    const room = new Room({
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    roomRef.current = room

    const refreshParticipants = () => {
      const all = [room.localParticipant, ...room.remoteParticipants.values()]
      setParticipants(all.map(mapParticipant))
    }

    // 이벤트 리스너는 connect 전에 등록.
    room.on(RoomEvent.ConnectionStateChanged, (s) => {
      setConnectionState(mapConnState(s))
    })
    room.on(RoomEvent.ParticipantConnected, refreshParticipants)
    room.on(RoomEvent.ParticipantDisconnected, refreshParticipants)
    room.on(RoomEvent.ActiveSpeakersChanged, refreshParticipants)
    room.on(RoomEvent.ConnectionQualityChanged, refreshParticipants) // 참가자별 열화 반영(6인 실증)

    // 호스트 강퇴: 서버 removeParticipant → PARTICIPANT_REMOVED(종단, 재연결 안 함). 다른 사유(내가 나감·
    // 네트워크)는 무시 — kick 만 통지한다.
    room.on(RoomEvent.Disconnected, (reason) => {
      if (reason === DisconnectReason.PARTICIPANT_REMOVED) onKickedRef.current?.()
    })

    // 호스트 강제 음소거(HOST-08): 서버 updateParticipant(canPublish=false) → 로컬 권한 변경 이벤트.
    // canPublish 가 꺼지면 LiveKit 이 마이크 트랙을 언퍼블리시하므로 micEnabled 도 false 로 동기.
    room.on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant) => {
      if (!participant.isLocal) return
      const canPublish = participant.permissions?.canPublish ?? true
      setMutedByHost(!canPublish)
      if (!canPublish) setMicEnabled(false)
    })

    // 원격 오디오 재생: 구독된 오디오 트랙을 hidden <audio>에 attach.
    room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, _pub, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach()
          el.setAttribute('data-lk-audio', '')
          document.body.appendChild(el)
          // 믹서(ROOM-08): 저장된 볼륨을 새 트랙에 즉시 적용 — 재입장·재구독 시 볼륨 초기화 방지.
          if (participant instanceof RemoteParticipant) {
            participant.setVolume(mixedVolume(useAudioStore.getState(), participant.identity))
          }
        }
      },
    )
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove())
    })

    // 표정: 'blendshape' 토픽(220B 바이너리) 수신 → 검증 후 콜백. 고빈도라 store 안 거치고 ref로 흘림.
    // sender identity는 LiveKit participant에서만 취득(payload 신뢰 안 함).
    room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (topic === 'blendshape') {
        const frame = decodeBlendshapeFrame(payload) // 길이/crc16 불일치 시 null → 드롭
        if (frame && participant) onBlendshapesRef.current?.(participant.identity, frame)
        return
      }
      if (topic === 'script-cue') {
        // 서버 릴레이(advance-script-cue Edge)만 수락: 서버발은 participant=undefined.
        // 클라 직접 publish(participant 존재)는 진행권한 위조 가능 → 드롭(SEC-5, reaction 과 동형).
        if (participant) return
        try {
          const data = JSON.parse(new TextDecoder().decode(payload))
          if (typeof data?.cueIndex === 'number' && typeof data?.sceneId === 'string') {
            onCueRef.current?.({ sceneId: data.sceneId, cueIndex: data.cueIndex })
          }
        } catch { /* 잘못된 페이로드 무시 */ }
        return
      }
      if (topic === 'script-role') {
        // 서버 릴레이(sync-script-role Edge)만 수락 — 클라 직접 publish 는 클레임 위조 가능 → 드롭(SEC-5 동형).
        if (participant) return
        try {
          onScriptRoleRef.current?.(JSON.parse(new TextDecoder().decode(payload)))
        } catch { /* 잘못된 페이로드 무시 */ }
        return
      }
      if (topic === 'room-authority') {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload))
          if (typeof data?.type !== 'string') return
          // SEC-RA-1: 서버 릴레이(participant=undefined)는 신뢰. 클라 직접 publish 는 호스트 클라 타입
          // (vod_sync/vgen_*)이고 발신자가 방 호스트일 때만 수락 — 나머지(promoted/mode_change/bg_change 등
          // 서버 전용)는 스푸핑으로 간주해 드롭. script-cue/reaction 과 동형(단 호스트 클라 발행은 예외 허용).
          if (participant) {
            const HOST_CLIENT_TYPES = new Set(['vod_sync', 'vgen_result', 'vgen_stop'])
            if (!HOST_CLIENT_TYPES.has(data.type)) return
            if (!hostIdentityRef.current || participant.identity !== hostIdentityRef.current) return
          }
          // 접근제어는 수신측 getVgenUrl(멤버십·visibility 게이트)가 추가 재검증.
          onRoomAuthorityRef.current?.(data)
        } catch { /* 잘못된 페이로드 무시 */ }
        return
      }
      if (topic === 'reaction') {
        // 서버 릴레이만 수락: 서버발 데이터는 participant=undefined 로 도착. 클라 직접 publish(participant 존재)는
        // sender 위조가 가능하므로 스푸핑으로 간주해 드롭(send-reaction Edge 만이 sender 를 auth 로 확정).
        if (participant) return
        try {
          const data = JSON.parse(new TextDecoder().decode(payload))
          // 이모지·sender 는 표시/좌석용. sender 는 서버가 확정했으므로 신뢰. 이모지 길이만 방어(React 이스케이프).
          if (
            typeof data?.emoji === 'string' && data.emoji.length > 0 && data.emoji.length <= 20 &&
            typeof data?.sender === 'string' && data.sender.length > 0
          ) {
            // rid dedupe: 발신자 self-echo(서버가 본인에게도 broadcast)·혹시 모를 중복을 1회로.
            const rid = typeof data.rid === 'string' ? data.rid : null
            if (rid) {
              if (seenReactionsRef.current.has(rid)) return
              seenReactionsRef.current.add(rid)
              if (seenReactionsRef.current.size > 256) {
                const oldest = seenReactionsRef.current.values().next().value
                if (oldest !== undefined) seenReactionsRef.current.delete(oldest)
              }
            }
            useReactionStore.getState().addFloat(data.sender, data.emoji)
          }
        } catch { /* 잘못된 페이로드 무시 */ }
        return
      }
      if (topic !== 'chat') return
      try {
        const data = JSON.parse(new TextDecoder().decode(payload))
        // 디렉터 노트(ROOM-17): 같은 chat 채널의 message_type='note'(계약 — 별도 채널 금지).
        // author 는 payload 아닌 participant 에서 파생(채팅과 동형·위조 차단). 휘발성 — notesStore 만.
        if (data?.message_type === 'note') {
          if (typeof data.content !== 'string' || data.content.length < 1 || data.content.length > 500) return
          if (!participant) return
          useNotesStore.getState().addNote({
            id: crypto.randomUUID(),
            authorId: participant.identity,
            authorName: participant.name || participant.identity,
            content: data.content,
            ts: typeof data.ts === 'number' ? data.ts : Date.now(),
          })
          return
        }
        // 채팅: 서버 릴레이만 수락(reaction 과 동형) — 클라 직접 publish(participant 존재)는 sender 위조
        // 가능이라 드롭. send-chat Edge 가 sender/sender_name 을 auth 로 확정 + messages 영속.
        if (participant) return
        if (typeof data?.text !== 'string' || data.text.length < 1 || data.text.length > 500) return
        // rid dedupe: 발신자 self-echo(서버가 본인에게도 broadcast)를 1회로 — 로컬은 송신 시 이미 추가됨.
        const rid = typeof data.rid === 'string' ? data.rid : null
        if (rid) {
          if (seenChatRef.current.has(rid)) return
          seenChatRef.current.add(rid)
          if (seenChatRef.current.size > 256) {
            const oldest = seenChatRef.current.values().next().value
            if (oldest !== undefined) seenChatRef.current.delete(oldest)
          }
        }
        addMessage({
          id: typeof data.id === 'string' ? data.id : crypto.randomUUID(),
          sender: (typeof data.sender_name === 'string' && data.sender_name) ||
            (typeof data.sender === 'string' ? data.sender : '알 수 없음'),
          text: data.text,
          ts: typeof data.ts === 'number' ? data.ts : Date.now(),
          isLocal: false,
        })
      } catch {
        /* 잘못된 페이로드 무시 */
      }
    })

    ;(async () => {
      try {
        setConnectionState('CONNECTING')
        setError(null)
        const { server_url, token } = await fetchRoomToken(
          roomId,
          session.access_token,
        )
        if (cancelled) return
        await room.connect(server_url, token)
        if (cancelled) return
        // 마이크 발행 (join은 버튼 클릭이므로 autoplay 정책 통과).
        // 뷰어(canPublish=false)는 시도 자체를 안 하고, 발행 실패(권한 거부·장치 없음)는
        // 연결 실패가 아니다 — 그린룸 약속("마이크 없어도 입장") 준수. 연결은 유지, mic off.
        if (useRoomStore.getState().myRole !== 'viewer') {
          try {
            await room.localParticipant.setMicrophoneEnabled(true)
            setMicEnabled(true)
          } catch {
            setMicEnabled(false)
            toast.error(i18n.t('room.micBlocked'))
          }
        }
        refreshParticipants()
      } catch (err) {
        if (cancelled) return
        setConnectionState('FAILED')
        setError(err instanceof Error ? err.message : '방 연결에 실패했습니다.')
      }
    })()

    return () => {
      cancelled = true
      void room.disconnect()
      document.querySelectorAll('[data-lk-audio]').forEach((el) => el.remove())
      useNotesStore.getState().clearNotes() // 노트는 세션 휘발(ROOM-17) — 방 이탈 시 비움
      reset()
    }
  }, [
    roomId,
    session,
    enabled,
    reconnectNonce,
    setConnectionState,
    setParticipants,
    addMessage,
    setMicEnabled,
    setMutedByHost,
    setError,
    reset,
  ])

  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room || useRoomStore.getState().mutedByHost) return // 호스트 음소거 중엔 셀프 해제 불가
    const next = !useRoomStore.getState().micEnabled
    await room.localParticipant.setMicrophoneEnabled(next)
    setMicEnabled(next)
  }, [setMicEnabled])

  // 채팅 송신: 서버 릴레이(send-chat Edge → messages 영속 + broadcast). 직접 publishData 대신 서버
  // 경유인 이유(reaction·cue 와 동일): sender 를 auth 로 확정(스푸핑 차단) + 안정연결(첫 메시지 유실 0)
  // + 늦입장 히스토리 영속. 로컬 에코는 릴레이 성공 후 — "렌더된 내 메시지=전송(영속) 완료" ✓ 계약 유지.
  const sendChat = useCallback(
    async (text: string) => {
      const room = roomRef.current
      const token = useUserStore.getState().session?.access_token
      if (!room || !token) return
      const check = sanitizeChatInput(text.trim())
      if (!check.ok) {
        if (check.reason !== 'empty') toast.error(i18n.t('room.chatBlocked'))
        return
      }
      const rid = crypto.randomUUID()
      seenChatRef.current.add(rid) // 서버가 본인에게도 broadcast → 내 self-echo 를 dedupe
      try {
        await sendChatRelay(token, roomId, check.text, rid)
      } catch {
        toast.error(i18n.t('room.chatSendFailed'))
        return
      }
      addMessage({
        id: rid,
        sender: room.localParticipant.name || room.localParticipant.identity,
        text: check.text,
        ts: Date.now(),
        isLocal: true,
      })
    },
    [addMessage, roomId],
  )

  // 디렉터 노트 송신(ROOM-17): chat 채널 message_type='note'. publishData 는 자기 echo 없음 → 로컬 직접 추가.
  const sendNote = useCallback(async (content: string) => {
    const room = roomRef.current
    const trimmed = content.trim().slice(0, 500)
    if (!room || !trimmed) return
    const ts = Date.now()
    await room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify({ message_type: 'note', content: trimmed, ts })),
      { reliable: true, topic: 'chat' },
    )
    useNotesStore.getState().addNote({
      id: crypto.randomUUID(),
      authorId: room.localParticipant.identity,
      authorName: room.localParticipant.name || room.localParticipant.identity,
      content: trimmed,
      ts,
    })
  }, [])

  // 표정 송신: 원본 blendshape 맵 → 220B 프레임(seq++·crc16). 스로틀 초과분은 드롭(lossy).
  const sendBlendshapes = useCallback((blendshapes: Record<string, number>) => {
    const room = roomRef.current
    if (!room || room.state !== ConnectionState.Connected) return
    const now = Date.now()
    if (now - lastSentRef.current < BLENDSHAPE_SEND_INTERVAL_MS) return
    lastSentRef.current = now
    seqRef.current = (seqRef.current % 65535) + 1
    void room.localParticipant
      .publishData(encodeBlendshapeFrame(blendshapes, seqRef.current, now), {
        reliable: false,
        topic: 'blendshape',
      })
      .catch(() => {
        /* lossy 채널 — 송신 실패 무시 */
      })
  }, [])

  // 대본 cue 진행 송신(호스트): 서버 릴레이(advance-script-cue Edge → LiveKit broadcast) 경유.
  // 직접 publishData 대신 서버 경유(SEC-5): 서버가 host 를 auth 로 확정(진행권한 스푸핑 방어) + 안정연결(유실0).
  // 호스트는 로컬에서 이미 cueIndex 를 갱신하므로 서버가 되돌려줄 echo 는 handleCue(RoomPage)가 무시.
  const sendCue = useCallback(async (sceneId: string, cueIndex: number) => {
    const token = useUserStore.getState().session?.access_token
    if (!token) return
    // 실패 시 호스트만 로컬로 진행되고 다른 참가자는 못 받는다(SEC-5 서버 릴레이). 침묵 대신 재시도 유도.
    await advanceScriptCueRelay(token, roomId, sceneId, cueIndex).catch(() => {
      toast.error(i18n.t('room.cueSyncFailed'))
    })
  }, [roomId])

  // room-authority 송신(reliable): VGEN 공유재생 등. publishData 는 자기 echo 없음 — 발신자는 로컬 반영 별도.
  const sendRoomAuthority = useCallback(async (payload: Record<string, unknown>) => {
    const room = roomRef.current
    if (!room) return
    await room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(payload)),
      { reliable: true, topic: 'room-authority' },
    )
  }, [])

  // 리액션 송신: 서버 릴레이 경유(send-reaction Edge → LiveKit broadcast). 5/s 쓰로틀(사용자 발사 기준).
  // 직접 publishData 대신 서버 경유인 이유: LiveKit datachannel 개설지연으로 클라 직접 첫 방송은 유실됨(2탭 prod E2E ~30%).
  // 서버는 안정연결이라 유실0 + sender 를 auth 로 확정(스푸핑 방어). self-echo 는 로컬 즉시 + 서버가 되돌려줄 echo 는 rid dedupe.
  const sendReaction = useCallback((emoji: string) => {
    const room = roomRef.current
    if (!room || room.state !== ConnectionState.Connected) return
    const token = useUserStore.getState().session?.access_token
    if (!token) return
    const now = Date.now()
    if (now - lastReactionRef.current < 200) return
    lastReactionRef.current = now
    const rid = crypto.randomUUID()
    seenReactionsRef.current.add(rid) // 서버가 본인에게도 broadcast → 내 self-echo 를 dedupe
    useReactionStore.getState().addFloat(room.localParticipant.identity, emoji) // 즉시 self-echo(왕복 지연 체감 제거)
    // 릴레이 실패 = 내 float 만 뜨고 남들에겐 안 감 → 침묵 대신 알림(cue 릴레이와 동일 패턴).
    void sendReactionRelay(token, roomId, emoji, rid).catch(() => {
      toast.error(i18n.t('room.reactionSyncFailed'))
    })
  }, [roomId])

  const leave = useCallback(async () => {
    await roomRef.current?.disconnect()
  }, [])

  return { toggleMic, sendChat, sendNote, sendBlendshapes, sendCue, sendRoomAuthority, sendReaction, leave }
}
