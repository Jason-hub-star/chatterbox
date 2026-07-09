import { useTranslation } from 'react-i18next'
import type { Script } from './cues'
import { roleOf, type RoleMap } from './roleMap'

// 실시간 연기 텔레프롬프터 + 역할 클레임(ROOM-14) — 호스트가(리허설 모드면 전원이) 대사를 진행하고
// 전 참가자가 같은 위치를 본다. 역할은 각자 선착순 클레임 + 호스트 재배정/해제(주인님 확정 의미론).
// "내 차례" = 현재 cue 의 역할 == 내가 클레임한 역할(roleMap 서버 동기 — 로컬 select 폐기).
// 계약: contracts/ScriptPanel.md · state-machines/Script.md.
interface Props {
  script: Script
  cueIndex: number
  canAdvance: boolean
  isHost: boolean
  isViewer: boolean
  scriptMode: 'rehearsal' | 'performance'
  roleMap: RoleMap
  myAuthId: string
  actors: { identity: string; name: string }[]
  onClaim: (role: string) => void
  onRelease: (role: string) => void
  onAssign: (role: string, targetAuthId: string | null) => void
  onToggleMode: () => void
  onAdvance: (delta: number) => void
}

export default function ScriptPanel({
  script,
  cueIndex,
  canAdvance,
  isHost,
  isViewer,
  scriptMode,
  roleMap,
  myAuthId,
  actors,
  onClaim,
  onRelease,
  onAssign,
  onToggleMode,
  onAdvance,
}: Props) {
  const { t } = useTranslation()
  const myRole = roleOf(roleMap, myAuthId)
  const current = script.cues[cueIndex]
  const myTurn = !!current && current.role === myRole
  const atStart = cueIndex <= 0
  const atEnd = cueIndex >= script.cues.length - 1

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-stage-text-muted">{t('script.header', { title: script.title })}</h2>
        {/* 모드(ROOM-14): 호스트는 토글, 나머지는 리허설일 때만 배지로 인지. */}
        {isHost ? (
          <button
            onClick={onToggleMode}
            aria-pressed={scriptMode === 'rehearsal'}
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
              scriptMode === 'rehearsal'
                ? 'bg-fire-amber text-stage-base'
                : 'border border-stage-border text-stage-text-muted hover:text-stage-text'
            }`}
          >
            {scriptMode === 'rehearsal' ? t('script.modeRehearsal') : t('script.modePerformance')}
          </button>
        ) : (
          scriptMode === 'rehearsal' && (
            <span className="shrink-0 rounded-full bg-fire-amber/15 px-2.5 py-0.5 text-[11px] font-semibold text-fire-amber">
              {t('script.modeRehearsal')}
            </span>
          )
        )}
      </div>
      {scriptMode === 'rehearsal' && (
        <p className="mt-1 text-[11px] text-stage-text-muted">{t('script.rehearsalHint')}</p>
      )}

      {/* 역할 클레임(ROOM-14): 선착순 맡기 + 호스트 배정/해제. 관전자는 클레임 불가(서버도 403). */}
      <ul className="mt-2 space-y-1">
        {script.roles.map((r) => {
          const claim = roleMap[r]
          const mine = claim?.authId === myAuthId
          return (
            <li key={r} className="flex items-center gap-1.5 text-xs">
              <span className={`font-semibold ${mine ? 'text-fire-amber' : ''}`}>{r}</span>
              <span className="min-w-0 truncate text-stage-text-muted">
                {claim ? (claim.name ?? '?') : t('script.roleFree')}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {mine ? (
                  <button onClick={() => onRelease(r)} className="rounded border border-stage-border px-1.5 py-0.5 text-[11px] text-stage-text-muted hover:text-stage-text">
                    {t('script.release')}
                  </button>
                ) : (
                  !claim && !isViewer && (
                    <button onClick={() => onClaim(r)} className="rounded bg-fire-amber px-1.5 py-0.5 text-[11px] font-semibold text-stage-base hover:opacity-90">
                      {t('script.claim')}
                    </button>
                  )
                )}
                {isHost && claim && !mine && (
                  <button onClick={() => onAssign(r, null)} aria-label={t('script.unassignRole')} className="rounded border border-stage-border px-1.5 py-0.5 text-[11px] text-stage-text-muted hover:text-fire-hot">
                    ✕
                  </button>
                )}
                {isHost && !claim && actors.length > 0 && (
                  <select
                    value=""
                    aria-label={t('script.assignTo')}
                    onChange={(e) => e.target.value && onAssign(r, e.target.value)}
                    className="max-w-24 rounded border border-stage-border bg-stage-base px-1 py-0.5 text-[11px] text-stage-text-muted"
                  >
                    <option value="">{t('script.assignTo')}</option>
                    {actors.map((a) => (
                      <option key={a.identity} value={a.identity}>{a.name || '?'}</option>
                    ))}
                  </select>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {/* 현재 대사(텔레프롬프터) */}
      <div
        data-testid="current-cue"
        className={`mt-2 rounded-lg border p-4 ${myTurn ? 'border-fire-amber bg-fire-amber/10' : 'border-stage-border'}`}
        role="status"
        aria-live="polite"
      >
        <div className="text-xs text-stage-text-muted">
          {current ? `${current.role} · ${cueIndex + 1}/${script.cues.length}` : t('script.end')}
          {myTurn && <span className="ml-2 font-bold text-fire-amber">{t('script.myTurn')}</span>}
        </div>
        <p className="mt-1 text-lg text-stage-text">{current?.text ?? '—'}</p>
      </div>

      {/* 진행 컨트롤 — 호스트 또는 리허설/연습 방 전원(canAdvance, 서버 advance-script-cue 가 동일 규칙 재검증) */}
      {canAdvance ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => onAdvance(-1)}
            disabled={atStart}
            className="rounded-lg border border-stage-border px-3 py-1 text-sm text-stage-text disabled:opacity-40"
          >
            {t('script.prev')}
          </button>
          <button
            type="button"
            onClick={() => onAdvance(1)}
            disabled={atEnd}
            className="rounded-lg bg-fire-amber px-4 py-1 text-sm font-semibold text-stage-base disabled:opacity-40"
          >
            {t('script.next')}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-stage-text-muted">{t('script.hostAdvances')}</p>
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
