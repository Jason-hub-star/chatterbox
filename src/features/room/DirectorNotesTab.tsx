import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotesStore } from '@/stores/notesStore'

// 실시간 디렉터 노트 탭(ROOM-17, 계약 RightPanel.md §ROOM-17) — 배우·호스트 발행 가능(방장 구분 무).
// viewer 는 읽기 전용(readOnly) — 노트는 직발행(DataChannel)이라 viewer 토큰이 canPublishData=false 로
// 막히며(API-SURFACE 익명/뷰어 규칙), 입력을 숨겨 깨진 UI 를 예방한다.
// 새 노트 도착 시 자동 최하단 스크롤, 사용자가 위로 스크롤하면 자동 스크롤 해제(notesStore.isAutoScroll).
// 방장 노트는 amber 좌측 강조선 — hostAuthId 렌더 비교로 파생(호스트 이양에도 실시간 정확).
interface Props {
  connected: boolean
  hostAuthId: string | null
  onSend: (content: string) => void | Promise<void>
  readOnly?: boolean
}

export default function DirectorNotesTab({ connected, hostAuthId, onSend, readOnly }: Props) {
  const { t, i18n } = useTranslation()
  const notes = useNotesStore((s) => s.notes)
  const isAutoScroll = useNotesStore((s) => s.isAutoScroll)
  const setAutoScroll = useNotesStore((s) => s.setAutoScroll)
  const listRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')

  // 새 노트 도착 시 자동 스크롤(활성 시에만).
  useEffect(() => {
    if (!isAutoScroll) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [notes, isAutoScroll])

  // 수동 스크롤 감지: 하단 근처면 자동 스크롤 재개, 위로 올리면 해제.
  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    if (nearBottom !== isAutoScroll) setAutoScroll(nearBottom)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) return
    void onSend(trimmed)
    setDraft('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {notes.length === 0 && <p className="py-6 text-center text-xs text-stage-text-muted">{t('notes.empty')}</p>}
        {notes.map((n) => {
          const isHostNote = !!hostAuthId && n.authorId === hostAuthId
          return (
            <div
              key={n.id}
              className={`rounded px-2 py-1.5 text-xs ${isHostNote ? 'border-l-2 border-fire-amber bg-fire-amber/5' : 'bg-stage-panel/60'}`}
            >
              <div className="flex items-baseline gap-2">
                <span className={`font-semibold ${isHostNote ? 'text-fire-amber' : ''}`}>{n.authorName}</span>
                <span className="ml-auto shrink-0 tabular-nums text-[10px] text-stage-text-muted">
                  {new Date(n.ts).toLocaleTimeString(i18n.language, { hour12: false })}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-stage-text">{n.content}</p>
            </div>
          )
        })}
      </div>
      {/* R7 휘발성 고지: 노트는 세션 휘발(방 이탈 시 소멸) — 채팅과의 착각 방지. */}
      <p className="mt-1 shrink-0 text-[10px] text-stage-text-muted">{t('notes.volatileHint')}</p>
      {!readOnly && (
      <form onSubmit={submit} className="mt-2 flex shrink-0 gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!connected}
          aria-label={t('notes.inputLabel')}
          placeholder={connected ? t('notes.placeholder') : t('room.messagePlaceholderDisabled')}
          maxLength={500}
          className="min-w-0 flex-1 rounded-lg border border-stage-border bg-transparent px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-fire-amber"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          className="shrink-0 rounded-lg bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40"
        >
          {t('notes.send')}
        </button>
      </form>
      )}
    </div>
  )
}
