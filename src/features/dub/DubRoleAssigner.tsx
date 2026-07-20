import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '@/hooks/useToast'
import {
  assignRoles, recordConsent, startRecording, translateDubScript, updateDubSegmentText,
  type DubSegment, type DubTrack, type RoomMember,
} from '@/lib/dub'

// 계약: contracts/DubRoleAssigner.md — READY 담당(대본 확인/편집(V-10)·역할 배정·동의(G-43)·RECORDING 전이).
// DubPanel 674줄 분할(2026-07-19) — 동작 불변 추출: ready 전용 상태(편집·배정 선택·솔로 동의)가 통째로 이사.
// S4 솔로 패스트패스([이 장면, 내 목소리로] 원버튼)·감사 픽스(역할저장 toast) 포함.

interface Props {
  token: string
  sessionId: string
  segments: DubSegment[]
  tracks: DubTrack[]
  members: RoomMember[]
  myId: string | null
  isHost: boolean
  isSolo: boolean
  isViewer?: boolean // F1: 관전자 — 동의/배정 액션 미노출(대본 열람만)
  allConsented: boolean
  myConsent: boolean
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
}

export default function DubRoleAssigner({ token, sessionId, segments, tracks, members, myId, isHost, isSolo, isViewer = false, allConsented, myConsent, busy, run }: Props) {
  const { t } = useTranslation()
  // 번역본이 있으면 기본으로 번역(한국어 등)을 보여준다 — 더빙 대본의 주 사용본은 번역본.
  const [showTranslation, setShowTranslation] = useState(true)
  // V-10 자막편집: 편집 중인 세그먼트(보이는 필드를 고침 — 번역 표시 중이면 translated_text, 아니면 text)
  const [editing, setEditing] = useState<{ segId: number; value: string } | null>(null)
  const [assignments, setAssignments] = useState<Record<number, string>>({})
  const [soloConsent, setSoloConsent] = useState(false) // S4: 솔로 원버튼 인라인 동의 체크

  const memberName = (uid: string) =>
    members.find((m) => m.userId === uid)?.displayName ?? uid.slice(0, 8)

  // 역할 배정: 명시 선택이 없으면 세그먼트 순서대로 자동 교대(호스트가 override 가능).
  // effect 로 prefill 하지 않고 렌더 시 파생 → set-state-in-effect 회피.
  const assignedTo = (segId: number): string => {
    if (assignments[segId] !== undefined) return assignments[segId]
    if (!members.length) return ''
    const idx = segments.findIndex((s) => s.id === segId)
    return members[idx % members.length].userId
  }

  return (
    <div className="mt-3 space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold text-stage-text-muted">{t('dub.scriptSection', { count: segments.length })}</h3>
          {isHost && (
            <button
              disabled={busy}
              onClick={() => run(() => translateDubScript(token, sessionId))}
              className="rounded border border-stage-border px-2 py-0.5 text-xs hover:bg-stage-border/30 disabled:opacity-40"
            >
              {busy ? t('dub.translateLoading') : t('dub.translateButton')}
            </button>
          )}
          {segments.some((s) => s.translated_text) && (
            <button
              onClick={() => setShowTranslation((v) => !v)}
              className="rounded border border-stage-border px-2 py-0.5 text-xs"
            >
              {showTranslation ? t('dub.showOriginal') : t('dub.showTranslation')}
            </button>
          )}
        </div>
        <ul className="mt-2 space-y-1 text-sm">
          {segments.map((seg) => {
            const editsTranslation = showTranslation && !!seg.translated_text
            const shownText = editsTranslation ? seg.translated_text! : seg.text
            // R7 내 세그먼트 강조: 배정(호스트=선택값·비호스트=트랙 진실)이 나면 앰버 강조선+배지.
            const mine = !!myId && (isHost
              ? assignedTo(seg.id) === myId
              : tracks.find((tr) => tr.startTimeMs === seg.start_ms)?.participantId === myId)
            return (
            <li key={seg.id} className={`flex items-center gap-2 ${mine ? 'rounded border-l-2 border-fire-amber bg-fire-amber/5 pl-1' : ''}`}>
              {mine && (
                <span aria-hidden className="shrink-0 text-[11px]" title={t('dub.mySegment')}>🎤</span>
              )}
              <span className="w-14 shrink-0 text-xs text-stage-text-muted">
                {(seg.start_ms / 1000).toFixed(1)}s
              </span>
              {editing?.segId === seg.id ? (
                <span className="flex flex-1 items-center gap-1">
                  <input
                    value={editing.value}
                    onChange={(e) => setEditing({ segId: seg.id, value: e.target.value })}
                    maxLength={500}
                    aria-label={t('dub.segEditLabel')}
                    className="w-full rounded border border-stage-border bg-transparent px-2 py-1 text-sm"
                  />
                  <button
                    disabled={busy || !editing.value.trim()}
                    onClick={() => run(async () => {
                      await updateDubSegmentText(token, sessionId, seg.id,
                        editsTranslation ? { translated_text: editing.value } : { text: editing.value })
                      setEditing(null)
                    })}
                    className="rounded border border-stage-border px-2 py-1 text-xs hover:bg-stage-border/30 disabled:opacity-40"
                  >
                    {t('dub.segEditSave')}
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="rounded border border-stage-border px-2 py-1 text-xs hover:bg-stage-border/30"
                  >
                    {t('dub.segEditCancel')}
                  </button>
                </span>
              ) : (
                <>
                  {/* ✏️ 를 truncate span 밖 shrink-0 로 — 긴 대사에도 편집 버튼이 안 잘리고 항상 보인다. */}
                  <span className="flex-1 truncate">{shownText}</span>
                  {isHost && (
                    <button
                      onClick={() => setEditing({ segId: seg.id, value: shownText })}
                      aria-label={t('dub.segEditLabel')}
                      title={t('dub.segEditLabel')}
                      className="shrink-0 text-xs text-stage-text-muted hover:text-fire-amber"
                    >
                      ✏️
                    </button>
                  )}
                </>
              )}
              {isHost && !isSolo ? (
                <select
                  value={assignedTo(seg.id)}
                  onChange={(e) => setAssignments((a) => ({ ...a, [seg.id]: e.target.value }))}
                  className="rounded border border-stage-border bg-transparent px-2 py-1 text-xs"
                >
                  <option value="">{t('dub.rolePlaceholder')}</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>{m.displayName ?? m.userId.slice(0, 8)}</option>
                  ))}
                </select>
              ) : isHost ? (
                <span className="text-xs font-medium text-fire-amber">{t('dub.roleMine')}</span>
              ) : (
                <span className="text-xs text-stage-text-muted">
                  {tracks.find((tr) => tr.startTimeMs === seg.start_ms)
                    ? memberName(tracks.find((tr) => tr.startTimeMs === seg.start_ms)!.participantId)
                    : t('dub.roleUnassigned')}
                </span>
              )}
            </li>
            )
          })}
        </ul>
        {isHost && !isSolo && (
          <div className="mt-2 space-y-1">
            <p className="text-[11px] text-stage-text-muted">
              {t('dub.roleAssignedCount', { done: segments.filter((s) => assignedTo(s.id)).length, total: segments.length })}
            </p>
            <button
              disabled={busy || segments.some((s) => !assignedTo(s.id))}
              onClick={() => run(async () => {
                await assignRoles(token, sessionId,
                  segments.map((s) => ({ segment_id: s.id, participant_id: assignedTo(s.id) })))
                toast.success(t('dub.rolesSaved')) // 감사 픽스: 저장 확인 무피드백 해소
              })}
              className="rounded-lg bg-fire-amber px-4 py-2 text-xs font-semibold text-stage-base transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-fire-amber focus-visible:ring-offset-1 disabled:opacity-40"
            >
              {t('dub.roleSaveButton')}
            </button>
            {tracks.length === 0 && <p className="text-[11px] text-stage-text-muted">{t('dub.roleNextHint')}</p>}
          </div>
        )}
      </div>

      {/* S4 솔로 패스트패스: 배정→동의→녹음 시작을 버튼 1개로(서버 게이트 3종 불변 — all_consented=나 하나).
          체감 5단계→3막(업로드→내 목소리로→말하기). 다인 흐름은 아래 기존 3블록 그대로. */}
      {isHost && isSolo ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-stage-text">
            <input
              type="checkbox"
              checked={soloConsent}
              onChange={(e) => setSoloConsent(e.target.checked)}
              className="accent-fire-amber"
            />
            {t('dub.soloConsentLabel')}
          </label>
          <button
            disabled={busy || !soloConsent || segments.length === 0}
            onClick={() => run(async () => {
              await assignRoles(token, sessionId, segments.map((s) => ({ segment_id: s.id, participant_id: myId! })))
              await recordConsent(token, sessionId, true)
              await startRecording(token, sessionId)
            })}
            className="w-full rounded-lg bg-fire-amber px-4 py-3 text-sm font-semibold text-stage-base transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-fire-amber focus-visible:ring-offset-1 disabled:opacity-40"
          >
            🎙 {busy ? t('dub.soloStarting') : t('dub.soloStartButton')}
          </button>
        </div>
      ) : (
      <>
      {/* F1: 관전자는 동의 대상 아님(서버 403 동형) — 액션 미노출, 대본 열람만 */}
      {!isViewer && (
      <div>
        <h3 className="text-xs font-semibold text-stage-text-muted">
          {t('dub.consentLabel')} {allConsented ? t('dub.consentDone') : t('dub.consentWaiting')}
        </h3>
        <button
          disabled={busy || myConsent}
          onClick={() => run(() => recordConsent(token, sessionId, true))}
          className="mt-2 rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-fire-amber focus-visible:ring-offset-1 disabled:opacity-40"
        >
          {myConsent ? t('dub.consentYes') : t('dub.consentButton')}
        </button>
        <p className="mt-1 text-[11px] text-stage-text-muted">{t('dub.consentNextHint')}</p>
      </div>
      )}

      {isHost && (
        <div>
          <button
            disabled={busy || !allConsented || tracks.length === 0}
            onClick={() => run(() => startRecording(token, sessionId))}
            className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-fire-amber focus-visible:ring-offset-1 disabled:opacity-40"
          >
            {t('dub.recordingStart')}
          </button>
          {(!allConsented || tracks.length === 0) && (
            <p className="mt-1 text-[11px] text-stage-text-muted">{t('dub.recordDisabledHint')}</p>
          )}
        </div>
      )}
      </>
      )}
    </div>
  )
}
