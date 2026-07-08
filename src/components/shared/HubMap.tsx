import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GlowMotes from '@/components/shared/GlowMotes'
import type { HubBlock, HubDest } from '@/scenes/manifest'

// 광장 허브 맵(로비 v2, scene-prompts.md §로비 v2) — 가게 = 기능 입구.
// 유도 3단(PoC 확정): ①입장 웨이브 1회 ②휴지 숨쉬기(--rest .34) ③호버 강점등+주변 포커스 딤(--dim .30).
// 함정 이식: blend 레이어(winoff)는 씬 레벨 형제(버튼 안이면 원화와 안 섞여 스티커화),
//   off/휴지 전환 시 flicker 애니메이션이 opacity 를 덮지 않게 CSS 에서 animation:none 처리.
// 블록 스트리트: blocks 가 2개 이상이면 좌우 팬(스냅) — 신기능 구역은 manifest 에 블록 append 만.
interface Props {
  blocks: HubBlock[]
  roomsCount: number // 열린 방 수 — 대극장(rooms) 점등 강도
  onDest: (dest: HubDest) => void
}

// 목적지별 표현(색·휴지 강도). troupe(준비 중)·reserved(예비)는 소등 계열.
const DEST_STYLE: Record<HubDest, { hue: string; glow: number; off?: boolean }> = {
  rooms: { hue: '255,170,90', glow: 1.0 },
  social: { hue: '255,185,110', glow: 0.85 },
  create: { hue: '255,170,90', glow: 0.8 },
  profile: { hue: '235,190,140', glow: 0.7 },
  practice: { hue: '170,240,190', glow: 0.75 },
  troupe: { hue: '200,190,255', glow: 0.25, off: true },
  reserved: { hue: '140,170,255', glow: 0, off: true },
}

export default function HubMap({ blocks, roomsCount, onDest }: Props) {
  const { t } = useTranslation()
  const sceneRef = useRef<HTMLDivElement>(null)
  const [blockIdx, setBlockIdx] = useState(0)
  // 입장 웨이브: 마운트 1회, 목적지 순서대로 반짝 — reduced-motion 은 생략.
  const [waved, setWaved] = useState<Set<HubDest>>(new Set())
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const shops = blocks[0]?.shops.filter((s) => !DEST_STYLE[s.dest].off) ?? []
    const timers: ReturnType<typeof setTimeout>[] = []
    shops.forEach((s, i) => {
      timers.push(setTimeout(() => setWaved((p) => new Set(p).add(s.dest)), 600 + i * 380))
      timers.push(setTimeout(() => setWaved((p) => { const n = new Set(p); n.delete(s.dest); return n }), 600 + i * 380 + 780))
    })
    return () => timers.forEach(clearTimeout)
  }, [blocks])

  const setDim = (v: number) => sceneRef.current?.style.setProperty('--dim', String(v))

  const label = (d: HubDest) => t(`hub.${d}.title`)
  const hint = (d: HubDest) => t(`hub.${d}.hint`)
  const cta = (d: HubDest) => t(`hub.${d}.cta`)

  const block = blocks[blockIdx]
  if (!block) return null

  return (
    <div className="relative">
      <div ref={sceneRef} className="hub-scene relative overflow-hidden rounded-xl" style={{ aspectRatio: '3 / 2' }}>
        <img src={block.hero} alt="" draggable={false} className="hub-bg absolute inset-0 h-full w-full select-none object-cover" />
        <div className="hub-grade absolute inset-0" aria-hidden />
        <GlowMotes count={14} />
        {block.shops.map((s) => {
          const st = DEST_STYLE[s.dest]
          const boxStyle = {
            left: `${s.box.l}%`,
            top: `${s.box.t}%`,
            width: `${s.box.w}%`,
            height: `${s.box.h}%`,
          } as React.CSSProperties
          return (
            // 소등 레이어는 씬 직속(원화와 multiply — 함정) → 버튼과 좌표만 공유.
            <div key={s.dest} className="contents">
              {st.off && <span className="hub-winoff absolute" style={boxStyle} aria-hidden />}
              <button
                onClick={() => onDest(s.dest)}
                onMouseEnter={() => !st.off && setDim(0.3)}
                onMouseLeave={() => setDim(0)}
                onFocus={() => !st.off && setDim(0.3)}
                onBlur={() => setDim(0)}
                aria-label={label(s.dest)}
                className={`hub-shop absolute ${waved.has(s.dest) ? 'hub-wave' : ''} ${st.off ? 'hub-off' : ''}`}
                style={{ ...boxStyle, '--hue': st.hue, '--g': s.dest === 'rooms' ? Math.min(1.3, st.glow + roomsCount * 0.12) : st.glow } as React.CSSProperties}
              >
                <span className="hub-winglow" aria-hidden>
                  {s.cores.map((c, i) => (
                    <span key={i} className="hub-core" style={{ left: `${c.x}%`, top: `${c.y}%` }} />
                  ))}
                </span>
                <span className={`hub-sign ${s.box.l + s.box.w > 88 ? 'hub-sign-right' : ''}`}>
                  <span className="hub-sign-title">
                    {label(s.dest)}
                    {s.dest === 'rooms' && roomsCount > 0 && <span className="hub-badge">{roomsCount}</span>}
                  </span>
                  <span className="hub-sign-hint">{hint(s.dest)}</span>
                  <span className={`hub-sign-cta ${st.off ? 'hub-sign-cta-ghost' : ''}`}>{cta(s.dest)}</span>
                </span>
              </button>
            </div>
          )
        })}
      </div>
      {blocks.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2">
          {blocks.map((_, i) => (
            <button
              key={i}
              onClick={() => setBlockIdx(i)}
              aria-label={t('hub.blockDot', { n: i + 1 })}
              className={`h-2 w-2 rounded-full ${i === blockIdx ? 'bg-fire-amber' : 'bg-stage-border'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
