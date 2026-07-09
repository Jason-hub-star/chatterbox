import type { HeadPose } from '@/lib/pixi/rig'

// Self 프레임 탭(G-64 PiP): SelfAvatar 의 onFrame 이 등록된 싱크에도 같은 프레임을 흘린다.
// 고빈도(≈30fps)라 React state 우회 — remoteAvatars sink 레지스트리와 동형 패턴.
// 구독자는 PiP 하나뿐이라 단일 슬롯(Set 은 YAGNI). 미등록이면 no-op.
export type SelfFrameSink = (bs: Record<string, number>, headPose: HeadPose | null) => void

let sink: SelfFrameSink | null = null

export const setSelfFrameSink = (s: SelfFrameSink | null) => {
  sink = s
}

export const emitSelfFrame: SelfFrameSink = (bs, headPose) => {
  sink?.(bs, headPose)
}
