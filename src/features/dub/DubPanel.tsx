import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { useDubStore } from '@/stores/dubStore'
import { setRoomMode } from '@/lib/rooms'
import { useRealtimeRow } from '@/hooks/useRealtimeRow'
import DubRecorder from '@/features/dub/DubRecorder'
import DubCompositor from '@/features/dub/DubCompositor'
import {
  uploadDubSource, createDubSession, startTranscription, translateDubScript, assignRoles,
  recordConsent, startRecording, fetchRoomMembers, fetchActiveDubSession,
  fetchMyUserId, fetchRoomHostId, fetchDubTracks, updateDubSegmentText, getDubSourceUrl,
  type DubSegment, type DubTrack, type RoomMember, type DubLang,
} from '@/lib/dub'

// Phase 3B 더빙 슬라이스 최소 UI: 업로드 → STT → 역할배정 → 동의 → 녹음 진입.
// ponytail(기능 우선, UI는 Phase 3): 계약서의 3분할(SessionSelector/RoleAssigner/Recorder)·dubStore·
//   Realtime 자동갱신·실제 녹음 캡처(MediaRecorder)·합성은 후속 슬라이스. 여기선 단일 패널 + 수동 새로고침.

interface Session {
  id: string
  status: string
  created_by: string
  diarization_result_json: { segments: DubSegment[] } | null
  consent_json: { participants: Record<string, { consented: boolean }>; all_consented: boolean } | null
  role_version: number
}

export default function DubPanel({ roomId, isViewer }: { roomId: string; isViewer?: boolean }) {
  const { t } = useTranslation()
  const token = useUserStore((s) => s.session?.access_token)
  const [myId, setMyId] = useState<string | null>(null)
  const [hostId, setHostId] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [members, setMembers] = useState<RoomMember[]>([])
  const [tracks, setTracks] = useState<DubTrack[]>([])
  const [assignments, setAssignments] = useState<Record<number, string>>({})
  const [file, setFile] = useState<File | null>(null)
  // DUB-LANG: 소스(원본) 언어 — 방 UI 언어와 분리. 기본 ja(더빙 1차 용도 = 애니 JP→KR).
  const [sourceLanguage, setSourceLanguage] = useState<DubLang>('ja')
  // 의상실식 자동 파이프라인 단계 표시(업로드→대본추출→번역). 사람 게이트(역할배정) 전까지 자동 연쇄.
  const [phase, setPhase] = useState<'uploading' | 'transcribing' | 'translating' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)
  // V-10 자막편집: 편집 중인 세그먼트(보이는 필드를 고침 — 번역 표시 중이면 translated_text, 아니면 text)
  const [editing, setEditing] = useState<{ segId: number; value: string } | null>(null)

  const isHost = !!myId && myId === hostId
  const segments = session?.diarization_result_json?.segments ?? []
  const allConsented = session?.consent_json?.all_consented ?? false
  const myConsent = !!(myId && session?.consent_json?.participants[myId]?.consented)

  const refresh = useCallback(async () => {
    if (!token) return
    const [s, m] = await Promise.all([fetchActiveDubSession(roomId), fetchRoomMembers(token, roomId)])
    setSession(s as Session | null)
    setMembers(m)
    if (s && ['ready', 'recording', 'compositing', 'completed'].includes(s.status)) {
      setTracks(await fetchDubTracks(s.id))
    } else {
      setTracks([])
    }
    // 3패널 공유(DUB-UX): 센터 영상·좌패널 대본이 dubStore 로 더빙에 반응. 소스 서명 URL 은 세션이 바뀔 때만 재발급.
    if (s) {
      const segs = (s as Session).diarization_result_json?.segments ?? []
      const prev = useDubStore.getState()
      let sourceUrl = prev.sourceUrl
      if (prev.activeSessionId !== s.id) {
        sourceUrl = null
        try { sourceUrl = await getDubSourceUrl(token, s.id) } catch { /* 소스 아직 없음(uploaded 전) */ }
      }
      useDubStore.getState().setActive({ activeSessionId: s.id, status: s.status, segments: segs, sourceUrl })
    } else {
      useDubStore.getState().clear()
    }
  }, [token, roomId])

  // 방 이탈(언마운트) 시 더빙 공유상태 초기화 — 다른 방으로 잔상 누출 방지.
  useEffect(() => () => useDubStore.getState().clear(), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [mid, hid] = await Promise.all([fetchMyUserId(), fetchRoomHostId(roomId)])
      if (cancelled) return
      setMyId(mid)
      setHostId(hid)
      await refresh()
    })()
    return () => { cancelled = true }
  }, [roomId, refresh])

  // 수동 새로고침 제거(A-SEAM-3): 세션 생명주기(uploaded→…→completed)·트랙 상태(assigned→synced)를
  // Realtime 으로 구독 → 변경 시 신뢰 소스 재조회. dub_* 는 supabase_realtime publication 에 등록됨.
  useRealtimeRow('dub_sessions', 'room_id', roomId, refresh)
  useRealtimeRow('dub_tracks', 'dub_session_id', session?.id, refresh)

  // 역할 배정: 명시 선택이 없으면 세그먼트 순서대로 자동 교대(호스트가 override 가능).
  // effect 로 prefill 하지 않고 렌더 시 파생 → set-state-in-effect 회피.
  const assignedTo = (segId: number): string => {
    if (assignments[segId] !== undefined) return assignments[segId]
    if (!members.length) return ''
    const idx = segments.findIndex((s) => s.id === segId)
    return members[idx % members.length].userId
  }

  async function run(fn: () => Promise<unknown>) {
    if (!token) return
    setBusy(true); setError(null)
    try { await fn(); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : t('dub.actionFailed')) }
    finally { setBusy(false) }
  }

  const memberName = (uid: string) =>
    members.find((m) => m.userId === uid)?.displayName ?? uid.slice(0, 8)

  const status = session?.status ?? null
  const allSynced = tracks.length > 0 && tracks.every((t) => t.status === 'synced')
  // DUB-UX 흐름 명료화: 솔로(멤버 1)면 역할 배정이 자명 · 상단 단계 표시기(①업로드 ②역할 ③동의 ④녹음 ⑤완성).
  const isSolo = members.length <= 1
  const currentStep = !status ? 1
    : status === 'uploaded' || status === 'transcribing' ? 2
    : status === 'ready' && tracks.length === 0 ? 2
    : status === 'ready' && !allConsented ? 3
    : status === 'recording' || status === 'ready' ? 4
    : status === 'compositing' || status === 'completed' ? 5
    : 1
  const dubSteps = ['stepUpload', 'stepRole', 'stepConsent', 'stepRecord', 'stepDone'] as const

  // G-261 호스트 관찰자: 합성 완료 시 방 모드 'normal' 복귀(best-effort — 실패해도 더빙 흐름 무손상).
  const prevDubStatusRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevDubStatusRef.current
    prevDubStatusRef.current = status
    if (!isHost || !token) return
    if (prev !== 'completed' && status === 'completed') void setRoomMode(token, roomId, 'normal').catch(() => {})
  }, [status, isHost, token, roomId])

  return (
    <section className="mt-8 rounded-lg border border-stage-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stage-text-muted">
          {t('dub.header')} {status && <span className="ml-2 rounded bg-stage-border px-2 py-0.5 text-xs">{status}</span>}
        </h2>
      </div>

      {/* DUB-UX 단계 표시기: 현재 위치·다음 단계를 항상 보이게(역할저장 후 뭐가 되는지 불명 해소). */}
      <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-[10px]" aria-label={t('dub.stepsLabel')}>
        {dubSteps.map((k, i) => {
          const n = i + 1
          const state = n < currentStep ? 'done' : n === currentStep ? 'current' : 'todo'
          return (
            <li key={k} className={`flex items-center gap-1 ${state === 'current' ? 'font-semibold text-fire-amber' : state === 'done' ? 'text-stage-text' : 'text-stage-text-muted'}`}>
              <span aria-hidden className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${state === 'current' ? 'bg-fire-amber text-stage-base' : state === 'done' ? 'bg-stage-text/60 text-stage-base' : 'border border-stage-border'}`}>{state === 'done' ? '✓' : n}</span>
              {t(`dub.${k}`)}
              {i < dubSteps.length - 1 && <span aria-hidden className="text-stage-text-muted">›</span>}
            </li>
          )
        })}
      </ol>

      {/* R7 뷰어 안내: 관전자는 배정·녹음 참여가 없다 — 탭의 목적(진행 구경)을 1줄로 명시. */}
      {isViewer && status && (
        <p className="mt-2 text-xs text-stage-text-muted">{t('dub.viewerHint')}</p>
      )}

      {error && <p className="mt-3 rounded bg-fire-hot/10 px-3 py-2 text-sm text-fire-hot" role="alert">{error}</p>}

      {/* 세션 없음 */}
      {!status && (
        isHost ? (
          <div className="mt-3 space-y-3">
            {/* 1) 영상 선택 — label 이 파일 input 을 감싸 "큰 버튼"으로(어포던스 명확·#14/#18). 파일 고르면 이름 표시. */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stage-border px-4 py-2 text-sm font-medium text-stage-text transition hover:border-fire-amber/60 hover:bg-stage-border/30 focus-within:ring-1 focus-within:ring-fire-amber">
                <span aria-hidden>📁</span>{t('dub.pickFileButton')}
                <input
                  type="file" accept="video/mp4,video/webm,audio/mp4,audio/mpeg,audio/wav"
                  className="sr-only"
                  onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
                  aria-label={t('dub.sourceFileLabel')}
                />
              </label>
              {file
                ? <span className="text-xs text-stage-text">{file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB</span>
                : <span className="text-xs text-stage-text-muted">{t('dub.fileNote')}</span>}
            </div>
            {/* 2) 원본 언어(DUB-LANG) — STT/번역 힌트. 방 UI 언어와 분리(안 고르면 STT 오인식+번역 스킵). */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-stage-text-muted">{t('dub.sourceLanguageLabel')}</span>
              <select
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.currentTarget.value as DubLang)}
                aria-label={t('dub.sourceLanguageLabel')}
                className="rounded-lg border border-stage-border bg-stage-base px-2 py-2 text-sm text-stage-text focus:ring-1 focus:ring-fire-amber"
              >
                <option value="ja">{t('dub.lang_ja')}</option>
                <option value="en">{t('dub.lang_en')}</option>
                <option value="ko">{t('dub.lang_ko')}</option>
              </select>
            </div>
            {/* 3) 시작 — 파일 없으면 비활성 + "왜 회색인지" 명시(#13/#17). 호버·포커스 피드백 추가. */}
            <div>
              <button
                disabled={!file || busy}
                onClick={() => run(async () => {
                  try {
                    setPhase('uploading')
                    const path = await uploadDubSource(token!, roomId, file!)
                    const sess = await createDubSession(token!, roomId, path, sourceLanguage)
                    // G-261: 더빙 세션 개시 = 방 모드 'dub'(서버 broadcast → 전원 탭 전환+배너). best-effort.
                    void setRoomMode(token!, roomId, 'dub').catch(() => {})
                    // 의상실처럼: 기계적 AI 단계는 물어보지 않고 자동 연쇄 — 대본 추출(STT) → 번역(비-ko).
                    // 사람이 필요한 역할배정/동의/녹음 전까지 흐른다. 번역 실패는 비치명(대본은 남음 → 수동 재번역 가능).
                    setPhase('transcribing')
                    await startTranscription(token!, sess.dub_session_id)
                    if (sourceLanguage !== 'ko') {
                      setPhase('translating')
                      await translateDubScript(token!, sess.dub_session_id).catch(() => {})
                    }
                  } finally { setPhase(null) }
                })}
                className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-fire-amber focus-visible:ring-offset-1 disabled:opacity-40"
              >
                {phase === 'transcribing' ? t('dub.pipelineTranscribing')
                  : phase === 'translating' ? t('dub.pipelineTranslating')
                  : busy ? t('dub.uploadLoading') : t('dub.uploadButton')}
              </button>
              {!file && !busy && <p className="mt-1 text-[11px] text-stage-text-muted">{t('dub.pickFirstHint')}</p>}
              {busy && <p className="mt-1 text-[11px] text-stage-text-muted">{t('dub.pipelineNote')}</p>}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-stage-text-muted">{t('dub.hostNotStarted')}</p>
        )
      )}

      {/* 업로드됨 → STT */}
      {status === 'uploaded' && (
        isHost ? (
          <button
            disabled={busy}
            onClick={() => run(() => startTranscription(token!, session!.id))}
            className="mt-3 rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
          >
            {busy ? t('dub.sttLoading') : t('dub.sttButton')}
          </button>
        ) : <p className="mt-3 text-sm text-stage-text-muted">{t('dub.hostTranscribing')}</p>
      )}

      {status === 'transcribing' && (
        <p className="mt-3 text-sm text-stage-text-muted">{t('dub.waitingForTranscribe')}</p>
      )}

      {status === 'failed' && (
        <p className="mt-3 text-sm text-fire-hot">{t('dub.processingFailed')}</p>
      )}

      {/* READY: 세그먼트 + 역할배정 + 동의 */}
      {status === 'ready' && (
        <div className="mt-3 space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-semibold text-stage-text-muted">{t('dub.scriptSection', { count: segments.length })}</h3>
              {isHost && (
                <button
                  disabled={busy}
                  onClick={() => run(() => translateDubScript(token!, session!.id))}
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
                          await updateDubSegmentText(token!, session!.id, seg.id,
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
                    <span className="flex-1 truncate">
                      {shownText}
                      {isHost && (
                        <button
                          onClick={() => setEditing({ segId: seg.id, value: shownText })}
                          aria-label={t('dub.segEditLabel')}
                          className="ml-1 text-xs text-stage-text-muted hover:text-stage-text"
                        >
                          ✏️
                        </button>
                      )}
                    </span>
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
                      {tracks.find((t) => t.startTimeMs === seg.start_ms)
                        ? memberName(tracks.find((t) => t.startTimeMs === seg.start_ms)!.participantId)
                        : t('dub.roleUnassigned')}
                    </span>
                  )}
                </li>
                )
              })}
            </ul>
            {isHost && (
              <div className="mt-2 space-y-1">
                <p className="text-[11px] text-stage-text-muted">
                  {isSolo
                    ? t('dub.roleSoloNote')
                    : t('dub.roleAssignedCount', { done: segments.filter((s) => assignedTo(s.id)).length, total: segments.length })}
                </p>
                <button
                  disabled={busy || segments.some((s) => !assignedTo(s.id))}
                  onClick={() => run(() => assignRoles(token!, session!.id,
                    segments.map((s) => ({ segment_id: s.id, participant_id: assignedTo(s.id) }))))}
                  className="rounded-lg bg-fire-amber px-4 py-2 text-xs font-semibold text-stage-base transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-fire-amber focus-visible:ring-offset-1 disabled:opacity-40"
                >
                  {t('dub.roleSaveButton')}
                </button>
                {tracks.length === 0 && <p className="text-[11px] text-stage-text-muted">{t('dub.roleNextHint')}</p>}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-stage-text-muted">
              {t('dub.consentLabel')} {allConsented ? t('dub.consentDone') : t('dub.consentWaiting')}
            </h3>
            <button
              disabled={busy || myConsent}
              onClick={() => run(() => recordConsent(token!, session!.id, true))}
              className="mt-2 rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-fire-amber focus-visible:ring-offset-1 disabled:opacity-40"
            >
              {myConsent ? t('dub.consentYes') : t('dub.consentButton')}
            </button>
            <p className="mt-1 text-[11px] text-stage-text-muted">{t('dub.consentNextHint')}</p>
          </div>

          {isHost && (
            <div>
              <button
                disabled={busy || !allConsented || tracks.length === 0}
                onClick={() => run(() => startRecording(token!, session!.id))}
                className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-fire-amber focus-visible:ring-offset-1 disabled:opacity-40"
              >
                {t('dub.recordingStart')}
              </button>
              {(!allConsented || tracks.length === 0) && (
                <p className="mt-1 text-[11px] text-stage-text-muted">{t('dub.recordDisabledHint')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* RECORDING: 실제 녹음 캡처 (DUB-04) + 전 트랙 synced 시 합성 진입 */}
      {status === 'recording' && (
        <>
          <DubRecorder
            dubSessionId={session!.id}
            myId={myId}
            isHost={isHost}
            tracks={tracks}
            members={members}
            onChanged={refresh}
          />
          {allSynced && (
            <DubCompositor
              dubSessionId={session!.id}
              status={status}
              isHost={isHost}
              tracks={tracks}
              segments={segments}
              onChanged={refresh}
            />
          )}
        </>
      )}

      {/* COMPOSITING / COMPLETED: 합성 진행·완성본 (DUB-05) */}
      {(status === 'compositing' || status === 'completed') && (
        <DubCompositor
          dubSessionId={session!.id}
          status={status}
          isHost={isHost}
          tracks={tracks}
          segments={segments}
          onChanged={refresh}
        />
      )}
    </section>
  )
}
