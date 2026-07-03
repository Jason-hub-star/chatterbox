import type { Script } from './cues'

// 실시간 연기 텔레프롬프터(기능 MVP) — 호스트가 대사를 진행하고 전 참가자가 같은 위치를 본다.
// "내 차례" = 현재 cue 의 역할 == 내가 고른 역할. UI 는 최소(디자인 후속) — 동작 검증이 목적.
// 계약: contracts/ScriptPanel.md · state-machines/Script.md.
interface Props {
  script: Script
  cueIndex: number
  isHost: boolean
  myRole: string | null
  onPickRole: (role: string | null) => void
  onAdvance: (delta: number) => void
}

export default function ScriptPanel({ script, cueIndex, isHost, myRole, onPickRole, onAdvance }: Props) {
  const current = script.cues[cueIndex]
  const myTurn = !!current && current.role === myRole
  const atStart = cueIndex <= 0
  const atEnd = cueIndex >= script.cues.length - 1

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stage-text-muted">대본 — {script.title}</h2>
        <label className="text-xs text-stage-text-muted">
          내 역할{' '}
          <select
            value={myRole ?? ''}
            onChange={(e) => onPickRole(e.target.value || null)}
            className="rounded border border-stage-border bg-stage-base px-2 py-1 text-stage-text"
          >
            <option value="">관전</option>
            {script.roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>

      {/* 현재 대사(텔레프롬프터) */}
      <div
        data-testid="current-cue"
        className={`mt-2 rounded-lg border p-4 ${myTurn ? 'border-fire-amber bg-fire-amber/10' : 'border-stage-border'}`}
        role="status"
        aria-live="polite"
      >
        <div className="text-xs text-stage-text-muted">
          {current ? `${current.role} · ${cueIndex + 1}/${script.cues.length}` : '대본 끝'}
          {myTurn && <span className="ml-2 font-bold text-fire-amber">▶ 내 차례</span>}
        </div>
        <p className="mt-1 text-lg text-stage-text">{current?.text ?? '—'}</p>
      </div>

      {/* 진행 컨트롤 (호스트 전용) */}
      {isHost ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => onAdvance(-1)}
            disabled={atStart}
            className="rounded-lg border border-stage-border px-3 py-1 text-sm text-stage-text disabled:opacity-40"
          >
            ← 이전
          </button>
          <button
            type="button"
            onClick={() => onAdvance(1)}
            disabled={atEnd}
            className="rounded-lg bg-fire-amber px-4 py-1 text-sm font-semibold text-stage-base disabled:opacity-40"
          >
            다음 대사 →
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-stage-text-muted">호스트가 대사를 진행해요.</p>
      )}

      {/* 전체 대본(현재 줄 하이라이트) */}
      <ol className="mt-4 space-y-1">
        {script.cues.map((c, i) => {
          const isCurrent = i === cueIndex
          const mine = c.role === myRole
          return (
            <li
              key={i}
              aria-current={isCurrent ? 'step' : undefined}
              className={`rounded px-2 py-1 text-sm ${
                isCurrent ? 'bg-stage-border/40 font-semibold text-stage-text' : 'text-stage-text-muted'
              }`}
            >
              <span className={mine ? 'text-fire-amber' : ''}>{c.role}</span>
              {': '}
              {c.text}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
