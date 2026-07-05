import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RigAvatar, createExpressionDriver, type HeadPose } from '@/lib/pixi/rig'
import { useFaceTracking } from '@/hooks/useFaceTracking'
import { useTrackingStore, type TrackingState } from '@/stores/trackingStore'

interface Props {
  projectUrl: string
  sendBlendshapes: (blendshapes: Record<string, number>) => void
  size: number
}

const STATE_LABEL_KEY: Record<TrackingState, string> = {
  IDLE: 'avatar.trackingIdle',
  INITIALIZING: 'avatar.trackingInitializing',
  TRACKING: 'avatar.trackingActive',
  ERROR: 'avatar.trackingError',
  UNSUPPORTED: 'avatar.trackingUnsupported',
}

// 내 좌석: 웹캠 → MediaPipe → 네이티브 rig self-view 구동(head pose 포함) + blendshape 송신(52ch, head pose 미포함).
// 웹캠은 트래킹 입력이라 코너 pip 로 작게 유지 — 표시 크기는 트래킹 품질과 무관(스트림 원본 해상도 사용).
export default function SelfAvatar({ projectUrl, sendBlendshapes, size }: Props) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<RigAvatar | null>(null)
  const trackingState = useTrackingStore((s) => s.state)

  // self 는 셀카 거울(video scaleX−1)과 방향 일치 → mirror on.
  const driver = useMemo(() => createExpressionDriver({ mirror: true }), [])

  // 로컬 self-view rig(네이티브). StrictMode 이중 마운트 가드.
  useEffect(() => {
    let cancelled = false
    let created: RigAvatar | null = null
    const mount = mountRef.current
    if (mount) {
      RigAvatar.create(mount, { projectUrl, size })
        .then((av) => {
          if (cancelled) {
            av.destroy()
            return
          }
          created = av
          avatarRef.current = av
        })
        .catch((e: unknown) => {
          if (import.meta.env.DEV) console.warn('self 아바타 로드 실패', e)
        })
    }
    return () => {
      cancelled = true
      created?.destroy()
      avatarRef.current = null
    }
  }, [projectUrl, size])

  // 웹캠 → self-view 구동(head pose 포함) + blendshape 송신(head pose 미포함).
  const onFrame = useCallback(
    (bs: Record<string, number>, headPose: HeadPose | null) => {
      avatarRef.current?.setParams(driver(bs, headPose))
      sendBlendshapes(bs)
    },
    [driver, sendBlendshapes],
  )
  useFaceTracking(videoRef, { onFrame })

  // dev 전용: 헤드리스 E2E 에서 실얼굴 없이 DataChannel 왕복을 검증하기 위한 주입 훅.
  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as unknown as { __room?: { sendBlendshapes: typeof sendBlendshapes } }).__room = {
        sendBlendshapes,
      }
    }
  }, [sendBlendshapes])

  return (
    <>
      <div className="relative" style={{ width: size, height: size }}>
        <div
          ref={mountRef}
          data-self-avatar
          className="h-full w-full overflow-hidden rounded-lg bg-[#f4f0e8]"
        />
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-label={t('stage.webcamAriaLabel')}
          className="absolute bottom-1 right-1 w-10 rounded border border-stage-border/80"
          style={{ transform: 'scaleX(-1)' }}
        />
      </div>
      <span className="text-[11px] text-spring-green">
        {t('stage.selfLabel')} {trackingState === 'TRACKING' ? `· ${t('stage.expressionSending')}` : `· ${t(STATE_LABEL_KEY[trackingState])}`}
      </span>
    </>
  )
}
