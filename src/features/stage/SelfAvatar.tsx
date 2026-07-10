import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RigAvatar, createExpressionDriver, type HeadPose } from '@/lib/pixi/rig'
import { useFaceTracking } from '@/hooks/useFaceTracking'
import { useTrackingStore, type TrackingState } from '@/stores/trackingStore'
import { emitSelfFrame } from '@/features/avatar/selfFrameSink'
import HostCrown from './HostCrown'

interface Props {
  projectUrl: string
  sendBlendshapes: (blendshapes: Record<string, number>) => void
  size: number
  isHost?: boolean
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
export default function SelfAvatar({ projectUrl, sendBlendshapes, size, isHost = false }: Props) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<RigAvatar | null>(null)
  const trackingState = useTrackingStore((s) => s.state)
  const faceDetected = useTrackingStore((s) => s.faceDetected)

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
      emitSelfFrame(bs, headPose) // G-64 PiP 미리보기 탭(구독자 없으면 no-op)
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

  // 트래킹 실패 폴백(ROOM-11, §6.4): 얼굴 미인식(TRACKING 중) = "인식 중…", ERROR/UNSUPPORTED = 상태 라벨.
  // IDLE/INITIALIZING 은 로딩이지 실패가 아니라 오버레이 없음.
  const fallbackKey =
    trackingState === 'TRACKING' && !faceDetected
      ? 'avatar.trackingRecovering'
      : trackingState === 'ERROR' || trackingState === 'UNSUPPORTED'
        ? STATE_LABEL_KEY[trackingState]
        : null

  return (
    <>
      <div className="relative" style={{ width: size, height: size }}>
        <div
          ref={mountRef}
          data-self-avatar
          className={`h-full w-full overflow-hidden rounded-full bg-[#f4f0e8] ${isHost ? 'ring-2 ring-fire-amber' : ''}`}
        />
        {fallbackKey && (
          <div
            data-tracking-fallback
            role="status"
            className="pointer-events-none absolute inset-0 grid place-items-center rounded-full border-2 border-dashed bg-black/40"
            style={{ borderColor: 'rgba(255,100,100,.4)' }}
          >
            <span className="flex flex-col items-center gap-0.5 text-[11px] font-medium text-stage-text">
              <span aria-hidden className="text-lg">👤</span>
              {t(fallbackKey)}
            </span>
          </div>
        )}
        {isHost && <HostCrown />}
        {/* 웹캠 = 트래킹 입력 pip. 원형 프레임이라 코너 대신 하단 중앙에 겹쳐 둔다. */}
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-label={t('stage.webcamAriaLabel')}
          className="absolute bottom-0 left-1/2 w-9 -translate-x-1/2 rounded border border-stage-border/80"
          style={{ transform: 'translateX(-50%) scaleX(-1)' }}
        />
      </div>
      <span className="rounded-full bg-stage-elevated/70 px-2 py-0.5 text-[11px] text-spring-green">
        {t('stage.selfLabel')}{isHost ? ` · ${t('stage.directorTag')}` : ''} {trackingState === 'TRACKING' ? `· ${t('stage.expressionSending')}` : `· ${t(STATE_LABEL_KEY[trackingState])}`}
      </span>
    </>
  )
}
