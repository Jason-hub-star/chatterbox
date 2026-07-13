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
let fading = false // 곡 전환 크로스페이드(디졸브) 중 — subscribe 볼륨 덮어쓰기 방지
const BGM_FADE_MS = 2500 // 곡 전환 디졸브 길이(끝 이만큼 전부터 다음 곡과 교차)
const sfxCache = new Map<SfxId, HTMLAudioElement>()
const lastSfxAt = new Map<SfxId, number>()

const mixed = () => {
  const s = useAudioStore.getState()
  return s.bgmEnabled ? Math.max(0, Math.min(1, s.masterVolume * s.bgmVolume)) : 0
}

// 볼륨 램프(rAF): 현재 볼륨 → to 로 ms 동안 선형. done 은 완료 콜백. rAF 타임스탬프로 경과 산정(Date.now 불요).
function rampVolume(el: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  const from = el.volume
  let start = 0
  const step = (ts: number) => {
    if (!start) start = ts
    const k = ms <= 0 ? 1 : Math.min(1, (ts - start) / ms)
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k))
    if (k < 1) requestAnimationFrame(step)
    else done?.()
  }
  requestAnimationFrame(step)
}

// 다음 곡으로 크로스페이드(디졸브): 새 엘리먼트를 0볼륨으로 겹쳐 재생하며 현재 곡은 페이드아웃.
// bgmEl 을 새 엘리먼트로 스왑(subscribe·mixed 대상 이관). 재생 거부 시 페이드 없이 즉시 스왑.
function crossfadeToNext() {
  const oldEl = bgmEl
  if (!oldEl) return
  fading = true
  trackIdx = (trackIdx + 1) % BGM_PLAYLIST.length
  const nextEl = new Audio(BGM_PLAYLIST[trackIdx])
  nextEl.loop = false
  nextEl.volume = 0
  wireTrack(nextEl)
  bgmEl = nextEl
  if (import.meta.env.DEV) (window as unknown as { __bgm?: HTMLAudioElement | null }).__bgm = nextEl
  nextEl
    .play()
    .then(() => {
      rampVolume(nextEl, mixed(), BGM_FADE_MS, () => {
        fading = false
        if (bgmEl) bgmEl.volume = mixed() // 페이드 중 바뀐 볼륨·bgmEnabled 재동기(subscribe 가 fading 동안 건너뛴 값)
      })
      rampVolume(oldEl, 0, BGM_FADE_MS, () => { oldEl.pause(); oldEl.removeAttribute('src') })
    })
    .catch(() => {
      fading = false
      nextEl.volume = mixed()
      oldEl.pause()
      oldEl.removeAttribute('src')
    })
}

// 곡별 리스너: 끝 BGM_FADE_MS 전 크로스페이드 시작(timeupdate). ended 는 백그라운드 폴백(timeupdate 못 받은 경우).
function wireTrack(el: HTMLAudioElement) {
  el.addEventListener('timeupdate', () => {
    if (fading || el !== bgmEl || !el.duration) return
    if (el.duration - el.currentTime <= BGM_FADE_MS / 1000) crossfadeToNext()
  })
  el.addEventListener('ended', () => {
    if (fading || el !== bgmEl) return // 크로스페이드로 이미 넘어갔으면 무시
    trackIdx = (trackIdx + 1) % BGM_PLAYLIST.length
    el.src = BGM_PLAYLIST[trackIdx]
    el.volume = mixed()
    el.play().catch(() => { /* 순환 중 거부는 무시 */ })
  })
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
  wireTrack(el) // ended/timeupdate → 곡 순환 + 전환 크로스페이드(디졸브)
  el.volume = mixed()
  bgmEl = el
  unsubVolume = useAudioStore.subscribe(() => {
    if (bgmEl && !fading) bgmEl.volume = mixed() // 페이드 중엔 램프가 볼륨 소유
  })
  if (import.meta.env.DEV) (window as unknown as { __bgm?: HTMLAudioElement | null }).__bgm = el // E2E 실측 훅(프로드 번들 제외)
  tryPlay(el)
}

export function stopBgm() {
  unsubVolume?.()
  unsubVolume = null
  fading = false
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
