import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReactionStore } from '@/stores/reactionStore'
import EmoteLoadoutPicker from '@/features/reaction/EmoteLoadoutPicker'

// 사운드보드 카드(ROOM-REDESIGN R4) — reactionStore.slots 상위 6을 2×3 상시 그리드로.
// 클릭 → 기존 리액션 릴레이(sendReaction) 재사용. ✏️ → 로드아웃 피커(휠·사운드보드 공유 슬롯 편집).
// SFX 오디오는 백엔드 신규라 defer(ROOM-REDESIGN §4).
interface Props {
  onReaction: (emoji: string) => void
  disabled: boolean
}

export default function SoundboardCard({ onReaction, disabled }: Props) {
  const { t } = useTranslation()
  const slots = useReactionStore((s) => s.slots).slice(0, 6)
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <section className="rounded-xl border border-stage-border bg-stage-panel/80 p-3 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-stage-text-muted">{t('room.soundboardTitle')}</h3>
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
      <div className="grid grid-cols-3 gap-2">
        {slots.map((s) => (
          <button
            key={s.id}
            onClick={() => onReaction(s.emoji)}
            disabled={disabled}
            title={s.label}
            className="flex flex-col items-center gap-0.5 rounded-lg border border-stage-border bg-stage-elevated/60 py-2 text-lg transition-colors hover:border-fire-amber/60 disabled:opacity-40"
          >
            <span aria-hidden>{s.emoji}</span>
            <span className="text-[10px] text-stage-text-muted">{s.label}</span>
          </button>
        ))}
      </div>
      {pickerOpen && <EmoteLoadoutPicker onClose={() => setPickerOpen(false)} />}
    </section>
  )
}
