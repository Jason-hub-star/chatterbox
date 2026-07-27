import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDubStore } from '@/stores/dubStore'
import { useUserStore } from '@/stores/userStore'
import { updateDubSegmentText, dubEffectiveEndMs, DUB_SESSION_STATUS_I18N, type DubSegment } from '@/lib/dub'

// DUB-UX: 좌도크 더빙 대본 텔레프롬프터 — 센터 영상 재생 위치(currentSegmentId)에 맞춰 현재 대사
//   하이라이트+auto-scroll. 오른쪽 패널은 좁아 긴 대사가 잘리므로, 전체 텍스트는 여기서 줄바꿈으로
//   읽고 호스트는 여기서 직접 편집한다(updateDubSegmentText). 편집은 ready 상태에서만(녹음 후 잠금).
export default function DubScriptPanel({ isHost }: { isHost: boolean }) {
  const { t } = useTranslation()
  const segments = useDubStore((s) => s.segments)
  const currentId = useDubStore((s) => s.currentSegmentId)
  const status = useDubStore((s) => s.status)
  const sessionId = useDubStore((s) => s.activeSessionId)
  const myTurnRanges = useDubStore((s) => s.myTurnRanges) // F8: 내 미제출 트랙(좌패널 [녹음] 매칭)
  const segStatus = useDubStore((s) => s.segmentStatus) // U3: 세그별 더빙 상태 마크(✓)
  const token = useUserStore((s) => s.session?.access_token)
  const activeRef = useRef<HTMLLIElement>(null)
  const [editing, setEditing] = useState<{ id: number; value: string } | null>(null)
  const [saving, setSaving] = useState(false)
  // F5: 대사 문구는 녹음 중에도 수정 가능(서버 게이트 동형) — 시간/구조 편집은 ready 잠금 유지.
  const canEdit = isHost && (status === 'ready' || status === 'recording') && !!token && !!sessionId
  // Y2: 제출 직후 해당 행 하이라이트("저장됐다" 앵커) — 표시는 store 파생(렌더), 타이머는 소멸만(2.5s 후 클리어→transition 페이드)
  const submitFlash = useDubStore((s) => s.submitFlash)

  useEffect(() => {
    if (!editing) activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentId, editing])

  useEffect(() => {
    if (!submitFlash) return
    const tm = window.setTimeout(() => useDubStore.getState().setSubmitFlash(null), 2500)
    return () => window.clearTimeout(tm)
  }, [submitFlash])

  // Y1 재청취 발견성: 대사·🎧 공용 rehearse 토글(DUB-PART-LOOP 로직 그대로 — 재클릭 해제, 녹음/프리뷰 점유 중 무동작)
  const toggleRehearse = (seg: DubSegment) => {
    const st = useDubStore.getState()
    st.setSelectedSegment(seg.id)
    const lm = st.localMode
    if (lm && lm.kind !== 'rehearse') return
    if (lm?.kind === 'rehearse' && lm.startMs === seg.start_ms) { st.setLocalMode(null); return }
    st.setLocalMode({ kind: 'rehearse', startMs: seg.start_ms, endMs: dubEffectiveEndMs(seg.end_ms, segments), audioUrl: null }) // Z2 핸들 — 말꼬리까지 반복
  }

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
        {status && <span className="ml-2 rounded bg-stage-border px-2 py-0.5 text-[10px]">{DUB_SESSION_STATUS_I18N[status] ? t(DUB_SESSION_STATUS_I18N[status]) : status}</span>}
      </h2>
      {/* F7: 비호스트에게 편집 권한 소재 안내(✏️ 부재가 버그처럼 보이는 것 방지) */}
      {!isHost && segments.length > 0 && (
        <p className="mt-1 text-[10px] text-stage-text-muted">{t('dub.hostOnlyEditHint')}</p>
      )}
      {/* Y1: 재청취/리허설 발견성 — title 툴팁에만 있던 안내를 상시 1줄로(터치 포함) */}
      {segments.length > 0 && (
        <p className="mt-1 text-[10px] text-stage-text-muted">{t('dub.rehearseDiscoverHint')}</p>
      )}
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
                className={`rounded px-2 py-1 transition-colors duration-700 ${submitFlash?.segId === seg.id ? 'bg-fire-amber/30 ring-1 ring-fire-amber' : active ? 'bg-fire-amber/15 text-stage-text' : 'text-stage-text-muted'}`}
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
                      {/* F2→DUB-PART-LOOP: 대사 클릭 = 이 파트만 반복 재생(리허설) · 재클릭 = 해제.
                          더빙된 파트는 상시 레이어가 더빙 소리도 같이 반복. 녹음/프리뷰 점유 중엔 무동작(테이크 보호). */}
                      <button
                        onClick={() => toggleRehearse(seg)}
                        title={t('dub.rehearseHint')}
                        className={`flex-1 text-left ${active ? 'font-medium' : ''} hover:text-stage-text`}
                      >
                        {shown}
                      </button>
                      {/* U3→Y2: 더빙 상태 마크 — 색상만의 ✓ 를 텍스트 배지로(색맹/터치 겸용) + Y1 🎧 재청취(보이는 진입점) */}
                      {(segStatus[seg.id] === 'submitted' || segStatus[seg.id] === 'synced') && (
                        <>
                          <span
                            data-dub-line-status={segStatus[seg.id]}
                            title={t(segStatus[seg.id] === 'synced' ? 'dub.segConfirmed' : 'dub.segRecorded')}
                            className={`shrink-0 text-xs ${segStatus[seg.id] === 'synced' ? 'text-emerald-400' : 'text-fire-amber'}`}
                          >
                            ✓ {t(segStatus[seg.id] === 'synced' ? 'dub.segBadgeSynced' : 'dub.segBadgeSubmitted')}
                          </span>
                          <button
                            onClick={() => toggleRehearse(seg)}
                            aria-label={t('dub.rehearseHint')}
                            title={t('dub.rehearseHint')}
                            data-dub-relisten
                            className="shrink-0 text-xs hover:brightness-125"
                          >
                            🎧
                          </button>
                        </>
                      )}
                      {/* F8→U1 PANEL-UNIFY: 녹음 중 내 차례 대사는 좌패널에서 바로 녹음 시작(recEngine 직결) */}
                      {status === 'recording' && myTurnRanges.some((r) => r.startMs === seg.start_ms) && (
                        <button
                          onClick={() => useDubStore.getState().recEngine?.start(
                            myTurnRanges.find((r) => r.startMs === seg.start_ms)!.trackId,
                          )}
                          aria-label={t('dub.recordFromScript')}
                          title={t('dub.recordFromScript')}
                          className="shrink-0 text-xs text-fire-amber hover:brightness-125"
                        >
                          🎙
                        </button>
                      )}
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
