import { useEffect, useRef } from 'react'

// 몽환 빛 입자 캔버스 오버레이 — 랜딩·인증 셸·무대(G6 U-1) 공용.
// preset: 'motes' = 민들레 홀씨/글로우 더스트(기본, 기존 사용처 무변경) · 'embers' = 모닥불 불씨
// (앰버 팔레트·상승 빠름·트윙클 짧음). prefers-reduced-motion 이면 렌더하지 않는다(빈 캔버스).
export type MotePreset = 'motes' | 'embers'

const PRESETS = {
  motes: { color: '255, 232, 180', rMin: 1.5, rVar: 3.5, speedMin: 0.008, speedVar: 0.02, swayMin: 10, swayVar: 26, twinkleMs: 700 },
  embers: { color: '255, 158, 74', rMin: 1, rVar: 2, speedMin: 0.03, speedVar: 0.04, swayMin: 5, swayVar: 12, twinkleMs: 350 },
} as const

export default function GlowMotes({ count = 36, preset = 'motes' }: { count?: number; preset?: MotePreset }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const cfg = PRESETS[preset]
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const motes = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: cfg.rMin + Math.random() * cfg.rVar,
      speed: cfg.speedMin + Math.random() * cfg.speedVar, // 화면높이/초
      sway: cfg.swayMin + Math.random() * cfg.swayVar,
      phase: Math.random() * Math.PI * 2,
    }))
    let raf = 0
    let prev = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.05)
      prev = now
      ctx.clearRect(0, 0, w, h)
      for (const m of motes) {
        m.y -= m.speed * dt
        if (m.y < -0.05) {
          m.y = 1.05
          m.x = Math.random()
        }
        const x = m.x * w + Math.sin(now / 1600 + m.phase) * m.sway
        const y = m.y * h
        const tw = 0.45 + 0.35 * Math.sin(now / cfg.twinkleMs + m.phase * 3)
        const g = ctx.createRadialGradient(x, y, 0, x, y, m.r * 3)
        g.addColorStop(0, `rgba(${cfg.color}, ${tw})`)
        g.addColorStop(1, `rgba(${cfg.color}, 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, m.r * 3, 0, Math.PI * 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [count, preset])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
}
