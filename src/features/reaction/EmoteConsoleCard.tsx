import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReactionStore } from '@/stores/reactionStore'
import EmoteLoadoutPicker from './EmoteLoadoutPicker'
import EmoteGlyph from './EmoteGlyph'

// 이모트 콘솔(ROOM-REDESIGN 우도크 재분배) — 방분위기 + 사운드보드 통합 카드.
// = 활기 실집계(reactionStore.floats — 가짜/죽은UI 아님) 헤더 인라인 + 로드아웃 전 슬롯 그리드(휠과 공유) + ✏️ 피커.
// 사운드보드가 상위6만 노출하던 빈공간을 전 슬롯(최대12 wrap)로 대체 · Mood 독립 소카드 흡수로 RightPanel 세로공간 확대.
// 클릭 → 기존 리액션 릴레이(sendReaction) 재사용. SFX 오디오는 defer(ROOM-REDESIGN §4).
const BARS = [40, 70, 50, 90, 60, 80, 45, 75, 55, 85, 50, 65]

interface Props {
  speaking: boolean
  onReaction: (emoji: string) => void
  disabled: boolean
}

export default function EmoteConsoleCard({ speaking, onReaction, disabled }: Props) {
  const { t } = useTranslation()
  const slots = useReactionStore((s) => s.slots)
  const floatsCount = useReactionStore((s) => s.floats.length)
  const [pickerOpen, setPickerOpen] = useState(false)

  const mood = Math.min(100, floatsCount * 12 + (speaking ? 20 : 0))
  const moodLabel = mood >= 70 ? t('room.moodPeak') : mood >= 35 ? t('room.moodFocus') : t('room.moodCalm')

  return (
    <section className="rounded-xl border border-stage-border bg-stage-panel/80 p-3 backdrop-blur-sm">
      {/* 헤더: 방 분위기 실집계 + 편집 */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <h3 className="text-xs font-semibold text-stage-text-muted">{t('room.moodTitle')}</h3>
          <span className="text-sm font-semibold tabular-nums text-fire-amber">{mood}%</span>
          <span className="text-[11px] text-stage-text-muted" role="status">
            {moodLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label={t('reaction.editLoadout')}
          title={t('reaction.editLoadout')}
          className="text-xs text-stage-text-muted hover:text-fire-amber"
        >
          ✏️
        </button>
      </div>

      {/* 분위기 파형 (발화 중 미세 맥동 · reduced-motion 존중, 장식) */}
      <div
        className={`flex h-6 items-end justify-between gap-0.5 ${speaking ? 'motion-safe:animate-pulse' : ''}`}
        aria-hidden
      >
        {BARS.map((h, i) => (
          <span key={i} className="flex-1 rounded-sm bg-fire-amber/30" style={{ height: `${h}%` }} />
        ))}
      </div>

      {/* 로드아웃 전 슬롯(휠과 공유 · 최대 12 wrap) → sendReaction */}
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {slots.map((s) => (
          <button
            key={s.id}
            onClick={() => onReaction(s.emoji)}
            disabled={disabled}
            aria-label={s.label}
            title={s.label}
            className="grid place-items-center rounded-lg border border-stage-border bg-stage-elevated/60 py-1.5 text-lg transition-colors hover:border-fire-amber/60 disabled:opacity-40"
          >
            <EmoteGlyph id={s.id} emoji={s.emoji} size={24} />
          </button>
        ))}
      </div>

      {pickerOpen && <EmoteLoadoutPicker onClose={() => setPickerOpen(false)} />}
    </section>
  )
}
