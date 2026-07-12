import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// F-6(2026-07-12 주인님 콜): 디렉터 노트를 별도 탭에서 채팅 탭 안 세그먼트로 통합.
// 두 슬롯 다 마운트 유지(hidden) — RightPanel 의 탭 언마운트 금지 규칙과 동형(입력 상태 보존).
// 순수 토글 셸: 배선(sendChat/sendNote 등)은 RoomPage 가 슬롯으로 주입.
export default function ChatNotesTab({ chat, notes }: { chat: ReactNode; notes: ReactNode }) {
  const { t } = useTranslation()
  const [view, setView] = useState<'chat' | 'notes'>('chat')
  const segments = [
    { id: 'chat', label: t('room.chat') },
    { id: 'notes', label: t('room.tabNotes') },
  ] as const
  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label={t('room.tabChat')} className="mb-2 flex shrink-0 gap-1">
        {segments.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={view === s.id}
            onClick={() => setView(s.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              view === s.id
                ? 'bg-stage-elevated text-stage-text'
                : 'text-stage-text-muted hover:text-stage-text'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div hidden={view !== 'chat'} className="min-h-0 flex-1">{chat}</div>
      <div hidden={view !== 'notes'} className="min-h-0 flex-1">{notes}</div>
    </div>
  )
}
