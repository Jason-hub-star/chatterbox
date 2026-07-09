import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '@/components/shared/Modal'
import { WORLDS } from '@/scenes/manifest'
import { useWorldStore } from '@/stores/worldStore'

// 월드 갤러리 — 세계관 선택 UI(스케일 대비: WORLDS map 렌더 + 카테고리 필터 + lazy 썸네일).
// 새 월드 = WORLDS 1줄 → 자동 등장(UI 코드 0). 로그인 어피던스·의상실 공용. locked 월드는 선택 잠금.
const chip = (on: boolean) =>
  `rounded-full px-3 py-1 text-xs transition ${on ? 'bg-fire-amber text-stage-base' : 'bg-stage-border/50 text-stage-text-muted hover:text-stage-text'}`

export default function WorldGallery({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const personal = useWorldStore((s) => s.personal)
  const setPersonal = useWorldStore((s) => s.setPersonal)

  const worlds = Object.values(WORLDS)
  const cats = Array.from(new Set(worlds.map((w) => w.category).filter(Boolean))) as string[]
  const [cat, setCat] = useState<string | null>(null)
  const shown = cat ? worlds.filter((w) => w.category === cat) : worlds

  return (
    <Modal title={t('worldGallery.title')} onClose={onClose} widthClass="max-w-3xl">
      {/* 카테고리 필터 — 카테고리가 2종 이상일 때만(월드 많아질 때 대비) */}
      {cats.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setCat(null)} className={chip(cat === null)}>
            {t('worldGallery.all')}
          </button>
          {cats.map((c) => (
            <button key={c} type="button" onClick={() => setCat(c)} className={chip(cat === c)}>
              {t(`world.category.${c}`)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
        {shown.map((w) => {
          const active = w.id === personal
          const locked = !!w.locked
          return (
            <button
              key={w.id}
              type="button"
              disabled={locked}
              aria-current={active}
              onClick={() => {
                setPersonal(w.id)
                onClose()
              }}
              className={`group relative overflow-hidden rounded-lg border text-left transition ${
                active ? 'border-fire-amber ring-2 ring-fire-amber' : 'border-stage-border hover:border-stage-text-muted'
              } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <img src={w.assets.thumb} alt="" loading="lazy" className="aspect-[3/2] w-full object-cover" />
              <span className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                <span className="truncate font-medium text-stage-text">{t(w.label)}</span>
                {locked ? (
                  <span className="shrink-0 rounded bg-stage-border px-1.5 py-0.5 text-[10px] text-stage-text-muted">
                    {t('worldGallery.wip')}
                  </span>
                ) : active ? (
                  <span className="shrink-0 text-fire-amber">●</span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
