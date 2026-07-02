import { create } from 'zustand'

// Tracking FSM 부분집합 (state-machines/Tracking.md).
// PoC-최소: IDLE→INITIALIZING→TRACKING / ERROR / UNSUPPORTED.
// ponytail: CALIBRATING·PAUSED·재시작 카운터는 Phase 2 (캘리브레이션 위저드·visibilitychange).
// 이 store는 순수 상태 컨테이너 — MediaPipe/Pixi를 import하지 않아 단위 테스트 가능(roomStore와 동일 패턴).
export type TrackingState = 'IDLE' | 'INITIALIZING' | 'TRACKING' | 'ERROR' | 'UNSUPPORTED'

interface TrackingStore {
  state: TrackingState
  faceDetected: boolean
  fps: number
  error: string | null
  setState: (state: TrackingState) => void
  setFaceDetected: (faceDetected: boolean) => void
  setFps: (fps: number) => void
  setError: (error: string | null) => void
  reset: () => void
}

const INITIAL = {
  state: 'IDLE' as TrackingState,
  faceDetected: false,
  fps: 0,
  error: null,
}

export const useTrackingStore = create<TrackingStore>((set) => ({
  ...INITIAL,
  setState: (state) => set({ state }),
  setFaceDetected: (faceDetected) => set({ faceDetected }),
  setFps: (fps) => set({ fps }),
  setError: (error) => set({ error }),
  reset: () => set({ ...INITIAL }),
}))
