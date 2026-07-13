import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Script } from './cues'
import { roleOf, type RoleMap } from './roleMap'
import TeleprompterFocus from './TeleprompterFocus'
import { FONT_SCALES, LIST_TEXT_CLS, type FontScale } from './fontScale'

// 개인 글자 크기(MILESTONES Phase 3 AC) — 기기 로컬 설정(localStorage), 다른 참가자에게 전파 없음.
const FONT_SCALE_KEY = 'cb.scriptFontScale'
const SETTINGS_OPEN_KEY = 'cb.scriptSettingsOpen'

function storedFontScale(): FontScale {
  const v = localStorage.getItem(FONT_SCALE_KEY)
  return (FONT_SCALES as readonly string[]).includes(v ?? '') ? (v as FontScale) : 'md'
}

// 실시간 연기 텔레프롬프터 + 역할 클레임(ROOM-14).
// UIUX 위계(2026-07-13 A안 — 무대용): 좁은 좌 dock(216~256px)에서 "현재 대사"가 지배 요소가 되도록,
//   셋업 chrome(글자 크기·호스트 배정·전체 대본)는 ⚙ 설정 뒤로 접는다. 상시 노출 = 모드·제목(1줄)·역할 칩·대사.
// "내 차례" = 현재 cue 의 역할 == 내가 클레임한 역할(roleMap 서버 동기). 계약: contracts/ScriptPanel.md.
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
  const [fontScale, setFontScale] = useState<FontScale>(storedFontScale)
  const [settingsOpen, setSettingsOpen] = useState(() => localStorage.getItem(SETTINGS_OPEN_KEY) === '1')
  const stepFontScale = (delta: number) => {
    const i = FONT_SCALES.indexOf(fontScale) + delta
    const next = FONT_SCALES[Math.max(0, Math.min(FONT_SCALES.length - 1, i))]
    setFontScale(next)
    localStorage.setItem(FONT_SCALE_KEY, next)
  }
  const toggleSettings = () => {
    setSettingsOpen((v) => {
      const next = !v
      localStorage.setItem(SETTINGS_OPEN_KEY, next ? '1' : '0')
      return next
    })
  }
  const myRole = roleOf(roleMap, myAuthId)
  const current = script.cues[cueIndex]
  const myTurn = !!current && current.role === myRole
  const atStart = cueIndex <= 0
  const atEnd = cueIndex >= script.cues.length - 1
  const modeLabel = scriptMode === 'rehearsal' ? t('script.modeRehearsal') : t('script.modePerformance')

  return (
    <section className="mt-8">
      {/* 헤더 1줄 — 모드 태그(호스트=토글·비호스트=라벨) + 대본 제목 */}
      <div className="flex items-center gap-1.5">
        {isHost ? (
          <button
            onClick={onToggleMode}
            aria-pressed={scriptMode === 'rehearsal'}
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
              scriptMode === 'rehearsal'
                ? 'bg-fire-amber text-stage-base'
                : 'border border-stage-border text-stage-text hover:text-fire-amber'
            }`}
          >
            {modeLabel}
          </button>
        ) : (
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              scriptMode === 'rehearsal' ? 'bg-fire-amber/15 text-fire-amber' : 'border border-stage-border text-stage-text-muted'
            }`}
          >
            {modeLabel}
          </span>
        )}
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-stage-text">{script.title}</h2>
      </div>
      {scriptMode === 'rehearsal' && (
        <p className="mt-1 text-[10px] text-stage-text-muted">{t('script.rehearsalHint')}</p>
      )}

      {/* 역할 칩 — 각자 선착순 클레임(탭). 내 역할=앰버 채움(탭=내려놓기), 남=테두리, 빈=파선. 관전자는 정적. */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {script.roles.map((r) => {
          const claim = roleMap[r]
          const mine = claim?.authId === myAuthId
          const base = 'rounded-full px-2 py-0.5 text-[11px] font-medium'
          if (mine) {
            return (
              <button key={r} onClick={() => onRelease(r)} className={`${base} bg-fire-amber/20 text-fire-amber`}>
                {r} · {t('script.me')}
              </button>
            )
          }
          if (claim) {
            return (
              <span key={r} className={`${base} border border-stage-border text-stage-text-muted`}>
                {r} · {claim.name ?? '?'}
              </span>
            )
          }
          if (isViewer) {
            return (
              <span key={r} className={`${base} border border-dashed border-stage-border text-stage-text-muted`}>
                {r}
              </span>
            )
          }
          return (
            <button
              key={r}
              onClick={() => onClaim(r)}
              className={`${base} border border-dashed border-stage-border text-stage-text-muted hover:border-fire-amber hover:text-fire-amber`}
            >
              {r}
            </button>
          )
        })}
      </div>

      {/* ★ 지배 요소 — 현재 대사 포커스(긴 대사 박스 스크롤·다음 미리보기·진행). 배치 무관(C 승급 지점). */}
      <TeleprompterFocus
        cue={current ?? null}
        cueIndex={cueIndex}
        total={script.cues.length}
        myTurn={myTurn}
        nextCue={script.cues[cueIndex + 1] ?? null}
        fontScale={fontScale}
        canAdvance={canAdvance}
        atStart={atStart}
        atEnd={atEnd}
        onAdvance={onAdvance}
      />

      {/* ⚙ 설정(접힘) — 셋업 chrome: 글자 크기·호스트 배정·전체 대본. 공연 중엔 숨어 대사에 초점. */}
      <div className="mt-3 border-t border-stage-border pt-2">
        <button
          type="button"
          onClick={toggleSettings}
          aria-expanded={settingsOpen}
          className="flex items-center gap-1 text-xs font-semibold text-stage-text-muted hover:text-stage-text"
        >
          <span aria-hidden>{settingsOpen ? '▾' : '▸'}</span>
          <span aria-hidden>⚙</span>
          {t('script.settings')}
        </button>

        {settingsOpen && (
          <div className="mt-2 space-y-3">
            {/* 글자 크기 */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-stage-text-muted">{t('script.fontSize')}</span>
              <span role="group" aria-label={t('script.fontSize')} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => stepFontScale(-1)}
                  disabled={fontScale === 'sm'}
                  aria-label={t('script.fontSmaller')}
                  className="rounded border border-stage-border px-1.5 py-0.5 text-[11px] text-stage-text-muted hover:text-stage-text disabled:opacity-40"
                >
                  A−
                </button>
                <button
                  type="button"
                  onClick={() => stepFontScale(1)}
                  disabled={fontScale === 'lg'}
                  aria-label={t('script.fontLarger')}
                  className="rounded border border-stage-border px-1.5 py-0.5 text-[11px] text-stage-text-muted hover:text-stage-text disabled:opacity-40"
                >
                  A+
                </button>
              </span>
            </div>

            {/* 호스트 배정 — 선착순 클레임(칩)과 별개로 호스트가 재배정/해제(대상=활성 배우) */}
            {isHost && (
              <ul className="space-y-1">
                {script.roles.map((r) => {
                  const claim = roleMap[r]
                  const mine = claim?.authId === myAuthId
                  return (
                    <li key={r} className="flex items-center gap-1.5 text-xs">
                      <span className="font-semibold">{r}</span>
                      <span className="min-w-0 truncate text-stage-text-muted">
                        {claim ? (claim.name ?? '?') : t('script.roleFree')}
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        {claim && !mine && (
                          <button
                            onClick={() => onAssign(r, null)}
                            aria-label={t('script.unassignRole')}
                            className="rounded border border-stage-border px-1.5 py-0.5 text-[11px] text-stage-text-muted hover:text-fire-hot"
                          >
                            ✕
                          </button>
                        )}
                        {!claim && actors.length > 0 && (
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
            )}

            {/* 전체 대본 — 현재 줄 하이라이트 */}
            <div>
              <h3 className="mb-1 text-[11px] font-semibold text-stage-text-muted">{t('script.fullScript')}</h3>
              <ol className="space-y-1">
                {script.cues.map((c, i) => {
                  const isCurrent = i === cueIndex
                  const mine = c.role === myRole
                  return (
                    <li
                      key={i}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={`rounded px-2 py-1 ${LIST_TEXT_CLS[fontScale]} ${
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
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
