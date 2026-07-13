import { create } from 'zustand'

// ROOM-08 음량 믹서(contracts/AudioMixer.md) — 참가자별 볼륨 + 마스터 + BGM, 클라이언트 로컬 전용(전송 없음).
// SDK 객체는 store 에 담지 않는다(CODING-CONVENTIONS §2) — 원격 트랙 적용은 useLiveKitRoom 브리지,
// BGM·SFX 적용은 lib/sound.ts 가 이 스토어를 구독한다(G6 U-2 — 계약 BGM 채널 defer 마감).
// ponytail: 업링크 헬스체크(§ROOM-04)는 해당 기능 슬라이스와 함께 — 지금 만들면 죽은 코드.
interface AudioStore {
  masterVolume: number // 0~1, 모든 원격 트랙에 곱 적용(계약 MUST NOT: 일부만 반영 금지)
  participantVolumes: Record<string, number> // identity → 0~1 (미설정 = 1)
  bgmVolume: number // 0~1, BGM·SFX 공통(실볼륨 = master × bgm) — localStorage 영속
  micDeviceId: string | null // 선택 마이크 입력 기기(null=시스템 기본) — localStorage 영속
  bgmEnabled: boolean // BGM 켜짐(끄면 슬라이더 볼륨을 기억한 채 무음) — localStorage 영속
  setMasterVolume: (v: number) => void
  setParticipantVolume: (identity: string, v: number) => void
  setBgmVolume: (v: number) => void
  setBgmEnabled: (on: boolean) => void
  setMicDeviceId: (id: string | null) => void
  // ponytail: 마이크 게인 defer — Web Audio(MediaStreamSource→GainNode→Destination) 체인 신규 필요.
  //   ceiling: 지금은 기기선택 + masterVolume 으로 충족. 업그레이드 경로 = 로컬 트랙에 게인 노드 삽입.
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

const BGM_VOLUME_KEY = 'cb.bgmVolume'
const DEFAULT_BGM_VOLUME = 0.25 // 대화 밑에 깔리는 기본(G6 상의 — 자동 켜짐·낮은 볼륨)
const MIC_DEVICE_KEY = 'cb.micDeviceId'
const BGM_ENABLED_KEY = 'cb.bgmEnabled'

function loadMicDeviceId(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(MIC_DEVICE_KEY) || null
}

function loadBgmEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(BGM_ENABLED_KEY) !== '0' // 기본 켜짐(자동재생 의도 — G6 U-2)
}

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
  micDeviceId: loadMicDeviceId(),
  bgmEnabled: loadBgmEnabled(),
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
  setMicDeviceId: (id) => {
    set({ micDeviceId: id })
    try {
      if (id) localStorage.setItem(MIC_DEVICE_KEY, id)
      else localStorage.removeItem(MIC_DEVICE_KEY)
    } catch { /* 프라이빗 모드 등 — 영속만 포기 */ }
  },
  setBgmEnabled: (on) => {
    set({ bgmEnabled: on })
    try {
      localStorage.setItem(BGM_ENABLED_KEY, on ? '1' : '0')
    } catch { /* 프라이빗 모드 등 — 영속만 포기 */ }
  },
}))
