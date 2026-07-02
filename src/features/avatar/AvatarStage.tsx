import { useEffect, useRef } from 'react'
import { ProceduralAvatar } from '@/lib/pixi/proceduralAvatar'
import { useFaceTracking } from '@/hooks/useFaceTracking'
import { useTrackingStore, type TrackingState } from '@/stores/trackingStore'

const STATE_LABEL: Record<TrackingState, string> = {
  IDLE: '대기',
  INITIALIZING: 'MediaPipe 로딩 중…',
  TRACKING: '트래킹 중',
  ERROR: '오류',
  UNSUPPORTED: '미지원 기기',
}

const STATE_COLOR: Record<TrackingState, string> = {
  IDLE: 'bg-stage-border',
  INITIALIZING: 'bg-fire-amber',
  TRACKING: 'bg-green-500',
  ERROR: 'bg-fire-hot',
  UNSUPPORTED: 'bg-stage-border',
}

// 웹캠 프리뷰 + 절차적 아바타를 나란히 렌더. 마운트 즉시 트래킹 시작.
export default function AvatarStage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const avatarRef = useRef<ProceduralAvatar | null>(null)
  const mountRef = useRef<HTMLDivElement>(null)

  const state = useTrackingStore((s) => s.state)
  const faceDetected = useTrackingStore((s) => s.faceDetected)
  const fps = useTrackingStore((s) => s.fps)
  const error = useTrackingStore((s) => s.error)

  // PixiJS Application 생성/정리 (StrictMode 이중 마운트 가드).
  useEffect(() => {
    let cancelled = false
    let created: ProceduralAvatar | null = null
    const mount = mountRef.current
    if (mount) {
      ProceduralAvatar.create(mount).then((av) => {
        if (cancelled) {
          av.destroy()
          return
        }
        created = av
        avatarRef.current = av
        // dev 전용 렌더 검증 훅 (프로덕션 빌드에서 트리쉐이킹 제거).
        if (import.meta.env.DEV) (window as unknown as { __avatar?: ProceduralAvatar }).__avatar = av
      })
    }
    return () => {
      cancelled = true
      created?.destroy()
      avatarRef.current = null
    }
  }, [])

  useFaceTracking(videoRef, avatarRef)

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex items-center gap-2" role="status" aria-live="polite">
        <span className={`h-2.5 w-2.5 rounded-full ${STATE_COLOR[state]}`} />
        <span className="text-sm text-stage-text-muted">
          {STATE_LABEL[state]}
          {state === 'TRACKING' && ` · ${fps}fps · ${faceDetected ? '얼굴 인식됨' : '얼굴 없음'}`}
        </span>
      </div>

      {error && (
        <p className="rounded-lg bg-fire-hot/10 px-4 py-2 text-sm text-fire-hot" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-start justify-center gap-8">
        <figure className="flex flex-col items-center gap-2">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="w-[320px] rounded-lg border border-stage-border"
            style={{ transform: 'scaleX(-1)' }}
            aria-label="웹캠 프리뷰"
          />
          <figcaption className="text-xs text-stage-text-muted">웹캠 (내 얼굴)</figcaption>
        </figure>

        <figure className="flex flex-col items-center gap-2">
          <div
            ref={mountRef}
            className="overflow-hidden rounded-lg border border-stage-border"
            aria-label="아바타 캔버스"
          />
          <figcaption className="text-xs text-stage-text-muted">아바타 (표정 반영)</figcaption>
        </figure>
      </div>
    </div>
  )
}
