import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { setRoomMode } from '@/lib/rooms'
import { useRealtimeRow } from '@/hooks/useRealtimeRow'
import DubRecorder from '@/features/dub/DubRecorder'
import DubCompositor from '@/features/dub/DubCompositor'
import {
  uploadDubSource, createDubSession, startTranscription, translateDubScript, assignRoles,
  recordConsent, startRecording, fetchRoomMembers, fetchActiveDubSession,
  fetchMyUserId, fetchRoomHostId, fetchDubTracks,
  type DubSegment, type DubTrack, type RoomMember,
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

export default function DubPanel({ roomId }: { roomId: string }) {
  const { t } = useTranslation()
  const token = useUserStore((s) => s.session?.access_token)
  const [myId, setMyId] = useState<string | null>(null)
  const [hostId, setHostId] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [members, setMembers] = useState<RoomMember[]>([])
  const [tracks, setTracks] = useState<DubTrack[]>([])
  const [assignments, setAssignments] = useState<Record<number, string>>({})
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)

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
  }, [token, roomId])

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

      {error && <p className="mt-3 rounded bg-fire-hot/10 px-3 py-2 text-sm text-fire-hot" role="alert">{error}</p>}

      {/* 세션 없음 */}
      {!status && (
        isHost ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="file" accept="video/mp4,video/webm,audio/mp4,audio/mpeg,audio/wav"
              onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
              aria-label={t('dub.sourceFileLabel')}
            />
            <button
              disabled={!file || busy}
              onClick={() => run(async () => {
                const path = await uploadDubSource(token!, roomId, file!)
                await createDubSession(token!, roomId, path)
                // G-261: 더빙 세션 개시 = 방 모드 'dub'(서버 broadcast → 전원 탭 전환+배너). best-effort.
                void setRoomMode(token!, roomId, 'dub').catch(() => {})
              })}
              className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {busy ? t('dub.uploadLoading') : t('dub.uploadButton')}
            </button>
            <span className="text-xs text-stage-text-muted">{t('dub.fileNote')}</span>
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
              {segments.map((seg) => (
                <li key={seg.id} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-xs text-stage-text-muted">
                    {(seg.start_ms / 1000).toFixed(1)}s
                  </span>
                  <span className="flex-1 truncate">{showTranslation && seg.translated_text ? seg.translated_text : seg.text}</span>
                  {isHost ? (
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
                  ) : (
                    <span className="text-xs text-stage-text-muted">
                      {tracks.find((t) => t.startTimeMs === seg.start_ms)
                        ? memberName(tracks.find((t) => t.startTimeMs === seg.start_ms)!.participantId)
                        : t('dub.roleUnassigned')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {isHost && (
              <button
                disabled={busy || segments.some((s) => !assignedTo(s.id))}
                onClick={() => run(() => assignRoles(token!, session!.id,
                  segments.map((s) => ({ segment_id: s.id, participant_id: assignedTo(s.id) }))))}
                className="mt-2 rounded-lg border border-stage-border px-3 py-1.5 text-xs hover:bg-stage-border/30 disabled:opacity-40"
              >
                {t('dub.roleSaveButton')}
              </button>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-stage-text-muted">
              {t('dub.consentLabel')} {allConsented ? t('dub.consentDone') : t('dub.consentWaiting')}
            </h3>
            <button
              disabled={busy || myConsent}
              onClick={() => run(() => recordConsent(token!, session!.id, true))}
              className="mt-2 rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {myConsent ? t('dub.consentYes') : t('dub.consentButton')}
            </button>
          </div>

          {isHost && (
            <button
              disabled={busy || !allConsented || tracks.length === 0}
              onClick={() => run(() => startRecording(token!, session!.id))}
              className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {t('dub.recordingStart')}
            </button>
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
          onChanged={refresh}
        />
      )}
    </section>
  )
}
