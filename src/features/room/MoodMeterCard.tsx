import { useTranslation } from 'react-i18next'
import { useReactionStore } from '@/stores/reactionStore'

// 방 분위기 카드(ROOM-REDESIGN R4) — 실집계 라이트(가짜·죽은UI 아님):
// 활기 지수 = 현재 활성 리액션 수(reactionStore.floats)×가중 + 발화 여부. 부드러운 변화는 CSS transition.
// 파형은 발화 중일 때만 미세 맥동(장식·reduced-motion 존중). mood 백엔드 집계는 후속(ponytail).
const BARS = [40, 70, 50, 90, 60, 80, 45, 75, 55, 85, 50, 65]

interface Props {
  speaking: boolean
}

export default function MoodMeterCard({ speaking }: Props) {
  const { t } = useTranslation()
  const floatsCount = useReactionStore((s) => s.floats.length)
  const mood = Math.min(100, floatsCount * 12 + (speaking ? 20 : 0))
  const label = mood >= 70 ? t('room.moodPeak') : mood >= 35 ? t('room.moodFocus') : t('room.moodCalm')

  return (
    <section className="rounded-xl border border-stage-border bg-stage-panel/80 p-3 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-stage-text-muted">{t('room.moodTitle')}</h3>
        <span className="text-sm font-semibold tabular-nums text-fire-amber">{mood}%</span>
      </div>
      <div
        className={`flex h-8 items-end justify-between gap-0.5 ${speaking ? 'motion-safe:animate-pulse' : ''}`}
        aria-hidden
      >
        {BARS.map((h, i) => (
          <span key={i} className="flex-1 rounded-sm bg-fire-amber/40" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stage-elevated">
        <div className="h-full rounded-full bg-fire-amber transition-[width] duration-700" style={{ width: `${mood}%` }} />
      </div>
      <p className="mt-1.5 text-right text-[11px] text-stage-text-muted" role="status">
        {label}
      </p>
    </section>
  )
}
