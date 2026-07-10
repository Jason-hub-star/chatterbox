import { useEffect, useRef, useState } from 'react'
import type { AnimationItem } from 'lottie-web'
import { LOTTIE_BY_ID } from './lottieEmoteMap'

// 이모트 비주얼 단일 렌더러(휠 칩·콘솔 버튼·좌석 플로트 공용) — LOTTIE_BY_ID[id] 있으면 Lottie, 없으면 emoji.
// 성능 가드(성역): reduced-motion·coarse 포인터·<480px → emoji / lottie_light 렌더러·JSON 은 지연 청크+1회 캐시 /
// 플로트 동시 상한(MAX_LOTTIE_FLOATS)은 ReactionOverlay 가 animate=false 로 강제. SSOT: docs/contracts/ReactionWheel.md

let playerP: Promise<typeof import('lottie-web/build/player/lottie_light')> | null = null
const dataCache = new Map<string, Promise<unknown>>()

function fetchAnim(url: string): Promise<unknown> {
  let p = dataCache.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
    dataCache.set(url, p)
  }
  return p
}

function lottieCapable(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (window.matchMedia('(pointer: coarse)').matches) return false
  return window.innerWidth >= 480
}

interface Props {
  id?: string
  emoji: string
  size: number // Lottie 정사각 px — emoji 폴백은 부모 font-size 상속
  animate?: boolean // false = emoji 강제(플로트 상한 초과 등)
}

export default function EmoteGlyph({ id, emoji, size, animate = true }: Props) {
  const [capable] = useState(lottieCapable) // 마운트 시 1회 판정(세션 중 변동 드묾)
  const box = useRef<HTMLSpanElement>(null)
  const [playing, setPlaying] = useState(false)
  const url = animate && capable && id ? LOTTIE_BY_ID[id] : undefined

  useEffect(() => {
    if (!url || !box.current) return
    let anim: AnimationItem | undefined
    let cancelled = false
    playerP ??= import('lottie-web/build/player/lottie_light')
    Promise.all([playerP, fetchAnim(url)]).then(([mod, data]) => {
      if (cancelled || !box.current || !data) return
      anim = mod.default.loadAnimation({
        container: box.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: structuredClone(data), // lottie 가 데이터를 변이함 → 캐시 공유분 보호
      })
      setPlaying(true)
    })
    return () => {
      cancelled = true
      anim?.destroy()
      setPlaying(false)
    }
  }, [url])

  if (!url) return <span aria-hidden>{emoji}</span>
  return (
    <span aria-hidden className="relative inline-block align-middle" style={{ width: size, height: size }}>
      {/* 로드 완료 전·실패 시 emoji 그대로 → 시각 공백 없음 */}
      {!playing && <span className="absolute inset-0 grid place-items-center">{emoji}</span>}
      <span ref={box} className="block h-full w-full" />
    </span>
  )
}
