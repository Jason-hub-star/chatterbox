import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { RigAvatar, createExpressionDriver, type HeadPose } from '@/lib/pixi/rig'
import { useFaceTracking } from '@/hooks/useFaceTracking'
import { useTrackingStore } from '@/stores/trackingStore'

// /stream?project=<url>&bg=green|black — 데스크톱 방송 앱(snack-streamer)이 로드하는 풀스크린
// 웹캠 구동 아바타 렌더 페이지. UI 크롬 0, 캔버스 투명(방송 앱이 canvas.captureStream 으로 캡처).
// 웹캠 self drive 의 풀스크린·임의 projectUrl·투명 변종. 공개 라우트(인증 불필요 — 자산은 Storage 공개).
// 텍스트는 영어 최소화(i18n 게이트 회피 · 머신 로드 페이지라 유저 노출 없음).

const BG: Record<string, string> = { green: '#00b140', black: '#000000' }

// snack-streamer(Electron) preload 가 주입하는 방송 브릿지. 일반 브라우저엔 없음(캡처 no-op).
interface StreamerBridge {
  isStreamer: boolean
  sendChunk: (chunk: ArrayBuffer) => void
  finish?: () => void
  reportStatus?: (s: string) => void
  onControl: (cb: (msg: { action: 'start' | 'stop' }) => void) => (() => void) | void
}

function useSquareSize(): number {
  const [size, setSize] = useState(() => Math.min(window.innerWidth, window.innerHeight))
  useEffect(() => {
    const onResize = () => setSize(Math.min(window.innerWidth, window.innerHeight))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

export default function StreamPage() {
  const [params] = useSearchParams()
  const projectUrl = params.get('project')
  const pageBg = BG[params.get('bg') ?? ''] ?? 'transparent'
  const size = useSquareSize()

  const videoRef = useRef<HTMLVideoElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<RigAvatar | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const state = useTrackingStore((s) => s.state)

  // self 거울(video scaleX−1)과 방향 일치 → mirror on. 마운트당 적응 상태 1개.
  const driver = useMemo(() => createExpressionDriver({ mirror: true }), [])

  useEffect(() => {
    if (!projectUrl) return
    let cancelled = false
    let created: RigAvatar | null = null
    const mount = mountRef.current
    if (mount) {
      RigAvatar.create(mount, { projectUrl, size, transparent: true, preserveDrawingBuffer: true })
        .then((av) => {
          if (cancelled) {
            av.destroy()
            return
          }
          created = av
          avatarRef.current = av
          if (import.meta.env.DEV)
            (window as unknown as { __streamAvatar?: RigAvatar }).__streamAvatar = av
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
  }, [projectUrl, size])

  const onFrame = useCallback(
    (bs: Record<string, number>, headPose: HeadPose | null) => {
      avatarRef.current?.setParams(driver(bs, headPose))
    },
    [driver],
  )
  useFaceTracking(videoRef, { onFrame })

  // snack-streamer 데스크톱 앱 안이면(preload 브릿지 존재) 방송 캡처 활성화.
  // 아바타 canvas + 마이크 → MediaRecorder(webm) → 브릿지 → Electron main → ffmpeg → RTMP/파일.
  useEffect(() => {
    const bridge = (window as unknown as { snackStreamer?: StreamerBridge }).snackStreamer
    if (!bridge?.isStreamer) return
    let recorder: MediaRecorder | null = null
    let micStream: MediaStream | null = null
    let drawRaf = 0
    // 순차 전송 체인 — arrayBuffer() 가 비동기라 순서·완결을 보장(레이스 방지).
    let sendChain: Promise<void> = Promise.resolve()

    const start = async (): Promise<void> => {
      // 이전 세션 잔여 정리(재시작 시 ffmpeg 가 중간 스트림을 받아 'Invalid data' 나던 것 방지).
      if (recorder) {
        try {
          if (recorder.state !== 'inactive') recorder.stop()
        } catch {
          /* */
        }
        recorder = null
      }
      if (drawRaf) {
        cancelAnimationFrame(drawRaf)
        drawRaf = 0
      }
      sendChain = Promise.resolve()
      const canvas = avatarRef.current?.canvas
      if (!canvas) {
        bridge.reportStatus?.('no-canvas')
        return
      }
      // 2048² 원본을 방송 해상도(720²)로 매 프레임 복사 → MediaRecorder 인코딩 부담 8배↓(부드러움).
      const RES = 720
      const scaled = document.createElement('canvas')
      scaled.width = RES
      scaled.height = RES
      const sctx = scaled.getContext('2d')
      const pump = (): void => {
        if (sctx) {
          // 매 프레임 불투명 배경으로 채운 뒤 아바타를 덮어그림 →
          // 투명 캔버스가 yuv420p 인코딩 때 흰색으로 평탄화되던 문제 제거.
          sctx.fillStyle = '#0b0f1a'
          sctx.fillRect(0, 0, RES, RES)
          sctx.drawImage(canvas, 0, 0, RES, RES)
        }
        drawRaf = requestAnimationFrame(pump)
      }
      pump()
      const video = scaled.captureStream(30)
      // 마이크는 최대 2.5s 만 대기(권한 프롬프트가 비디오 송출을 막지 않게) — 없으면 비디오만.
      micStream = await Promise.race<MediaStream | null>([
        navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ])
      const mixed = new MediaStream([
        ...video.getVideoTracks(),
        ...(micStream ? micStream.getAudioTracks() : []),
      ])
      const mime = 'video/webm;codecs=vp8,opus'
      recorder = new MediaRecorder(
        mixed,
        MediaRecorder.isTypeSupported(mime) ? { mimeType: mime } : undefined,
      )
      let n = 0
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          n++
          const blob = e.data
          sendChain = sendChain
            .then(() => blob.arrayBuffer())
            .then((b) => bridge.sendChunk(b))
        }
      }
      // 정지 시: 마지막 청크까지 drain 된 뒤 finish → main 이 ffmpeg stdin 을 닫아 mux 마무리.
      recorder.onstop = () => {
        void sendChain.then(() => {
          bridge.reportStatus?.(`drained ${n} chunks`)
          bridge.finish?.()
        })
      }
      recorder.start(500)
      bridge.reportStatus?.('recording')
    }
    const stop = (): void => {
      if (drawRaf) cancelAnimationFrame(drawRaf)
      drawRaf = 0
      const r = recorder
      recorder = null
      if (r && r.state !== 'inactive') r.stop() // onstop → finish
      else bridge.finish?.()
      micStream?.getTracks().forEach((track) => track.stop())
      micStream = null
    }
    const off = bridge.onControl((msg) => {
      if (msg.action === 'start') {
        setRecording(true)
        void start()
      } else {
        setRecording(false)
        stop()
      }
    })
    return () => {
      if (typeof off === 'function') off()
      stop()
    }
  }, [])

  if (!projectUrl) {
    return (
      <main className="grid h-[100dvh] place-items-center bg-black text-white">
        <p className="text-sm opacity-80">Missing ?project= (avatar project.json URL).</p>
      </main>
    )
  }

  return (
    <main
      className="grid h-[100dvh] place-items-center overflow-hidden"
      style={{ background: pageBg }}
    >
      {recording && (
        <div
          role="status"
          className="fixed left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white"
        >
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
          LIVE
        </div>
      )}
      {/* 아바타 캔버스(투명) — 방송 앱이 이 캔버스를 캡처 */}
      <div ref={mountRef} data-stream-avatar style={{ width: size, height: size }} />
      {/* 웹캠 = 트래킹 입력. 화면엔 안 보이게(스트림에서 제외) 하되 재생은 유지(display:none 금지 — 디코드 정지). */}
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-hidden
        style={{
          position: 'fixed',
          right: 0,
          bottom: 0,
          width: 2,
          height: 2,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
      {loadError && (
        <p
          role="alert"
          className="fixed left-1/2 top-4 -translate-x-1/2 rounded bg-red-600/80 px-3 py-1 text-xs text-white"
        >
          Avatar load failed: {loadError}
        </p>
      )}
      {import.meta.env.DEV && state !== 'TRACKING' && (
        <span className="fixed bottom-2 left-2 text-[10px] text-white/50">{state}</span>
      )}
    </main>
  )
}
