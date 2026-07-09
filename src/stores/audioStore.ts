import { create } from 'zustand'

// ROOM-08 음량 믹서(contracts/AudioMixer.md) — 참가자별 볼륨 + 마스터, 클라이언트 로컬 전용(전송 없음).
// SDK 객체는 store 에 담지 않는다(CODING-CONVENTIONS §2) — 적용은 useLiveKitRoom 이 이 스토어를
// 구독해 RemoteParticipant.setVolume 으로 브리지한다.
// ponytail: BGM 채널(앱에 HTMLAudioElement BGM 기능 자체가 아직 없음)·업링크 헬스체크(§ROOM-04)는
// 해당 기능 슬라이스와 함께 — 지금 만들면 죽은 코드.
interface AudioStore {
  masterVolume: number // 0~1, 모든 원격 트랙에 곱 적용(계약 MUST NOT: 일부만 반영 금지)
  participantVolumes: Record<string, number> // identity → 0~1 (미설정 = 1)
  setMasterVolume: (v: number) => void
  setParticipantVolume: (identity: string, v: number) => void
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

// 실제 트랙에 적용될 최종 볼륨 = master × 참가자별(기본 1).
export const mixedVolume = (
  s: Pick<AudioStore, 'masterVolume' | 'participantVolumes'>,
  identity: string,
): number => clamp01(s.masterVolume * (s.participantVolumes[identity] ?? 1))

export const useAudioStore = create<AudioStore>((set) => ({
  masterVolume: 1,
  participantVolumes: {},
  setMasterVolume: (v) => set({ masterVolume: clamp01(v) }),
  setParticipantVolume: (identity, v) =>
    set((s) => ({ participantVolumes: { ...s.participantVolumes, [identity]: clamp01(v) } })),
}))
