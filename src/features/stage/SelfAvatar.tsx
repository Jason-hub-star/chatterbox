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
  // S3(더빙 무대): 스프라이트만 — 크림 원 배경·크라운·상태 라벨 미렌더(영상 위 오버레이용).
  // 트래킹 폴백 오버레이·웹캠 입력 video 는 유지(기능 필수).
  bare?: boolean
}

const STATE_LABEL_KEY: Record<TrackingState, string> = {
  IDLE: 'avatar.trackingIdle',
  INITIALIZING: 'avatar.trackingInitializing',
  TRACKING: 'avatar.trackingActive',
  ERROR: 'avatar.trackingError',
  UNSUPPORTED: 'avatar.trackingUnsupported',
}

// 내 좌석: 웹캠 → MediaPipe → 네이티브 rig self-view 구동(head pose 포함) + blendshape 송신(52ch, head pose 미포함).
// 웹캠 video 는 순수 트래킹 입력 — 화면에는 안 보인다(주인님 콜 2026-07-10: 전 화면 pip 숨김).
export default function SelfAvatar({ projectUrl, sendBlendshapes, size, isHost = false, bare = false }: Props) {
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
      // preserveDrawingBuffer: 무대 녹화(stageRecorder)가 좌석 캔버스를 drawImage 로 합성 — 꺼져 있으면 검은 프레임.
      // bare(더빙 오버레이): 캔버스 자체 배경(#f4f0e8 판)도 투명화 — 영상 위 스프라이트만 남는다.
      RigAvatar.create(mount, { projectUrl, size, preserveDrawingBuffer: true, transparent: bare })
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
  }, [projectUrl, size, bare])

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
  // RM-JOIN-ROLE: 카메라 사용 불가(권한 거부/미지원) = 배우 참여 데드엔드 → 관전으로 참여 처방.
  // ?watch=1 로 재진입하면 게이트가 관전 자동선택(=joinRoomAsViewer, 좌석·웹캠 없음).
  const cameraUnusable = trackingState === 'ERROR' || trackingState === 'UNSUPPORTED'
  const goViewer = () => {
    const u = new URL(window.location.href)
    u.searchParams.set('watch', '1')
    window.location.assign(u.toString())
  }

  return (
    <>
      <div className="relative" style={{ width: size, height: size }}>
        <div
          ref={mountRef}
          data-self-avatar
          className={bare ? 'h-full w-full overflow-hidden' : `h-full w-full overflow-hidden rounded-full bg-[#f4f0e8] ${isHost ? 'ring-2 ring-fire-amber' : ''}`}
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
              {cameraUnusable && (
                <button
                  onClick={goViewer}
                  title={t('room.cameraDeniedHint')}
                  className="pointer-events-auto mt-1 rounded bg-fire-amber/90 px-2 py-0.5 text-[10px] font-semibold text-stage-base hover:opacity-90"
                >
                  {t('room.watchInstead')}
                </button>
              )}
            </span>
          </div>
        )}
        {isHost && !bare && <HostCrown />}
        {/* 웹캠 video = MediaPipe 입력 소스 — 언마운트하면 트래킹이 죽으므로 시각만 숨긴다
            (display:none 금지 — 브라우저가 렌더 파이프를 멈출 수 있음). */}
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
        />
      </div>
      {!bare && (
        <span className="rounded-full bg-stage-elevated/70 px-2 py-0.5 text-[11px] text-spring-green">
          {t('stage.selfLabel')}{isHost ? ` · ${t('stage.directorTag')}` : ''} {trackingState === 'TRACKING' ? `· ${t('stage.expressionSending')}` : `· ${t(STATE_LABEL_KEY[trackingState])}`}
        </span>
      )}
    </>
  )
}
