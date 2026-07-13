import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import GlowMotes from '@/components/shared/GlowMotes'
import type { HubBlock, HubDest } from '@/scenes/manifest'

// 광장 허브 맵(로비 v3 — A+B 확정: 컬러 스포트라이트 + 카메라 푸시, 호버 연구소 검수 채택).
// 호버 = 주변 색을 빼고(멀티플라이+탈채) 그 건물만 원화로 남김 + 씬이 건물 쪽으로 3.5% 다가감.
// 클릭 = 푸시 심화(1.16) 후 onDest — 내부 씬 크로스페이드로 이어짐. 웨이브 = 스포트라이트 순차 점멸.
// troupe/reserved 는 소등(셔터) 상태 — 스포트라이트 대상 아님, 클릭은 안내 토스트(부모 처리).
interface Props {
  blocks: HubBlock[]
  roomsCount: number // 열린 방 수 — 대극장 간판 뱃지
  onDest: (dest: HubDest) => void
  fullscreen?: boolean // 로비 전체화면 모드(라운드·그림자 없이 뷰포트 cover)
}

const OFF_DESTS: ReadonlySet<HubDest> = new Set(['troupe', 'reserved'])
// 전환 연출 대상(내부 씬/라우트로 이어지는 목적지)
const TRANSITION_DESTS: ReadonlySet<HubDest> = new Set(['rooms', 'create', 'social', 'profile', 'practice'])

export default function HubMap({ blocks, roomsCount, onDest, fullscreen = false }: Props) {
  const { t } = useTranslation()
  const camRef = useRef<HTMLDivElement>(null)
  const spotRef = useRef<HTMLDivElement>(null)
  const desatRef = useRef<HTMLDivElement>(null)
  const [blockIdx, setBlockIdx] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const block = blocks[blockIdx]

  const setSpot = useCallback((s: { box: { l: number; t: number; w: number; h: number } } | null) => {
    const spot = spotRef.current
    const desat = desatRef.current
    if (!spot || !desat) return
    if (!s) {
      spot.style.opacity = '0'
      desat.style.opacity = '0'
      return
    }
    const { l, t: top, w, h } = s.box
    const hole = `radial-gradient(ellipse ${w * 0.72}% ${h * 0.62}% at ${l + w / 2}% ${top + h / 2}%, transparent 52%, black 78%)`
    for (const el of [spot, desat]) {
      el.style.webkitMaskImage = hole
      el.style.maskImage = hole
      el.style.opacity = '1'
    }
  }, [])

  const setPush = useCallback((s: { box: { l: number; t: number; w: number; h: number } } | null, deep = false) => {
    const cam = camRef.current
    if (!cam) return
    if (!s) {
      cam.style.transform = ''
      return
    }
    cam.style.transformOrigin = `${s.box.l + s.box.w / 2}% ${s.box.t + s.box.h / 2}%`
    cam.style.transform = `scale(${deep ? 1.16 : 1.035})`
  }, [])

  // 입장 웨이브: 스포트라이트가 기능 가게를 순차 점멸 — 평생 1회(학습용, 주인님 콜)·reduced-motion 생략.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (localStorage.getItem('cb.hubWaveSeen') === '1') return
    const shops = blocks[0]?.shops.filter((s) => !OFF_DESTS.has(s.dest)) ?? []
    const timers: ReturnType<typeof setTimeout>[] = []
    shops.forEach((s, i) => {
      timers.push(setTimeout(() => setSpot(s), 700 + i * 480))
    })
    // 플래그는 완주 시점에 — StrictMode 이중 마운트가 첫 웨이브를 삼키지 않게(시작 시 세팅 금지).
    timers.push(
      setTimeout(() => {
        setSpot(null)
        localStorage.setItem('cb.hubWaveSeen', '1')
      }, 700 + shops.length * 480),
    )
    return () => {
      timers.forEach(clearTimeout)
      setSpot(null)
    }
  }, [blocks, setSpot])

  const enter = (s: (typeof block.shops)[number]) => {
    if (!TRANSITION_DESTS.has(s.dest)) {
      onDest(s.dest)
      return
    }
    // 클릭 전환: 푸시 심화 + 페이드 → 내비게이션(부모).
    setPush(s, true)
    setLeaving(true)
    setTimeout(() => onDest(s.dest), 280)
  }

  if (!block) return null

  return (
    <div className={`relative ${fullscreen ? 'h-full' : ''}`}>
      <div
        className={`hub-scene relative overflow-hidden transition-opacity duration-300 ${fullscreen ? 'h-full w-full' : 'rounded-xl'} ${leaving ? 'opacity-0' : ''}`}
        style={fullscreen ? undefined : { aspectRatio: '3 / 2' }}
      >
        <div ref={camRef} className="hub-cam absolute inset-0">
          <img src={block.hero} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none object-cover" />
          <GlowMotes count={14} />
          {/* 가로등 상시 점등 — 원화 등화구 좌표(manifest plazaLamps)에 빛 웅덩이. 스포트라이트 마스크
              아래 레이어라 호버 탈채 시 씬과 함께 자연스럽게 가라앉는다. reduced-motion = 점등 유지·숨쉬기만 정지. */}
          {block.lamps?.map((p, i) => (
            <span
              key={`lamp-${i}`}
              className="hub-lamp absolute"
              style={{ left: `${p.x}%`, top: `${p.y}%`, '--lr': `${p.r}%`, animationDelay: `${(i % 4) * 0.8}s` } as CSSProperties}
              aria-hidden
            />
          ))}
          {block.shops.map(
            (s) =>
              OFF_DESTS.has(s.dest) && (
                <span
                  key={`off-${s.dest}`}
                  className="hub-winoff absolute"
                  style={{ left: `${s.box.l}%`, top: `${s.box.t}%`, width: `${s.box.w}%`, height: `${s.box.h}%` }}
                  aria-hidden
                />
              ),
          )}
          <div ref={spotRef} className="hub-spot absolute inset-0" aria-hidden />
          <div ref={desatRef} className="hub-desat absolute inset-0" aria-hidden />
          {block.shops.map((s) => {
            const off = OFF_DESTS.has(s.dest)
            return (
              <button
                key={s.dest}
                onClick={() => enter(s)}
                onMouseEnter={() => {
                  if (!off) {
                    setSpot(s)
                    setPush(s)
                  }
                }}
                onMouseLeave={() => {
                  setSpot(null)
                  setPush(null)
                }}
                onFocus={() => !off && setSpot(s)}
                onBlur={() => setSpot(null)}
                aria-label={t(`hub.${s.dest}.title`)}
                className={`hub-shop absolute ${off ? 'hub-off' : ''}`}
                style={{ left: `${s.box.l}%`, top: `${s.box.t}%`, width: `${s.box.w}%`, height: `${s.box.h}%` }}
              >
                <span className={`hub-sign ${s.box.l + s.box.w > 88 ? 'hub-sign-right' : ''}`}>
                  <span className="hub-sign-title">
                    {t(`hub.${s.dest}.title`)}
                    {s.dest === 'rooms' && roomsCount > 0 && <span className="hub-badge">{roomsCount}</span>}
                  </span>
                  <span className="hub-sign-hint">{t(`hub.${s.dest}.hint`)}</span>
                  <span className={`hub-sign-cta ${off ? 'hub-sign-cta-ghost' : ''}`}>{t(`hub.${s.dest}.cta`)}</span>
                </span>
              </button>
            )
          })}
        </div>
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
