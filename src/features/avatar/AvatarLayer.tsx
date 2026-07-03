import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import { RigAvatar, createExpressionDriver, type HeadPose } from '@/lib/pixi/rig'
import { useFaceTracking } from '@/hooks/useFaceTracking'
import { useTrackingStore } from '@/stores/trackingStore'
import type { RoomParticipant } from '@/stores/roomStore'
import RemoteAvatar, { type RemoteFrameSink } from './RemoteAvatar'

// 방 안의 아바타 레이어(경로 B): 내 얼굴을 추적해 ① 네이티브 아리아 self-view를 즉시 구동하고
// ② blendshape을 송신(sendBlendshapes)한다. 원격 참가자 아바타들은 registry(프레임 싱크 맵)에
// 등록돼 수신 프레임으로 구동된다. self는 로컬이라 head pose(머리 방향)까지 반영, 송신은 52 blendshape만.
interface Props {
  participants: RoomParticipant[]
  // 참가자별 아바타: 내 아바타와 각 원격 아바타의 project.json URL 을 identity 로 분기(하드코딩 아님).
  selfProjectUrl: string
  remoteProjectUrl: (identity: string) => string
  sendBlendshapes: (blendshapes: Record<string, number>) => void
  remoteAvatars: RefObject<Map<string, RemoteFrameSink>>
}

export default function AvatarLayer({ participants, selfProjectUrl, remoteProjectUrl, sendBlendshapes, remoteAvatars }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const selfMountRef = useRef<HTMLDivElement>(null)
  const selfAvatarRef = useRef<RigAvatar | null>(null)
  const trackingState = useTrackingStore((s) => s.state)

  // self는 셀카 거울(video scaleX−1)과 방향 일치 → mirror on.
  const selfDriver = useMemo(() => createExpressionDriver({ mirror: true }), [])

  // 로컬 self-view 아바타(네이티브 아리아). StrictMode 이중 마운트 가드.
  useEffect(() => {
    let cancelled = false
    let created: RigAvatar | null = null
    const mount = selfMountRef.current
    if (mount) {
      RigAvatar.create(mount, { projectUrl: selfProjectUrl, size: 160 })
        .then((av) => {
          if (cancelled) {
            av.destroy()
            return
          }
          created = av
          selfAvatarRef.current = av
        })
        .catch((e: unknown) => {
          if (import.meta.env.DEV) console.warn('self 아바타 로드 실패', e)
        })
    }
    return () => {
      cancelled = true
      created?.destroy()
      selfAvatarRef.current = null
    }
  }, [selfProjectUrl])

  // 웹캠 → MediaPipe → self-view 구동(head pose 포함) + blendshape 송신(52ch, head pose 미포함).
  const onFrame = useCallback(
    (bs: Record<string, number>, headPose: HeadPose | null) => {
      selfAvatarRef.current?.setParams(selfDriver(bs, headPose))
      sendBlendshapes(bs)
    },
    [selfDriver, sendBlendshapes],
  )
  useFaceTracking(videoRef, null, { onFrame })

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
            className="overflow-hidden rounded-lg border border-stage-border bg-[#f4f0e8]"
            style={{ width: 160, height: 160 }}
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
          <RemoteAvatar
            key={p.identity}
            identity={p.identity}
            name={p.name}
            projectUrl={remoteProjectUrl(p.identity)}
            registry={remoteAvatars}
          />
        ))
      )}
    </div>
  )
}
