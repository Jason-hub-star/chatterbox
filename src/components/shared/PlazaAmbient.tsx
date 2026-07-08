import { useEffect, useRef } from 'react'
import { Application, Assets, Container, MeshRope, Point, Sprite, Texture } from 'pixi.js'
import type { AmbientSprite } from '@/scenes/manifest'

// 광장 앰비언트(로비 v3.1, 주인님 승인 페이즈): 매팅한 고래를 PixiJS MeshRope 에 얹어
// 몸통 사인파 굴곡(꼬리 쪽 진폭↑) + 느린 원호 드리프트 — "진짜 고래처럼" 헤엄친다(주인님 요구).
// 구름은 합성 안개 스프라이트의 저속 드리프트. DESIGN-DIRECTION 레이어 구조(z1 PixiJS 앰비언트) 실현.
// 규율: reduced-motion 은 부모가 미마운트, 탭 비활성 시 티커 정지, 드리프트 ±2%대(인페인트 자국 커버).
const ROPE_POINTS = 14

function wispTexture(): Texture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 160
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(256, 80, 10, 256, 80, 250)
  g.addColorStop(0, 'rgba(255,248,235,0.55)')
  g.addColorStop(0.5, 'rgba(255,240,220,0.22)')
  g.addColorStop(1, 'rgba(255,240,220,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(256, 80, 250, 70, 0, 0, Math.PI * 2)
  ctx.fill()
  return Texture.from(c)
}

export default function PlazaAmbient({ whales }: { whales: AmbientSprite[] }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let destroyed = false
    const app = new Application()
    const ropes: { rope: MeshRope; wrap: Container; points: Point[]; texW: number; box: AmbientSprite['box']; seed: number }[] = []
    const wisps: { sp: Sprite; seed: number }[] = []

    ;(async () => {
      await app.init({ backgroundAlpha: 0, antialias: true, resizeTo: host })
      if (destroyed) {
        app.destroy(true)
        return
      }
      host.appendChild(app.canvas)
      app.canvas.style.position = 'absolute'
      app.canvas.style.inset = '0'

      // 합성 구름 안개 3점 — 하늘 상부에서 초저속 드리프트(스크린 느낌은 알파로만).
      const wt = wispTexture()
      for (let i = 0; i < 3; i++) {
        const sp = new Sprite(wt)
        sp.anchor.set(0.5)
        sp.alpha = 0.1 + i * 0.03
        app.stage.addChild(sp)
        wisps.push({ sp, seed: i * 2.1 })
      }

      for (const [i, w] of whales.entries()) {
        const tex = await Assets.load<Texture>(w.src)
        if (destroyed) return
        const points = Array.from({ length: ROPE_POINTS }, (_, k) => new Point((tex.width / (ROPE_POINTS - 1)) * k, 0))
        const rope = new MeshRope({ texture: tex, points })
        const wrap = new Container()
        wrap.addChild(rope)
        rope.x = -tex.width / 2
        app.stage.addChild(wrap)
        ropes.push({ rope, wrap, points, texW: tex.width, box: w.box, seed: i * 1.7 + 0.5 })
      }

      let t = 0
      app.ticker.add((tick) => {
        t += tick.deltaMS / 1000
        const rw = app.renderer.width
        const rh = app.renderer.height
        for (const r of ropes) {
          const scale = ((r.box.w / 100) * rw) / r.texW
          r.wrap.scale.set(scale)
          const cx = ((r.box.l + r.box.w / 2) / 100) * rw
          const cy = ((r.box.t + r.box.h / 2) / 100) * rh
          // 드리프트: 느린 원호(주기 ~45s), 반경은 화면의 ~1.5% — 인페인트 자국을 벗어나지 않게.
          r.wrap.x = cx + Math.sin(t * 0.14 + r.seed) * rw * 0.015
          r.wrap.y = cy + Math.sin(t * 0.09 + r.seed * 2) * rh * 0.012
          r.wrap.rotation = Math.sin(t * 0.11 + r.seed) * 0.025
          // 몸통 굴곡: 꼬리(왼쪽)로 갈수록 진폭 증가 — 파도가 머리→꼬리로 흐른다.
          const amp = r.texW * 0.035
          for (let k = 0; k < r.points.length; k++) {
            const tailness = 1 - k / (ROPE_POINTS - 1) // 왼쪽 끝 = 꼬리
            r.points[k].y = Math.sin(t * 1.15 + r.seed * 3 + k * 0.55) * amp * (0.18 + 0.82 * tailness)
          }
        }
        for (const [i, wsp] of wisps.entries()) {
          const rw2 = app.renderer.width
          const rh2 = app.renderer.height
          wsp.sp.width = rw2 * 0.4
          wsp.sp.height = rh2 * 0.14
          const span = rw2 * 1.4
          const x = ((t * rw2 * 0.004 * (1 + i * 0.35) + wsp.seed * rw2 * 0.4) % span) - rw2 * 0.2
          wsp.sp.x = x
          wsp.sp.y = rh2 * (0.1 + i * 0.09) + Math.sin(t * 0.05 + wsp.seed) * rh2 * 0.01
        }
      })

      const onVis = () => {
        if (document.hidden) app.ticker.stop()
        else app.ticker.start()
      }
      document.addEventListener('visibilitychange', onVis)
      app.ticker.addOnce(() => {}) // noop — ticker warm
      ;(app as unknown as { __onVis?: () => void }).__onVis = onVis
    })()

    return () => {
      destroyed = true
      const onVis = (app as unknown as { __onVis?: () => void }).__onVis
      if (onVis) document.removeEventListener('visibilitychange', onVis)
      try {
        app.destroy(true, { children: true })
      } catch {
        /* init 전 파괴 등 — 무해 */
      }
    }
  }, [whales])

  return <div ref={hostRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />
}
