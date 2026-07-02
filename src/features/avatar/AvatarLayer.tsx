import { useEffect, useRef, type RefObject } from 'react'
import { ProceduralAvatar } from '@/lib/pixi/proceduralAvatar'
import { useFaceTracking } from '@/hooks/useFaceTracking'
import { useTrackingStore } from '@/stores/trackingStore'
import type { RoomParticipant } from '@/stores/roomStore'
import RemoteAvatar from './RemoteAvatar'

// 방 안의 아바타 레이어: 내 얼굴을 추적해 blendshape을 송신(sendBlendshapes)하고,
// 원격 참가자 아바타들을 registry(ref Map)에 등록해 수신 프레임으로 구동한다.
// 자기 얼굴은 로컬 self-view로 즉시 렌더(네트워크 왕복 없이 확인용).
interface Props {
  participants: RoomParticipant[]
  sendBlendshapes: (blendshapes: Record<string, number>) => void
  remoteAvatars: RefObject<Map<string, ProceduralAvatar>>
}

export default function AvatarLayer({ participants, sendBlendshapes, remoteAvatars }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const selfMountRef = useRef<HTMLDivElement>(null)
  const selfAvatarRef = useRef<ProceduralAvatar | null>(null)
  const trackingState = useTrackingStore((s) => s.state)

  // 로컬 self-view 아바타 (PixiJS Application). StrictMode 이중 마운트 가드.
  useEffect(() => {
    let cancelled = false
    let created: ProceduralAvatar | null = null
    const mount = selfMountRef.current
    if (mount) {
      ProceduralAvatar.create(mount, 160).then((av) => {
        if (cancelled) {
          av.destroy()
          return
        }
        created = av
        selfAvatarRef.current = av
      })
    }
    return () => {
      cancelled = true
      created?.destroy()
      selfAvatarRef.current = null
    }
  }, [])

  // 웹캠 → MediaPipe → self-view 구동 + blendshape 송신.
  useFaceTracking(videoRef, selfAvatarRef, { onFrame: sendBlendshapes })

  // dev 전용: 헤드리스 E2E에서 실얼굴 없이 DataChannel 왕복을 검증하기 위한 주입 훅.
  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as unknown as { __room?: { sendBlendshapes: typeof sendBlendshapes } }).__room = {
        sendBlendshapes,
      }
    }
  }, [sendBlendshapes])

  const remotes = participants.filter((p) => !p.isLocal)

  return (
    <div className="flex flex-wrap items-start gap-8">
      <figure className="flex flex-col items-center gap-2">
        <div className="flex items-start gap-3">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="w-[120px] rounded-lg border border-stage-border"
            style={{ transform: 'scaleX(-1)' }}
            aria-label="웹캠 (내 얼굴)"
          />
          <div
            ref={selfMountRef}
            data-self-avatar
            className="overflow-hidden rounded-lg border border-stage-border"
          />
        </div>
        <figcaption className="text-xs text-stage-text-muted">
          나 {trackingState === 'TRACKING' ? '· 표정 전송 중' : `· ${trackingState}`}
        </figcaption>
      </figure>

      {remotes.length === 0 ? (
        <p className="self-center text-sm text-stage-text-muted">
          상대가 들어오면 아바타가 여기 나타나요.
        </p>
      ) : (
        remotes.map((p) => (
          <RemoteAvatar key={p.identity} identity={p.identity} name={p.name} registry={remoteAvatars} />
        ))
      )}
    </div>
  )
}
