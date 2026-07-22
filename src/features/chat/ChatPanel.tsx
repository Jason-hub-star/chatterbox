import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRoomStore } from '@/stores/roomStore'
import Modal from '@/components/shared/Modal'

// ChatPanel — RightPanel 채팅 탭 콘텐츠. RoomPage에서 인라인이던 채팅을 블록으로 추출.
// 메시지는 roomStore에서 직접 읽고, 송신은 상위(LiveKit 훅 보유)가 주입한 onSend로 위임.
// 전송확인(✓): sendChat 이 send-chat 릴레이(영속+broadcast) resolve 후에만 로컬 에코하므로 "렌더된 내 메시지=전송 완료"가 성립.
// V-2 차단(개인 경험 필터 §16.2): blockedAuthIds 발신자의 메시지는 접힘 — 클릭으로 1회 펼침(DB 증거는 유지).
const fmtTime = (ts: number) => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const REPORT_REASONS = ['abuse', 'sexual', 'spam', 'privacy', 'other'] as const

export default function ChatPanel({
  connected,
  onSend,
  isHost,
  onHideMessage,
  blockedAuthIds,
  onSubmitReport,
  onUnblock,
  guestLocked,
  onGuestCta,
}: {
  connected: boolean
  onSend: (text: string) => Promise<void> | void
  guestLocked?: boolean // LOB-07: 익명 게스트는 read-only — 입력 대신 로그인 안내(서버도 403으로 이중 차단)
  onGuestCta?: () => void // R3: 게스트→로그인 전환(네비는 상위 위임 — onSend 와 동형, 라우터 비의존 유지)
  isHost?: boolean // HOST-11: 호스트에게만 메시지별 [숨김] 노출(서버 moderate-chat 이 진짜 권한 재검증)
  onHideMessage?: (id: string) => void
  blockedAuthIds?: Set<string> // V-2: 접힘 필터 키(auth id)
  onSubmitReport?: (r: { messageId: string; senderAuthId: string; reason: string; alsoBlock: boolean }) => Promise<void>
  onUnblock?: (senderAuthId: string) => void
}) {
  const { t } = useTranslation()
  const messages = useRoomStore((s) => s.messages)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  // 차단 메시지 1회 펼침(세션 로컬 — 차단 해제 아님)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // 신고 모달(사유 + 차단 동시 선택). 실패 toast 는 상위 — 모달은 유지해 재시도 가능.
  const [reportTarget, setReportTarget] = useState<{ id: string; senderAuthId: string; sender: string } | null>(null)
  const [reportReason, setReportReason] = useState<string>('abuse')
  const [alsoBlock, setAlsoBlock] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)

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

  const submitReport = async () => {
    if (!reportTarget || !onSubmitReport) return
    setReportBusy(true)
    try {
      await onSubmitReport({
        messageId: reportTarget.id,
        senderAuthId: reportTarget.senderAuthId,
        reason: reportReason,
        alsoBlock,
      })
      setReportTarget(null)
      setAlsoBlock(false)
      setReportReason('abuse')
    } catch {
      /* 실패 안내는 상위 toast — 모달 유지 */
    } finally {
      setReportBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ul
        ref={listRef}
        className="flex-1 space-y-1 overflow-y-auto text-sm"
        aria-label={t('room.chatMessages')}
      >
        {messages.length === 0 && <li className="text-stage-text-muted">{t('room.noMessages')}</li>}
        {messages.map((m) => {
          const isBlocked = !!(m.senderAuthId && blockedAuthIds?.has(m.senderAuthId))
          if (isBlocked && !expanded.has(m.id)) {
            return (
              <li key={m.id}>
                <button
                  onClick={() => setExpanded((prev) => new Set(prev).add(m.id))}
                  className="text-[11px] italic text-stage-text-muted hover:text-stage-text"
                >
                  {t('room.blockedMessage')}
                </button>
              </li>
            )
          }
          return (
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
                {!m.isLocal && m.senderAuthId && onSubmitReport && (
                  <button
                    onClick={() => setReportTarget({ id: m.id, senderAuthId: m.senderAuthId!, sender: m.sender })}
                    aria-label={t('room.reportMessage')}
                    title={t('room.reportMessage')}
                    className="ml-1 align-middle text-[10px] text-stage-text-muted hover:text-fire-hot"
                  >
                    ⚑
                  </button>
                )}
                {isBlocked && onUnblock && (
                  <button
                    onClick={() => onUnblock(m.senderAuthId!)}
                    className="ml-1 text-[10px] text-stage-text-muted underline hover:text-stage-text"
                  >
                    {t('room.unblock')}
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {guestLocked ? (
        /* R3 게스트 전환 CTA: 안내만 있고 로그인 경로가 없던 데드엔드 해소 — 현 방 복귀는 상위(onGuestCta)가 처리. */
        <div className="mt-2 rounded-lg border border-stage-border px-3 py-2 text-center">
          <p className="text-xs text-stage-text-muted">{t('guest.chatLocked')}</p>
          {onGuestCta && (
            <button
              type="button"
              onClick={onGuestCta}
              className="mt-1.5 rounded bg-fire-amber px-3 py-1 text-xs font-semibold text-stage-base"
            >
              {t('guest.chatLockedCta')}
            </button>
          )}
        </div>
      ) : (
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!connected}
          maxLength={500}
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
      )}

      {reportTarget && (
        <Modal title={t('room.reportTitle')} onClose={() => setReportTarget(null)}>
          <p className="mt-2 text-sm text-stage-text-muted">{reportTarget.sender}</p>
          <div className="mt-3 space-y-1.5">
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="report-reason"
                  value={r}
                  checked={reportReason === r}
                  onChange={() => setReportReason(r)}
                />
                {t(`room.reportReason.${r}`)}
              </label>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
            {t('room.reportAlsoBlock')}
          </label>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void submitReport()}
              disabled={reportBusy}
              className="flex-1 rounded-lg bg-fire-hot px-3 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {reportBusy ? t('room.reportSubmitting') : t('room.reportSubmit')}
            </button>
            <button
              onClick={() => setReportTarget(null)}
              className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted"
            >
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
