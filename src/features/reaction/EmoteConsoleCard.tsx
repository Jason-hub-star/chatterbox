import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReactionStore } from '@/stores/reactionStore'
import EmoteLoadoutPicker from './EmoteLoadoutPicker'
import EmoteGlyph from './EmoteGlyph'

// 이모트 콘솔(ROOM-REDESIGN 우도크) — 로드아웃 전 슬롯 그리드(휠과 공유) + ✏️ 피커.
// F-7(2026-07-12 주인님 콜): 방분위기(mood 게이지·파형)는 제거 — 콘솔은 이모트 발사대만.
// 클릭 → 기존 리액션 릴레이(sendReaction) 재사용. SFX 오디오는 defer(ROOM-REDESIGN §4 → 골 G6).
interface Props {
  onReaction: (emoji: string) => void
  disabled: boolean
}

export default function EmoteConsoleCard({ onReaction, disabled }: Props) {
  const { t } = useTranslation()
  const slots = useReactionStore((s) => s.slots)
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <section className="rounded-xl border border-stage-border bg-stage-panel/80 p-3 backdrop-blur-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-stage-text-muted">{t('room.emoteTitle')}</h3>
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

      {/* 로드아웃 전 슬롯(휠과 공유 · 최대 12 wrap) → sendReaction */}
      <div className="grid grid-cols-4 gap-1.5">
        {slots.map((s) => (
          <button
            key={s.id}
            onClick={() => onReaction(s.emoji)}
            disabled={disabled}
            aria-label={s.label}
            title={s.label}
            className="grid min-h-[44px] place-items-center rounded-lg border border-stage-border bg-stage-elevated/60 py-1.5 text-lg transition-colors hover:border-fire-amber/60 disabled:opacity-40"
          >
            <EmoteGlyph id={s.id} emoji={s.emoji} size={24} />
          </button>
        ))}
      </div>

      {pickerOpen && <EmoteLoadoutPicker onClose={() => setPickerOpen(false)} />}
    </section>
  )
}
