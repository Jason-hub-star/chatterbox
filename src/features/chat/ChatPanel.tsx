import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRoomStore } from '@/stores/roomStore'

// ChatPanel — RightPanel 채팅 탭 콘텐츠. RoomPage에서 인라인이던 채팅을 블록으로 추출.
// 메시지는 roomStore에서 직접 읽고, 송신은 상위(LiveKit 훅 보유)가 주입한 onSend로 위임.
// 전송확인(✓): sendChat 이 send-chat 릴레이(영속+broadcast) resolve 후에만 로컬 에코하므로 "렌더된 내 메시지=전송 완료"가 성립.
const fmtTime = (ts: number) => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ChatPanel({
  connected,
  onSend,
  isHost,
  onHideMessage,
}: {
  connected: boolean
  onSend: (text: string) => Promise<void> | void
  isHost?: boolean // HOST-11: 호스트에게만 메시지별 [숨김] 노출(서버 moderate-chat 이 진짜 권한 재검증)
  onHideMessage?: (id: string) => void
}) {
  const { t } = useTranslation()
  const messages = useRoomStore((s) => s.messages)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLUListElement>(null)

  // 새 메시지 도착 시 하단으로 자동 스크롤.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    await onSend(draft)
    setDraft('')
  }

  return (
    <div className="flex h-full flex-col">
      <ul
        ref={listRef}
        className="flex-1 space-y-1 overflow-y-auto text-sm"
        aria-label={t('room.chatMessages')}
      >
        {messages.length === 0 && <li className="text-stage-text-muted">{t('room.noMessages')}</li>}
        {messages.map((m) => (
          <li key={m.id} className="flex items-baseline gap-1.5">
            <time
              dateTime={new Date(m.ts).toISOString()}
              className="shrink-0 text-[10px] tabular-nums text-stage-text-muted"
            >
              {fmtTime(m.ts)}
            </time>
            <span className="min-w-0 break-words">
              <span className={m.isLocal ? 'text-fire-amber' : 'text-stage-text-muted'}>{m.sender}</span>
              <span className="text-stage-text-muted">: </span>
              <span>{m.text}</span>
              {m.isLocal && (
                <span className="ml-1 text-[10px] text-spring-green" role="img" aria-label={t('room.sent')}>
                  ✓
                </span>
              )}
              {isHost && onHideMessage && (
                <button
                  onClick={() => onHideMessage(m.id)}
                  aria-label={t('room.hideMessage')}
                  title={t('room.hideMessage')}
                  className="ml-1 align-middle text-[10px] text-stage-text-muted hover:text-fire-hot"
                >
                  ✕
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!connected}
          aria-label={t('room.messageInput')}
          placeholder={connected ? t('room.messagePlaceholder') : t('room.messagePlaceholderDisabled')}
          className="flex-1 rounded-lg border border-stage-border bg-transparent px-3 py-2 text-sm disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
        >
          {t('room.send')}
        </button>
      </form>
    </div>
  )
}
