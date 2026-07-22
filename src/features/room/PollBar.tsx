import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePollStore } from '@/stores/pollStore'
import { useUserStore } from '@/stores/userStore'
import { fetchActivePoll, fetchMyPollChoice, submitPollVote } from '@/lib/rooms'
import { toast } from '@/hooks/useToast'

// 관객 투표 바(ROOM-22) — 무대 오버레이 하단. 전 롤 공용(viewer 포함, 호스트 컨트롤은 HostConsole).
// 라이브 갱신은 'poll' 서버 릴레이 → pollStore, 이 컴포넌트는 마운트 시 늦입장 초기값만 fetch(멱등).
// open: 선택지 버튼(재선택 허용·percent 비공개) / revealed: counts 스냅샷 percent 표시(MobileViewer §4.2).
export default function PollBar({ roomId }: { roomId: string }) {
  const { t } = useTranslation()
  const token = useUserStore((s) => s.session?.access_token)
  const poll = usePollStore((s) => s.poll)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const active = await fetchActivePoll(roomId)
        if (cancelled) return
        if (!active) return
        const myChoice = await fetchMyPollChoice(active.id).catch(() => null)
        if (cancelled) return
        usePollStore.getState().setPoll({
          id: active.id,
          question: active.question,
          options: active.options,
          status: active.status,
          counts: active.counts,
          totalVotes: active.counts?.reduce((a, b) => a + b, 0) ?? 0,
          myChoice,
        })
      } catch {
        /* 초기 fetch 실패 — 릴레이 수신으로 수렴 */
      }
    })()
    return () => {
      cancelled = true
      usePollStore.getState().setPoll(null) // 방 이탈/교체 시 이전 방 폴 잔상 제거
    }
  }, [roomId])

  if (!poll) return null

  const vote = async (idx: number) => {
    if (!token || busy || poll.status !== 'open') return
    setBusy(true)
    try {
      const r = await submitPollVote(token, roomId, poll.id, idx)
      const ps = usePollStore.getState()
      ps.setMyChoice(poll.id, idx)
      ps.setTotalVotes(poll.id, r.total_votes)
    } catch {
      toast.error(t('poll.voteFailed'))
      // 입장 직후 릴레이 유실 창(datachannel 개설 지연)에 상태가 stale 일 수 있음(409 등) —
      // 서버 진실 재fetch 로 수렴(reveal/close 반영). 실패는 무해(기존 표시 유지).
      try {
        const active = await fetchActivePoll(roomId)
        usePollStore.getState().setPoll(active ? {
          id: active.id,
          question: active.question,
          options: active.options,
          status: active.status,
          counts: active.counts,
          totalVotes: active.counts?.reduce((a, b) => a + b, 0) ?? 0,
          myChoice: active.id === poll.id ? poll.myChoice : null,
        } : null)
      } catch { /* noop */ }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="group"
      aria-label={t('poll.title')}
      data-poll-bar
      className="absolute bottom-3 left-1/2 z-20 w-[min(92%,26rem)] -translate-x-1/2 rounded-xl border border-stage-border bg-black/70 p-3 backdrop-blur-sm"
    >
      <p className="mb-2 text-xs font-semibold text-stage-text">{poll.question}</p>
      <div className="flex flex-col gap-1.5">
        {poll.options.map((opt, i) => {
          const mine = poll.myChoice === i
          if (poll.status === 'revealed') {
            const count = poll.counts?.[i] ?? 0
            const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0
            return (
              <div key={i} className="relative overflow-hidden rounded-lg border border-stage-border px-3 py-1.5 text-xs">
                <span aria-hidden className="absolute inset-y-0 left-0 bg-fire-amber/25" style={{ width: `${pct}%` }} />
                <span className="relative flex items-center justify-between gap-2">
                  <span className="truncate text-stage-text">{mine ? `✓ ${opt}` : opt}</span>
                  <span className="shrink-0 text-stage-text-muted">{pct}%</span>
                </span>
              </div>
            )
          }
          return (
            <button
              key={i}
              onClick={() => void vote(i)}
              disabled={busy}
              className={`rounded-lg border px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-40 ${
                mine
                  ? 'border-fire-amber bg-fire-amber/15 text-fire-amber'
                  : 'border-stage-border text-stage-text-muted hover:text-stage-text'
              }`}
            >
              {mine ? `✓ ${opt}` : opt}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-right text-[11px] text-stage-text-muted" aria-live="polite">
        {/* POLL-VOTE-STALE: 투표 제출·실패 재조회 중 "반영 중" — 표가 잠깐 이전 선택으로 보여도 처리 중임을 안내 */}
        {busy ? t('poll.syncing') : t('poll.totalVotes', { count: poll.totalVotes })}
      </p>
    </div>
  )
}
