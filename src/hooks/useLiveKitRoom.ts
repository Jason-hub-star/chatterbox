import { useCallback, useEffect, useRef } from 'react'
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from 'livekit-client'
import { useUserStore } from '@/stores/userStore'
import { useRoomStore } from '@/stores/roomStore'
import { fetchRoomToken, mapParticipant } from '@/lib/livekit'

// SSOT: reference/patterns/livekit-client.md · state-machines/WebRTC.md
// Phase 1B PoC: 오디오 전용 2인 연결. 영상·채팅·blendshape·토큰갱신은 Phase 2 (ponytail).

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

export function useLiveKitRoom(roomId: string) {
  const roomRef = useRef<Room | null>(null)
  const session = useUserStore((s) => s.session)
  const {
    setConnectionState,
    setParticipants,
    addMessage,
    setMicEnabled,
    setError,
    reset,
  } = useRoomStore.getState()

  useEffect(() => {
    if (!session) return
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

    // 채팅: 'chat' 토픽 수신 → store. sender는 LiveKit participant에서 취득(payload 신뢰 안 함).
    room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
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
    setConnectionState,
    setParticipants,
    addMessage,
    setMicEnabled,
    setError,
    reset,
  ])

  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
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

  const leave = useCallback(async () => {
    await roomRef.current?.disconnect()
  }, [])

  return { toggleMic, sendChat, leave }
}
