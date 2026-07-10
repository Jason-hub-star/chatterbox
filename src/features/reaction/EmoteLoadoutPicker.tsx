import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '@/components/shared/Modal'
import { useReactionStore, DEFAULT_SLOTS, MAX_SLOTS, type ReactionSlot } from '@/stores/reactionStore'
import { EMOTE_CATALOG } from './reactionCatalog'

// 이모트 로드아웃 피커(ROOM-12 기능화) — 휠·사운드보드에 표시할 이모트를 편성.
// setSlots(검증·MAX·localStorage) 소비 — 신규 스토어 액션 0. 저장 시에만 영속(취소=draft 폐기).
// 확장: 팔레트는 EMOTE_CATALOG(단일 SSOT) 순회 — 카탈로그에 1행 추가하면 자동 노출.
export default function EmoteLoadoutPicker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const slots = useReactionStore((s) => s.slots)
  const setSlots = useReactionStore((s) => s.setSlots)
  const [draft, setDraft] = useState<ReactionSlot[]>(slots)

  const inDraft = (id: string) => draft.some((d) => d.id === id)
  const remove = (id: string) => setDraft((d) => (d.length <= 1 ? d : d.filter((s) => s.id !== id)))
  const add = (slot: ReactionSlot) =>
    setDraft((d) => (d.length >= MAX_SLOTS || d.some((s) => s.id === slot.id) ? d : [...d, slot]))
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const j = i + dir
      if (j < 0 || j >= d.length) return d
      const next = d.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const save = () => {
    setSlots(draft)
    onClose()
  }

  const palette = EMOTE_CATALOG.filter((e) => !inDraft(e.id))
  const full = draft.length >= MAX_SLOTS

  return (
    <Modal title={t('reaction.editLoadout')} onClose={onClose} widthClass="max-w-md">
      <p className="mt-1 text-xs text-stage-text-muted">{t('reaction.pickerHint')}</p>

      {/* 내 로드아웃 */}
      <h4 className="mt-3 text-xs font-semibold text-stage-text">
        {t('reaction.myLoadout')} · {draft.length}/{MAX_SLOTS}
      </h4>
      <ul className="mt-1.5 space-y-1">
        {draft.map((s, i) => (
          <li
            key={s.id}
            className="flex items-center gap-2 rounded-lg border border-stage-border bg-stage-panel/60 px-2 py-1"
          >
            <span className="text-lg" aria-hidden>
              {s.emoji}
            </span>
            <span className="flex-1 truncate text-xs text-stage-text">{s.label}</span>
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={t('reaction.moveUp', { label: s.label })}
              className="grid h-6 w-6 place-items-center rounded text-stage-text-muted hover:text-stage-text disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === draft.length - 1}
              aria-label={t('reaction.moveDown', { label: s.label })}
              className="grid h-6 w-6 place-items-center rounded text-stage-text-muted hover:text-stage-text disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => remove(s.id)}
              disabled={draft.length <= 1}
              aria-label={t('reaction.removeSlot', { label: s.label })}
              className="grid h-6 w-6 place-items-center rounded text-stage-text-muted hover:text-fire-hot disabled:opacity-30"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {/* 팔레트 */}
      <h4 className="mt-3 text-xs font-semibold text-stage-text">{t('reaction.palette')}</h4>
      {full && (
        <p className="mt-1 text-[11px] text-fire-hot" role="status">
          {t('reaction.slotFull', { max: MAX_SLOTS })}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {palette.length === 0 ? (
          <p className="text-[11px] text-stage-text-muted">{t('reaction.paletteEmpty')}</p>
        ) : (
          palette.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => add(e)}
              disabled={full}
              title={e.label}
              aria-label={t('reaction.addSlot', { label: e.label })}
              className="grid h-9 w-9 place-items-center rounded-lg border border-stage-border bg-stage-elevated/60 text-lg hover:border-fire-amber disabled:opacity-30"
            >
              <span aria-hidden>{e.emoji}</span>
            </button>
          ))
        )}
      </div>

      {/* 액션 */}
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setDraft([...DEFAULT_SLOTS])}
          className="text-xs text-stage-text-muted underline hover:text-stage-text"
        >
          {t('reaction.resetDefault')}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stage-border px-3 py-1.5 text-xs text-stage-text-muted hover:text-stage-text"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-lg bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
