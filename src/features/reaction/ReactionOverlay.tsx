import { useEffect } from 'react'
import { useReactionStore, type FloatingReaction } from '@/stores/reactionStore'
import { SLOTS } from '@/features/stage/stageLayout'
import EmoteGlyph from './EmoteGlyph'
import { EMOTE_ID_BY_EMOJI } from './reactionCatalog'
import { MAX_LOTTIE_FLOATS } from './lottieEmoteMap'

// 무대 위 리액션 오버레이: 보낸 사람 좌석 위로 이모지가 떠올랐다 사라진다.
// 좌석 위치 = slotOf(identity) → SLOTS[slot]{col,row} 를 3×3 그리드 % 로 환산(무대 컨테이너 기준).
// slot 미상 → 하단 중앙 폴백. SSOT: docs/contracts/ReactionWheel.md
// ponytail: 좌석 픽셀정밀 앵커(측정된 rect)는 후속 — 현재는 셀 중심 근사.

const DURATION_MS = 2200

const KEYFRAMES = `
@keyframes reaction-rise {
  0%   { transform: translateY(8px) scale(0.6); opacity: 0; }
  14%  { transform: translateY(0) scale(1.15); opacity: 1; }
  28%  { transform: translateY(-6px) scale(1); opacity: 1; }
  100% { transform: translateY(-64px) scale(1); opacity: 0; }
}
@keyframes reaction-fade {
  0%   { opacity: 0; }
  14%  { opacity: 1; }
  70%  { opacity: 1; }
  100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .reaction-anim { animation-name: reaction-fade !important; }
}`

function seatPercent(slot: number | undefined): { left: string; top: string } {
  if (slot === undefined || slot < 0 || slot >= SLOTS.length) return { left: '50%', top: '92%' }
  const { col, row } = SLOTS[slot]
  return { left: `${((col - 0.5) / 3) * 100}%`, top: `${((row - 0.5) / 3) * 100}%` }
}

function ReactionFloat({
  float,
  slotOf,
  animate,
}: {
  float: FloatingReaction
  slotOf: (id: string) => number | undefined
  animate: boolean
}) {
  const removeFloat = useReactionStore((s) => s.removeFloat)
  useEffect(() => {
    const id = setTimeout(() => removeFloat(float.id), DURATION_MS)
    return () => clearTimeout(id)
  }, [float.id, removeFloat])

  const pos = seatPercent(slotOf(float.identity))
  return (
    <span
      className="absolute -translate-x-1/2 -translate-y-1/2 text-3xl drop-shadow"
      style={{ left: pos.left, top: pos.top }}
      aria-hidden
    >
      <span className="block reaction-anim" style={{ animation: `reaction-rise ${DURATION_MS}ms ease-out forwards` }}>
        <EmoteGlyph id={EMOTE_ID_BY_EMOJI.get(float.emoji)} emoji={float.emoji} size={40} animate={animate} />
      </span>
    </span>
  )
}

export default function ReactionOverlay({ slotOf }: { slotOf: (identity: string) => number | undefined }) {
  const floats = useReactionStore((s) => s.floats)
  // 동시 Lottie 상한(성능 가드): 최근 MAX_LOTTIE_FLOATS 개만 Lottie, 초과분은 emoji 강등
  const lottieIds = new Set(floats.slice(-MAX_LOTTIE_FLOATS).map((f) => f.id))
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{KEYFRAMES}</style>
      {floats.map((f) => (
        <ReactionFloat key={f.id} float={f} slotOf={slotOf} animate={lottieIds.has(f.id)} />
      ))}
    </div>
  )
}
