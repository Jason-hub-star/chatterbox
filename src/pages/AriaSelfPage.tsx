import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AriaAvatar, createExpressionDriver, type HeadPose } from '@/lib/pixi/aria'
import { useFaceTracking } from '@/hooks/useFaceTracking'
import { useTrackingStore, type TrackingState } from '@/stores/trackingStore'

// B2: 웹캠 → 네이티브 아리아 self drive. 검증된 blendshape→ParamXxx 매핑(expressionDriver = drive.html
// convert() 이식)으로 실 rig를 직접 구동. 절차적 아바타(/avatar-poc)의 아리아판.
// 고빈도 프레임은 React state 우회 — onFrame에서 avatar.setParams 직접 호출(리렌더 없음).
const ARIA_PROJECT = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/aria/project.json`

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

export default function AriaSelfPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<AriaAvatar | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const state = useTrackingStore((s) => s.state)
  const faceDetected = useTrackingStore((s) => s.faceDetected)
  const fps = useTrackingStore((s) => s.fps)
  const error = useTrackingStore((s) => s.error)

  // 인스턴스별 적응 상태(eyeOpenBaseline 등)를 마운트당 하나 유지.
  const driver = useMemo(() => createExpressionDriver({ mirror: true }), [])

  useEffect(() => {
    let cancelled = false
    let created: AriaAvatar | null = null
    const mount = mountRef.current
    if (mount) {
      AriaAvatar.create(mount, { projectUrl: ARIA_PROJECT, size: 420 })
        .then((av) => {
          if (cancelled) {
            av.destroy()
            return
          }
          created = av
          avatarRef.current = av
          if (import.meta.env.DEV) (window as unknown as { __ariaAvatar?: AriaAvatar }).__ariaAvatar = av
        })
        .catch((e: unknown) => {
          if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e))
        })
    }
    return () => {
      cancelled = true
      created?.destroy()
      avatarRef.current = null
    }
  }, [])

  const onFrame = useCallback(
    (bs: Record<string, number>, headPose: HeadPose | null) => {
      avatarRef.current?.setParams(driver(bs, headPose))
    },
    [driver],
  )

  // 절차적 아바타 없이(null) onFrame으로만 네이티브 아리아 구동.
  useFaceTracking(videoRef, null, { onFrame })

  return (
    <main className="flex min-h-screen flex-col bg-stage-base text-stage-text">
      <header className="flex items-center justify-between border-b border-stage-border px-6 py-3">
        <div>
          <h1 className="text-lg font-bold">아리아 — 네이티브 self drive (경로 B, B2)</h1>
          <p className="text-xs text-stage-text-muted">
            웹캠을 허용하면 실 rig 아리아가 얼굴을 따라 움직여요(눈·입·입꼴·고개 기울임).
          </p>
        </div>
        <nav className="flex gap-4 text-sm text-stage-text-muted">
          <Link to="/avatar-aria-native" className="hover:text-stage-text">
            B1 게이트
          </Link>
          <Link to="/avatar-aria" className="hover:text-stage-text">
            iframe PoC
          </Link>
          <Link to="/" className="hover:text-stage-text">
            홈
          </Link>
        </nav>
      </header>

      <div className="flex flex-col items-center gap-6 p-6">
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <span className={`h-2.5 w-2.5 rounded-full ${STATE_COLOR[state]}`} />
          <span className="text-sm text-stage-text-muted">
            {STATE_LABEL[state]}
            {state === 'TRACKING' && ` · ${fps}fps · ${faceDetected ? '얼굴 인식됨' : '얼굴 없음'}`}
          </span>
        </div>

        {(error || loadError) && (
          <p className="rounded-lg bg-fire-hot/10 px-4 py-2 text-sm text-fire-hot" role="alert">
            {loadError ? `아바타 로드 실패: ${loadError}` : error}
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
              className="overflow-hidden rounded-lg border border-stage-border bg-[#f4f0e8]"
              style={{ width: 420, height: 420 }}
              aria-label="네이티브 아리아 캔버스"
            />
            <figcaption className="text-xs text-stage-text-muted">아리아 실 rig (표정 반영)</figcaption>
          </figure>
        </div>
      </div>
    </main>
  )
}
