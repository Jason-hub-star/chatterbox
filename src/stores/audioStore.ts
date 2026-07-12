import { create } from 'zustand'

// ROOM-08 음량 믹서(contracts/AudioMixer.md) — 참가자별 볼륨 + 마스터 + BGM, 클라이언트 로컬 전용(전송 없음).
// SDK 객체는 store 에 담지 않는다(CODING-CONVENTIONS §2) — 원격 트랙 적용은 useLiveKitRoom 브리지,
// BGM·SFX 적용은 lib/sound.ts 가 이 스토어를 구독한다(G6 U-2 — 계약 BGM 채널 defer 마감).
// ponytail: 업링크 헬스체크(§ROOM-04)는 해당 기능 슬라이스와 함께 — 지금 만들면 죽은 코드.
interface AudioStore {
  masterVolume: number // 0~1, 모든 원격 트랙에 곱 적용(계약 MUST NOT: 일부만 반영 금지)
  participantVolumes: Record<string, number> // identity → 0~1 (미설정 = 1)
  bgmVolume: number // 0~1, BGM·SFX 공통(실볼륨 = master × bgm) — localStorage 영속
  setMasterVolume: (v: number) => void
  setParticipantVolume: (identity: string, v: number) => void
  setBgmVolume: (v: number) => void
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

const BGM_VOLUME_KEY = 'cb.bgmVolume'
const DEFAULT_BGM_VOLUME = 0.25 // 대화 밑에 깔리는 기본(G6 상의 — 자동 켜짐·낮은 볼륨)

function loadBgmVolume(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_BGM_VOLUME
  const raw = localStorage.getItem(BGM_VOLUME_KEY)
  if (raw === null) return DEFAULT_BGM_VOLUME
  const v = Number(raw)
  return Number.isFinite(v) ? clamp01(v) : DEFAULT_BGM_VOLUME
}

// 실제 트랙에 적용될 최종 볼륨 = master × 참가자별(기본 1).
export const mixedVolume = (
  s: Pick<AudioStore, 'masterVolume' | 'participantVolumes'>,
  identity: string,
): number => clamp01(s.masterVolume * (s.participantVolumes[identity] ?? 1))

export const useAudioStore = create<AudioStore>((set) => ({
  masterVolume: 1,
  participantVolumes: {},
  bgmVolume: loadBgmVolume(),
  setMasterVolume: (v) => set({ masterVolume: clamp01(v) }),
  setParticipantVolume: (identity, v) =>
    set((s) => ({ participantVolumes: { ...s.participantVolumes, [identity]: clamp01(v) } })),
  setBgmVolume: (v) => {
    const c = clamp01(v)
    set({ bgmVolume: c })
    try {
      localStorage.setItem(BGM_VOLUME_KEY, String(c))
    } catch { /* 프라이빗 모드 등 — 영속만 포기 */ }
  },
}))
