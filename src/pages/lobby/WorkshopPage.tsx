import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { toast } from '@/hooks/useToast'
import { createRoom, ROOM_GENRES } from '@/lib/rooms'
import InteriorShell from '@/pages/lobby/InteriorShell'
import { useInterior } from '@/pages/lobby/useInterior'

// 공방(로비 v3) — 레거시 전가: 방 생성 폼. 진입 즉시 제목 입력란 자동 포커스(추가 클릭 0).
// 살아있는 앵커: 입력한 제목이 작업대 위 미니어처 무대의 나무 현판에 실시간 반영.
const vars = (a: { l: number; t: number; w: number; h: number }) =>
  ({ '--al': `${a.l}%`, '--at': `${a.t}%`, '--aw': `${a.w}%` }) as React.CSSProperties

export default function WorkshopPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useUserStore((s) => s.session)
  const interior = useInterior('create')

  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || !session) return
    setCreating(true)
    try {
      const { room_id } = await createRoom(session.access_token, trimmed, genre || undefined)
      navigate(`/rooms/${room_id}/ready`)
    } catch {
      toast.error(t('lobby.createError'))
      setCreating(false)
    }
  }

  return (
    <InteriorShell dest="create" title={t('hub.create.title')}>
      {/* 현판: 미니어처 무대 상단 — 제목이 실시간으로 새겨짐(그림이 상태를 안다). */}
      {interior && (
        <div className="interior-anchor hidden text-center md:block" style={vars(interior.anchors.model)}>
          <span className="workshop-plaque">{title.trim() || t('workshop.plaquePlaceholder')}</span>
        </div>
      )}

      {/* 제작대: 생성 폼 — 기본 오픈·자동 포커스. */}
      {interior && (
        <div className="interior-anchor" style={vars(interior.anchors.bench)}>
          <form onSubmit={onCreate} className="interior-panel mx-auto flex max-w-md flex-col gap-2.5">
            <p className="text-xs text-stage-text-muted">{t('workshop.benchHint')}</p>
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label={t('lobby.roomTitleInput')}
              placeholder={t('lobby.roomTitlePlaceholder')}
              maxLength={80}
              className="rounded-lg border border-stage-border bg-stage-base/60 px-3 py-2 text-sm"
            />
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              aria-label={t('lobby.genreLabel')}
              className="rounded-lg border border-stage-border bg-stage-base px-2 py-2 text-sm text-stage-text-muted"
            >
              <option value="">{t('lobby.genreNone')}</option>
              {ROOM_GENRES.map((g) => (
                <option key={g} value={g}>
                  {t(`lobby.genre.${g}`)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating || !title.trim()}
              className="rounded-lg bg-fire-amber px-4 py-2.5 text-sm font-bold text-stage-base disabled:opacity-40"
            >
              {creating ? t('lobby.creating') : t('workshop.raiseStage')}
            </button>
          </form>
        </div>
      )}
    </InteriorShell>
  )
}
