import { useAudioStore } from '@/stores/audioStore'

// G6 U-2 사운드 싱글턴(BGM 순환 + SFX 원샷) — SDK/DOM 객체는 store 에 담지 않는다(컨벤션 §2).
// BGM 은 HTMLAudioElement(contracts/AudioMixer.md MUST — WebAudio 단독 금지), 배경(맵)과 디커플:
// 3곡 플레이리스트를 랜덤 시작점에서 ended→다음 곡으로 순환한다(2026-07-13 상의 — 배경별 무드는
// 루프 피로·비청취로 기각, GOAL-LADDER G6). 볼륨 = masterVolume × bgmVolume(계약 "master scales all").
// autoplay 게이트: 제스처 전 play() 거부(리로드 재입장이 실케이스) → 첫 pointerdown 1회에 재시도.

const BGM_PLAYLIST = [
  '/sounds/bgm-village-dusk.m4a',
  '/sounds/bgm-piano-memory.m4a',
  '/sounds/bgm-whistle-tale.m4a',
]

const SFX_URL = {
  pop: '/sounds/sfx-emote-pop.m4a',
  pollOpen: '/sounds/sfx-poll-open.m4a',
  pollReveal: '/sounds/sfx-poll-reveal.m4a',
  join: '/sounds/sfx-join-chime.m4a',
} as const
export type SfxId = keyof typeof SFX_URL

const SFX_THROTTLE_MS = 150 // 같은 SFX 연타 스팸 가드(이모트 버스트)

let bgmEl: HTMLAudioElement | null = null
let trackIdx = 0
let unsubVolume: (() => void) | null = null
let unlockListening = false
const sfxCache = new Map<SfxId, HTMLAudioElement>()
const lastSfxAt = new Map<SfxId, number>()

const mixed = () => {
  const s = useAudioStore.getState()
  return Math.max(0, Math.min(1, s.masterVolume * s.bgmVolume))
}

// 제스처 전 자동재생 거부 → 첫 pointerdown 에서 1회 재시도(once). E2E 실측 지점(data 없음 — paused 로 판정).
function tryPlay(el: HTMLAudioElement) {
  el.play().catch(() => {
    if (unlockListening || typeof window === 'undefined') return
    unlockListening = true
    window.addEventListener(
      'pointerdown',
      () => {
        unlockListening = false
        bgmEl?.play().catch(() => { /* 두 번째도 거부면 사용자가 믹서로 켠다 */ })
      },
      { once: true },
    )
  })
}

export function startBgm() {
  if (bgmEl || typeof Audio === 'undefined') return // 멱등·비브라우저(테스트) 가드
  trackIdx = Math.floor(Math.random() * BGM_PLAYLIST.length)
  const el = new Audio(BGM_PLAYLIST[trackIdx])
  el.loop = false
  el.addEventListener('ended', () => {
    trackIdx = (trackIdx + 1) % BGM_PLAYLIST.length
    el.src = BGM_PLAYLIST[trackIdx]
    el.play().catch(() => { /* 순환 중 거부는 무시(탭 백그라운드 등) */ })
  })
  el.volume = mixed()
  bgmEl = el
  unsubVolume = useAudioStore.subscribe(() => {
    if (bgmEl) bgmEl.volume = mixed()
  })
  if (import.meta.env.DEV) (window as unknown as { __bgm?: HTMLAudioElement | null }).__bgm = el // E2E 실측 훅(프로드 번들 제외)
  tryPlay(el)
}

export function stopBgm() {
  unsubVolume?.()
  unsubVolume = null
  if (bgmEl) {
    bgmEl.pause()
    bgmEl.removeAttribute('src') // 버퍼 해제
    bgmEl = null
    if (import.meta.env.DEV) (window as unknown as { __bgm?: HTMLAudioElement | null }).__bgm = null
  }
}

export function playSfx(id: SfxId) {
  if (typeof Audio === 'undefined') return
  const now = Date.now()
  if (now - (lastSfxAt.get(id) ?? 0) < SFX_THROTTLE_MS) return
  lastSfxAt.set(id, now)
  let base = sfxCache.get(id)
  if (!base) {
    base = new Audio(SFX_URL[id])
    base.preload = 'auto'
    sfxCache.set(id, base)
  }
  const el = base.cloneNode() as HTMLAudioElement // 겹침 재생 허용(원샷)
  el.volume = mixed()
  if (import.meta.env.DEV) { // E2E 발화 실측 훅(프로드 번들 제외)
    const w = window as unknown as { __sfxLog?: string[] }
    ;(w.__sfxLog ??= []).push(id)
  }
  el.play().catch(() => { /* 제스처 전 거부 — SFX 는 게이트 불요(입장 자체가 클릭 경유) */ })
}
