import { useCallback, useEffect, useRef } from 'react'
import {
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from 'livekit-client'
import { useUserStore } from '@/stores/userStore'
import { useRoomStore } from '@/stores/roomStore'
import { useReactionStore } from '@/stores/reactionStore'
import { fetchRoomToken, mapParticipant } from '@/lib/livekit'
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
    // room-authority(reliable): VGEN 공유재생 등 방 권위 이벤트. { type:'vgen_result', jobId } | { type:'vgen_stop' }.
    onRoomAuthority?: (msg: { type: string; jobId?: string }) => void
    // false면 연결 보류 — 방 입장(room_participants 행 생성)이 끝난 뒤에만 연결한다.
    // livekit-token 게이트가 활성 참가자 행을 요구하므로, join 전에 연결하면 403으로 실패한다.
    enabled?: boolean
    // 호스트 강퇴(HOST-01): 서버 removeParticipant → Disconnected(PARTICIPANT_REMOVED) 로 통지.
    onKicked?: () => void
  },
) {
  const roomRef = useRef<Room | null>(null)
  const session = useUserStore((s) => s.session)
  const enabled = opts?.enabled ?? true

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
  const onKickedRef = useRef(opts?.onKicked)
  useEffect(() => {
    onKickedRef.current = opts?.onKicked
  }, [opts?.onKicked])
  const lastSentRef = useRef(0)
  const seqRef = useRef(0)
  const lastReactionRef = useRef(0)
  const seenReactionsRef = useRef<Set<string>>(new Set()) // 리액션 재전송 dedupe(rid)
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
      (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach()
          el.setAttribute('data-lk-audio', '')
          document.body.appendChild(el)
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
        try {
          const data = JSON.parse(new TextDecoder().decode(payload))
          if (typeof data?.cueIndex === 'number' && typeof data?.sceneId === 'string') {
            onCueRef.current?.({ sceneId: data.sceneId, cueIndex: data.cueIndex })
          }
        } catch { /* 잘못된 페이로드 무시 */ }
        return
      }
      if (topic === 'room-authority') {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload))
          // 접근제어는 수신측 getVgenUrl(멤버십·visibility 게이트)가 재검증 — 여기선 형태만 통과.
          if (typeof data?.type === 'string') onRoomAuthorityRef.current?.(data)
        } catch { /* 잘못된 페이로드 무시 */ }
        return
      }
      if (topic === 'reaction') {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload))
          // 이모지는 표시전용(고정 allowlist 아님 — 커스터마이즈 세트라 문자열 그대로 렌더, React 이스케이프).
          // 길이만 방어(스팸/비정상 페이로드 차단). sender identity 는 LiveKit participant 에서만 취득.
          if (typeof data?.emoji === 'string' && data.emoji.length > 0 && data.emoji.length <= 20 && participant) {
            // 재전송 dedupe: 송신측이 채널 개설 레이스를 이기려 rid 로 N회 재전송 → 같은 rid 는 1회만 렌더.
            const rid = typeof data.rid === 'string' ? data.rid : null
            if (rid) {
              if (seenReactionsRef.current.has(rid)) return
              seenReactionsRef.current.add(rid)
              if (seenReactionsRef.current.size > 256) {
                const oldest = seenReactionsRef.current.values().next().value
                if (oldest !== undefined) seenReactionsRef.current.delete(oldest)
              }
            }
            useReactionStore.getState().addFloat(participant.identity, data.emoji)
          }
        } catch { /* 잘못된 페이로드 무시 */ }
        return
      }
      if (topic !== 'chat') return
      try {
        const data = JSON.parse(new TextDecoder().decode(payload))
        if (typeof data?.text !== 'string') return
        addMessage({
          id: crypto.randomUUID(),
          sender: participant?.name || participant?.identity || '알 수 없음',
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
        await room.localParticipant.setMicrophoneEnabled(true)
        setMicEnabled(true)
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
      reset()
    }
  }, [
    roomId,
    session,
    enabled,
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

  const sendChat = useCallback(
    async (text: string) => {
      const room = roomRef.current
      const trimmed = text.trim()
      if (!room || !trimmed) return
      const ts = Date.now()
      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ text: trimmed, ts })),
        { reliable: true, topic: 'chat' },
      )
      // publishData는 발신자 자신에게 echo되지 않으므로 로컬 메시지는 직접 추가.
      addMessage({
        id: crypto.randomUUID(),
        sender: room.localParticipant.name || room.localParticipant.identity,
        text: trimmed,
        ts,
        isLocal: true,
      })
    },
    [addMessage],
  )

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

  // 대본 cue 진행 송신(호스트): reliable·ordered 로 전 참가자에 cue_index 브로드캐스트.
  const sendCue = useCallback(async (sceneId: string, cueIndex: number) => {
    const room = roomRef.current
    if (!room) return
    await room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify({ sceneId, cueIndex })),
      { reliable: true, topic: 'script-cue' },
    )
  }, [])

  // room-authority 송신(reliable): VGEN 공유재생 등. publishData 는 자기 echo 없음 — 발신자는 로컬 반영 별도.
  const sendRoomAuthority = useCallback(async (payload: Record<string, unknown>) => {
    const room = roomRef.current
    if (!room) return
    await room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(payload)),
      { reliable: true, topic: 'room-authority' },
    )
  }, [])

  // 리액션 송신: 이모지를 'reaction' 토픽으로 방송. 5/s 쓰로틀(사용자 발사 기준). publishData 는 자기 echo 없음 → 로컬 float 직접 추가.
  // reliable + rid 재전송: LiveKit 은 datachannel 개설 완료 전 publish 를 드롭한다(warm-up 으로 못 이김 — 2탭 E2E 실측).
  // 같은 rid 로 ~1.5s 에 걸쳐 여러 번 쏘면 최소 1발은 개설 후 도달하고, 수신측이 rid 로 dedupe → float 은 1개(TCP-over-lossy).
  const sendReaction = useCallback((emoji: string) => {
    const room = roomRef.current
    if (!room || room.state !== ConnectionState.Connected) return
    const now = Date.now()
    if (now - lastReactionRef.current < 200) return
    lastReactionRef.current = now
    const rid = crypto.randomUUID()
    const bytes = new TextEncoder().encode(JSON.stringify({ emoji, rid }))
    const publish = () => {
      const r = roomRef.current
      if (!r || r.state !== ConnectionState.Connected) return
      void r.localParticipant.publishData(bytes, { reliable: true, topic: 'reaction' }).catch(() => {})
    }
    publish()
    for (const d of [400, 1200, 2500, 4000]) setTimeout(publish, d) // 개설 레이스 대비 재전송(수신측 rid dedupe). 초기 세션 datachannel 개설 지연 커버.
    useReactionStore.getState().addFloat(room.localParticipant.identity, emoji)
  }, [])

  const leave = useCallback(async () => {
    await roomRef.current?.disconnect()
  }, [])

  return { toggleMic, sendChat, sendBlendshapes, sendCue, sendRoomAuthority, sendReaction, leave }
}
