import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { useRoomStore } from '@/stores/roomStore'
import { useDubStore } from '@/stores/dubStore'
import { setRoomMode } from '@/lib/rooms'
import { useRealtimeRow } from '@/hooks/useRealtimeRow'
import DubRecorder from '@/features/dub/DubRecorder'
import DubCompositor from '@/features/dub/DubCompositor'
import {
  startTranscription, translateDubScript, separateDubAudio, revertDubSession,
  fetchRoomMembers, fetchActiveDubSession,
  fetchMyUserId, fetchRoomHostId, fetchDubTracks, getDubSourceUrl,
  type DubSegment, type DubTrack, type RoomMember, type DubLang,
} from '@/lib/dub'
// 674줄 분할(2026-07-19, 계약 정렬): 업로드/트림 = DubSessionSelector · READY(대본·역할·동의·솔로) = DubRoleAssigner.
// 이 셸은 세션 로드·Realtime·store 파생·단계표시기·상태 분기만 담당.
import DubSessionSelector, { type DubPipelinePhase } from '@/features/dub/DubSessionSelector'
import DubRoleAssigner from '@/features/dub/DubRoleAssigner'
import { toast } from '@/hooks/useToast'

// 더빙 탭 셸 — 계약 3분할 완성(2026-07-19): DubSessionSelector(생성)·DubRoleAssigner(READY)·
// DubRecorder(녹음)·DubCompositor(합성). 셸 담당 = 세션/트랙/멤버 로드·Realtime 구독·dubStore 파생·
// 단계표시기·상태 분기·파이프라인 재시도(uploaded/failed).

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
  const bedProbedRef = useRef<string | null>(null) // S1: 세션당 베드 프로브 1회 가드
  // DUB-LANG: 소스(원본) 언어 — 방 UI 언어와 분리. 기본 ja(더빙 1차 용도 = 애니 JP→KR).
  const [sourceLanguage, setSourceLanguage] = useState<DubLang>('ja')
  // 의상실식 자동 파이프라인 단계 표시(업로드→대본추출→번역). 사람 게이트(역할배정) 전까지 자동 연쇄.
  const [phase, setPhase] = useState<DubPipelinePhase>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isHost = !!myId && myId === hostId
  // useMemo: 세션 없을 때 `?? []` 가 매 렌더 새 배열 → assignees effect 공회전 방지(lint 경고 정수정)
  const segments = useMemo(() => session?.diarization_result_json?.segments ?? [], [session])
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
      // S1 베드 로드: 캐시 프로브(cache_only — fal 비발화·멤버 포함). 세션당 1회, 미스(404)는 조용히.
      if (bedProbedRef.current !== s.id && ['ready', 'recording', 'compositing', 'completed'].includes(s.status)) {
        bedProbedRef.current = s.id
        separateDubAudio(token, s.id, true)
          .then((r) => useDubStore.getState().setBedUrls(r.background_urls))
          .catch(() => useDubStore.getState().setBedUrls([]))
      }
    } else {
      useDubStore.getState().clear()
    }
  }, [token, roomId])

  // 방 이탈(언마운트) 시 더빙 공유상태 초기화 — 다른 방으로 잔상 누출 방지.
  useEffect(() => () => useDubStore.getState().clear(), [])

  // G9-P4: 내 미제출(assigned/recording) 트랙 구간 → dubStore(센터 "내 차례" 배너 재료)
  useEffect(() => {
    useDubStore.getState().setMyTurnRanges(
      myId
        ? tracks
          .filter((tr) => tr.participantId === myId && (tr.status === 'assigned' || tr.status === 'recording'))
          .map((tr) => ({ trackId: tr.id, startMs: tr.startTimeMs, endMs: tr.endTimeMs }))
        : [],
    )
  }, [tracks, myId])

  // DUB-EDIT: segId→배정 배우 표시명 → dubStore(센터 타임라인 색·이니셜). 트랙↔세그 매칭은
  // start_time_ms(서버 미러와 동일 키). members 로딩 전엔 uid 축약이 잠깐 보였다 실명으로 수렴.
  // segments 를 deps 로(store 비반응 읽기 금지) — tracks 가 세그보다 먼저 와도 재실행돼 수렴.
  useEffect(() => {
    const byStart = new Map(segments.map((s) => [s.start_ms, s.id]))
    const map: Record<number, string> = {}
    for (const tr of tracks) {
      const segId = byStart.get(tr.startTimeMs)
      if (segId !== undefined) {
        map[segId] = members.find((m) => m.userId === tr.participantId)?.displayName ?? tr.participantId.slice(0, 8)
      }
    }
    useDubStore.getState().setSegmentAssignees(map)
  }, [tracks, members, segments])

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

  // F3 DUB-CHANGE-NOTICE: 내 트랙의 시간 이동/확정 해제를 통지 — 상태는 Realtime 이 이미 수렴(E2 실측),
  // "왜 바뀌었지?" 인지 공백만 메운다. id 동일 트랙의 델타만 비교(신규/삭제는 별개 흐름).
  const prevTracksRef = useRef<DubTrack[] | null>(null)
  useEffect(() => {
    const prev = prevTracksRef.current
    prevTracksRef.current = tracks
    if (!prev || !myId) return
    for (const tr of tracks) {
      if (tr.participantId !== myId) continue
      const old = prev.find((p) => p.id === tr.id)
      if (!old) continue
      if (old.startTimeMs !== tr.startTimeMs || old.endTimeMs !== tr.endTimeMs) toast.info(t('dub.myTrackMoved'))
      if (old.status === 'synced' && tr.status === 'submitted') toast.info(t('dub.myTrackUnconfirmed'))
    }
  }, [tracks, myId, t])

  // 수동 새로고침 제거(A-SEAM-3): 세션 생명주기(uploaded→…→completed)·트랙 상태(assigned→synced)를
  // Realtime 으로 구독 → 변경 시 신뢰 소스 재조회. dub_* 는 supabase_realtime publication 에 등록됨.
  useRealtimeRow('dub_sessions', 'room_id', roomId, refresh)
  useRealtimeRow('dub_tracks', 'dub_session_id', session?.id, refresh)

  // DUB-VISIBILITY(2026-07-19 주인님 실사용 "복귀하니 업로드가 사라짐"): 복귀 직후 조회가 재조인보다
  // 빠르면 RLS(is_dub_member: state<>'left')가 세션을 숨겨 빈 업로드 화면이 됨 — 재조인이 행을 되살려도
  // dub_* 는 안 바뀌어 Realtime 재조회가 없다. 연결 확립(CONNECTED = 조인 완료 = 행 활성) 시 재조회로 봉함.
  const connected = useRoomStore((s) => s.connectionState === 'CONNECTED')
  useEffect(() => {
    if (!connected) return
    ;(async () => { await refresh() })()
  }, [connected, refresh])

  async function run(fn: () => Promise<unknown>) {
    if (!token) return
    setBusy(true); setError(null)
    try { await fn(); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : t('dub.actionFailed')) }
    finally { setBusy(false) }
  }

  const status = session?.status ?? null
  // F4 DUB-NEW: [새 영상으로 더빙] — 세션 id 정체성 귀속(새 세션이 오면 자동 복귀·effect 리셋 불필요)
  const [startNewFor, setStartNewFor] = useState<string | null>(null)
  const viewStatus = startNewFor !== null && startNewFor === (session?.id ?? 'none') ? null : status
  const allSynced = tracks.length > 0 && tracks.every((t) => t.status === 'synced')
  // DUB-UX 흐름 명료화: 솔로(멤버 1)면 역할 배정이 자명 · 상단 단계 표시기(①업로드 ②역할 ③동의 ④녹음 ⑤완성).
  const isSolo = members.length <= 1
  const currentStep = !viewStatus ? 1
    : viewStatus === 'uploaded' || viewStatus === 'transcribing' ? 2
    : viewStatus === 'ready' && tracks.length === 0 ? 2
    : viewStatus === 'ready' && !allConsented ? 3
    : viewStatus === 'recording' || viewStatus === 'ready' ? 4
    : viewStatus === 'compositing' || viewStatus === 'completed' ? 5
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

      {/* DUB-UX 단계 표시기: 현재 위치·다음 단계를 항상 보이게. S4: 솔로 ready 는 원버튼 하나라 숨김(3막 체감). */}
      {!(isSolo && viewStatus === 'ready') && (
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
      )}

      {/* R7 뷰어 안내: 관전자는 배정·녹음 참여가 없다 — 탭의 목적(진행 구경)을 1줄로 명시. */}
      {isViewer && status && (
        <p className="mt-2 text-xs text-stage-text-muted">{t('dub.viewerHint')}</p>
      )}

      {error && <p className="mt-3 rounded bg-fire-hot/10 px-3 py-2 text-sm text-fire-hot" role="alert">{error}</p>}

      {/* 세션 없음/새 영상(F4) — 생성 UI 는 DubSessionSelector(계약 분할) */}
      {!viewStatus && (
        isHost && token ? (
          <DubSessionSelector
            token={token}
            roomId={roomId}
            busy={busy}
            phase={phase}
            setPhase={setPhase}
            sourceLanguage={sourceLanguage}
            setSourceLanguage={setSourceLanguage}
            run={run}
          />
        ) : (
          <p className="mt-3 text-sm text-stage-text-muted">{t('dub.hostNotStarted')}</p>
        )
      )}

      {/* 업로드됨 → STT */}
      {viewStatus === 'uploaded' && (
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

      {viewStatus === 'transcribing' && (
        <p className="mt-3 text-sm text-stage-text-muted">{t('dub.waitingForTranscribe')}</p>
      )}

      {viewStatus === 'failed' && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-fire-hot">{t('dub.processingFailed')}</p>
          {isHost && (
            <button
              disabled={busy}
              onClick={() => run(async () => {
                // 실패 세션은 source 를 유지 → STT 재시도(+비-ko 번역). 데드엔드 해소.
                try {
                  setPhase('transcribing')
                  await startTranscription(token!, session!.id)
                  if (sourceLanguage !== 'ko') { setPhase('translating'); await translateDubScript(token!, session!.id).catch(() => {}) }
                  setPhase('separating')
                  await separateDubAudio(token!, session!.id)
                    .then((r) => useDubStore.getState().setBedUrls(r.background_urls))
                    .catch(() => {})
                } finally { setPhase(null) }
              })}
              className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-fire-amber focus-visible:ring-offset-1 disabled:opacity-40"
            >
              {phase === 'transcribing' ? t('dub.pipelineTranscribing')
                : phase === 'translating' ? t('dub.pipelineTranslating')
                : t('dub.retryButton')}
            </button>
          )}
        </div>
      )}

      {/* READY: 대본·역할·동의·솔로 원버튼 — DubRoleAssigner(계약 분할) */}
      {viewStatus === 'ready' && token && (
        <DubRoleAssigner
          token={token}
          sessionId={session!.id}
          segments={segments}
          tracks={tracks}
          members={members}
          myId={myId}
          isHost={isHost}
          isSolo={isSolo}
          isViewer={isViewer}
          allConsented={allConsented}
          myConsent={myConsent}
          busy={busy}
          run={run}
        />
      )}

      {/* RECORDING: 실제 녹음 캡처 (DUB-04) + 전 트랙 synced 시 합성 진입 */}
      {viewStatus === 'recording' && (
        <>
          {/* F5 DUB-STEP-BACK: 역할·대본 단계로 역전이(트랙·기녹음·동의 보존 — 서버가 보장) */}
          {isHost && (
            <button
              disabled={busy}
              onClick={() => run(() => revertDubSession(token!, session!.id))}
              title={t('dub.stepBackHint')}
              className="mb-2 rounded border border-stage-border px-2 py-1 text-xs text-stage-text-muted hover:bg-stage-border/30 disabled:opacity-40"
            >
              ← {t('dub.stepBackButton')}
            </button>
          )}
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
              status={viewStatus}
              isHost={isHost}
              tracks={tracks}
              segments={segments}
              onChanged={refresh}
            />
          )}
        </>
      )}

      {/* F4: 완료/실패 후 새 영상으로 — Selector 재표시(기존 세션·산출물은 보존, 새 세션이 최신 우선) */}
      {isHost && (viewStatus === 'completed' || viewStatus === 'failed') && (
        <button
          onClick={() => setStartNewFor(session?.id ?? 'none')}
          className="mt-3 rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text hover:border-fire-amber/60 hover:bg-stage-border/30"
        >
          🎬 {t('dub.newSessionButton')}
        </button>
      )}
      {viewStatus === null && status !== null && (
        <button
          onClick={() => setStartNewFor(null)}
          className="mt-2 text-xs text-stage-text-muted underline hover:text-stage-text"
        >
          ← {t('dub.newSessionBack')}
        </button>
      )}

      {/* COMPOSITING / COMPLETED: 합성 진행·완성본 (DUB-05) */}
      {(viewStatus === 'compositing' || viewStatus === 'completed') && (
        <DubCompositor
          dubSessionId={session!.id}
          status={viewStatus}
          isHost={isHost}
          tracks={tracks}
          segments={segments}
          onChanged={refresh}
        />
      )}
    </section>
  )
}
