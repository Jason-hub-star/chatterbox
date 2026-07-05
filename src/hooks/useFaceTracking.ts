import { useEffect, useRef, type RefObject } from 'react'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import {
  createFaceLandmarker,
  blendshapeMap,
  extractHeadPose,
  hasFace,
} from '@/lib/mediapipe/faceLandmarker'
import type { HeadPose } from '@/lib/pixi/rig'
import { useTrackingStore } from '@/stores/trackingStore'

// blendshape(categoryName) → 아바타 FaceParams (눈뜸·입벌림·미소·눈썹 0~1 + roll 라디안).
// 순수 매핑 — 트래킹→표정의 의미 계층을 문서화한다(테스트: tests/unit/faceParams.test.ts).
export interface FaceParams {
  eyeOpenLeft: number // 0(감음)~1(뜸)
  eyeOpenRight: number
  mouthOpen: number // 0~1
  smile: number // 0~1
  browRaise: number // 0~1
  headRoll: number // 라디안
}

export function toFaceParams(bs: Record<string, number>, roll: number): FaceParams {
  const g = (k: string) => bs[k] ?? 0
  return {
    eyeOpenLeft: 1 - g('eyeBlinkLeft'),
    eyeOpenRight: 1 - g('eyeBlinkRight'),
    mouthOpen: g('jawOpen'),
    smile: (g('mouthSmileLeft') + g('mouthSmileRight')) / 2,
    browRaise: Math.min(1, (g('browInnerUp') + g('browOuterUpLeft') + g('browOuterUpRight')) / 2),
    headRoll: roll,
  }
}

// 웹캠 → MediaPipe → onFrame 콜백 루프. blendshape은 React state가 아닌 콜백으로 직접 흘려보낸다
// (AvatarCanvas.md: 30fps 값을 React에 넣지 않음). state/fps/error만 store로 → UI 배지.
export function useFaceTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  opts?: { onFrame?: (blendshapes: Record<string, number>, headPose: HeadPose | null) => void },
): void {
  const setState = useTrackingStore((s) => s.setState)
  const setFaceDetected = useTrackingStore((s) => s.setFaceDetected)
  const setFps = useTrackingStore((s) => s.setFps)
  const setError = useTrackingStore((s) => s.setError)

  // 콜백은 ref로 흘려보내 effect(카메라/추론 루프) 재실행을 막는다. 갱신은 렌더가 아닌 effect에서.
  const onFrameRef = useRef(opts?.onFrame)
  useEffect(() => {
    onFrameRef.current = opts?.onFrame
  }, [opts?.onFrame])

  useEffect(() => {
    let cancelled = false
    let raf = 0
    let landmarker: FaceLandmarker | null = null
    let stream: MediaStream | null = null
    let lastVideoTime = -1
    let prevDetected: boolean | null = null
    let frames = 0
    let fpsAnchor = performance.now()

    function loop() {
      raf = requestAnimationFrame(loop)
      const video = videoRef.current
      const lm = landmarker
      if (!video || !lm || video.readyState < 2) return
      if (video.currentTime === lastVideoTime) return // 새 프레임만 추론
      lastVideoTime = video.currentTime

      const result = lm.detectForVideo(video, performance.now())
      const detected = hasFace(result)
      if (detected !== prevDetected) {
        setFaceDetected(detected)
        prevDetected = detected
      }
      if (detected) {
        const bs = blendshapeMap(result)
        // 52 blendshape + 랜드마크 head pose를 콜백으로 (RT-02 송신엔 bs만 씀 · aria self drive는 둘 다).
        onFrameRef.current?.(bs, extractHeadPose(result))
      }

      frames++
      const now = performance.now()
      if (now - fpsAnchor >= 1000) {
        setFps(Math.round((frames * 1000) / (now - fpsAnchor)))
        frames = 0
        fpsAnchor = now
      }
    }

    async function start() {
      try {
        setState('INITIALIZING')
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        })
        // cleanup 이후 resolve된 경우 카메라를 반드시 정리 (안 그러면 카메라가 계속 켜짐).
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        landmarker = await createFaceLandmarker()
        if (cancelled) {
          landmarker.close()
          return
        }

        setState('TRACKING')
        loop()
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setState('ERROR')
      }
    }

    start()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      landmarker?.close()
      useTrackingStore.getState().reset()
    }
  }, [videoRef, setState, setFaceDetected, setFps, setError])
}
