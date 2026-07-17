import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDubStore } from '@/stores/dubStore'
import { useUserStore } from '@/stores/userStore'
import { updateDubSegmentText } from '@/lib/dub'

// DUB-UX: 좌도크 더빙 대본 텔레프롬프터 — 센터 영상 재생 위치(currentSegmentId)에 맞춰 현재 대사
//   하이라이트+auto-scroll. 오른쪽 패널은 좁아 긴 대사가 잘리므로, 전체 텍스트는 여기서 줄바꿈으로
//   읽고 호스트는 여기서 직접 편집한다(updateDubSegmentText). 편집은 ready 상태에서만(녹음 후 잠금).
export default function DubScriptPanel({ isHost }: { isHost: boolean }) {
  const { t } = useTranslation()
  const segments = useDubStore((s) => s.segments)
  const currentId = useDubStore((s) => s.currentSegmentId)
  const status = useDubStore((s) => s.status)
  const sessionId = useDubStore((s) => s.activeSessionId)
  const token = useUserStore((s) => s.session?.access_token)
  const activeRef = useRef<HTMLLIElement>(null)
  const [editing, setEditing] = useState<{ id: number; value: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const canEdit = isHost && status === 'ready' && !!token && !!sessionId

  useEffect(() => {
    if (!editing) activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentId, editing])

  const fmt = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000))
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  const save = async (segId: number, hasTranslation: boolean) => {
    if (!token || !sessionId || !editing) return
    setSaving(true)
    try {
      await updateDubSegmentText(token, sessionId, segId,
        hasTranslation ? { translated_text: editing.value } : { text: editing.value })
      setEditing(null) // dubStore 갱신은 DubPanel realtime 구독이 반영
    } catch { /* 서버 오류 — 편집 상태 유지 */ } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-stage-border p-3">
      <h2 className="text-xs font-semibold text-stage-text-muted">
        {t('dub.scriptPanelTitle')}
        {status && <span className="ml-2 rounded bg-stage-border px-2 py-0.5 text-[10px]">{status}</span>}
      </h2>
      {segments.length === 0 ? (
        <p className="mt-2 text-xs text-stage-text-muted">{t('dub.scriptPanelEmpty')}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {segments.map((seg) => {
            const active = seg.id === currentId
            const isEditing = editing?.id === seg.id
            const shown = seg.translated_text || seg.text
            return (
              <li
                key={seg.id}
                ref={active && !isEditing ? activeRef : undefined}
                className={`rounded px-2 py-1 ${active ? 'bg-fire-amber/15 text-stage-text' : 'text-stage-text-muted'}`}
              >
                <div className="flex items-start gap-1">
                  <span className="mt-0.5 shrink-0 text-[10px] tabular-nums text-stage-text-muted">{fmt(seg.start_ms)}</span>
                  {isEditing ? (
                    <div className="flex-1">
                      <textarea
                        value={editing.value}
                        onChange={(e) => setEditing({ id: seg.id, value: e.target.value })}
                        maxLength={500}
                        rows={2}
                        aria-label={t('dub.segEditLabel')}
                        className="w-full rounded border border-stage-border bg-transparent px-2 py-1 text-sm"
                      />
                      <div className="mt-1 flex gap-1">
                        <button
                          disabled={saving || !editing.value.trim()}
                          onClick={() => void save(seg.id, !!seg.translated_text)}
                          className="rounded-lg bg-fire-amber px-3 py-1 text-xs font-semibold text-stage-base transition hover:opacity-90 disabled:opacity-40"
                        >
                          {t('dub.segEditSave')}
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="rounded border border-stage-border px-3 py-1 text-xs hover:bg-stage-border/30"
                        >
                          {t('dub.segEditCancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className={`flex-1 ${active ? 'font-medium' : ''}`}>{shown}</span>
                      {canEdit && (
                        <button
                          onClick={() => setEditing({ id: seg.id, value: shown })}
                          aria-label={t('dub.segEditLabel')}
                          title={t('dub.segEditLabel')}
                          className="shrink-0 text-xs text-stage-text-muted hover:text-fire-amber"
                        >
                          ✏️
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
