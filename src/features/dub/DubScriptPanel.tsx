import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useDubStore } from '@/stores/dubStore'

// DUB-UX: 좌도크 더빙 대본 텔레프롬프터 — 센터 영상 재생 위치(dubStore.currentSegmentId)에 맞춰
//   현재 대사를 하이라이트+auto-scroll 한다. 연기 대본 ScriptPanel 과 별개(소스=더빙 세그먼트).
//   RoomPage leftDock 가 더빙 활성 시 ScriptPanel 대신 이걸 건다.
export default function DubScriptPanel() {
  const { t } = useTranslation()
  const segments = useDubStore((s) => s.segments)
  const currentId = useDubStore((s) => s.currentSegmentId)
  const status = useDubStore((s) => s.status)
  const activeRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentId])

  const fmt = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000))
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
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
            return (
              <li
                key={seg.id}
                ref={active ? activeRef : undefined}
                className={`rounded px-2 py-1 ${active ? 'bg-fire-amber/15 font-medium text-stage-text' : 'text-stage-text-muted'}`}
              >
                <span className="mr-2 text-[10px] tabular-nums text-stage-text-muted">{fmt(seg.start_ms)}</span>
                {seg.translated_text || seg.text}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
