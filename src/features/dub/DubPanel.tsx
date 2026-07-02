import { useCallback, useEffect, useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import {
  uploadDubSource, createDubSession, startTranscription, assignRoles,
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

  const isHost = !!myId && myId === hostId
  const segments = session?.diarization_result_json?.segments ?? []
  const allConsented = session?.consent_json?.all_consented ?? false
  const myConsent = !!(myId && session?.consent_json?.participants[myId]?.consented)

  const refresh = useCallback(async () => {
    if (!token) return
    const [s, m] = await Promise.all([fetchActiveDubSession(roomId), fetchRoomMembers(token, roomId)])
    setSession(s as Session | null)
    setMembers(m)
    if (s && (s.status === 'recording' || s.status === 'ready')) {
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
    catch (e) { setError(e instanceof Error ? e.message : '작업에 실패했어요.') }
    finally { setBusy(false) }
  }

  const memberName = (uid: string) =>
    members.find((m) => m.userId === uid)?.displayName ?? uid.slice(0, 8)

  const status = session?.status ?? null

  return (
    <section className="mt-8 rounded-lg border border-stage-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stage-text-muted">
          더빙 {status && <span className="ml-2 rounded bg-stage-border px-2 py-0.5 text-xs">{status}</span>}
        </h2>
        <button onClick={() => void refresh()} className="text-xs text-stage-text-muted hover:text-stage-text">
          새로고침
        </button>
      </div>

      {error && <p className="mt-3 rounded bg-fire-hot/10 px-3 py-2 text-sm text-fire-hot" role="alert">{error}</p>}

      {/* 세션 없음 */}
      {!status && (
        isHost ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="file" accept="video/mp4,video/webm,audio/mp4,audio/mpeg,audio/wav"
              onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
              aria-label="더빙 소스 파일"
            />
            <button
              disabled={!file || busy}
              onClick={() => run(async () => {
                const path = await uploadDubSource(token!, roomId, file!)
                await createDubSession(token!, roomId, path)
              })}
              className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {busy ? '업로드 중…' : '더빙 시작 (영상 업로드)'}
            </button>
            <span className="text-xs text-stage-text-muted">≤25MB, mp4/webm/음성</span>
          </div>
        ) : (
          <p className="mt-3 text-sm text-stage-text-muted">호스트가 더빙을 시작하면 참여할 수 있어요.</p>
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
            {busy ? '요청 중…' : '대본 추출 (STT)'}
          </button>
        ) : <p className="mt-3 text-sm text-stage-text-muted">호스트가 대본을 추출하는 중이에요.</p>
      )}

      {status === 'transcribing' && (
        <p className="mt-3 text-sm text-stage-text-muted">대본 추출 중… 잠시 후 새로고침 해주세요.</p>
      )}

      {status === 'failed' && (
        <p className="mt-3 text-sm text-fire-hot">더빙 처리에 실패했어요. (다시 시도는 다음 업데이트)</p>
      )}

      {/* READY: 세그먼트 + 역할배정 + 동의 */}
      {status === 'ready' && (
        <div className="mt-3 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-stage-text-muted">대사 ({segments.length})</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {segments.map((seg) => (
                <li key={seg.id} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-xs text-stage-text-muted">
                    {(seg.start_ms / 1000).toFixed(1)}s
                  </span>
                  <span className="flex-1 truncate">{seg.text}</span>
                  {isHost ? (
                    <select
                      value={assignedTo(seg.id)}
                      onChange={(e) => setAssignments((a) => ({ ...a, [seg.id]: e.target.value }))}
                      className="rounded border border-stage-border bg-transparent px-2 py-1 text-xs"
                    >
                      <option value="">배정…</option>
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>{m.displayName ?? m.userId.slice(0, 8)}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-stage-text-muted">
                      {tracks.find((t) => t.startTimeMs === seg.start_ms)
                        ? memberName(tracks.find((t) => t.startTimeMs === seg.start_ms)!.participantId)
                        : '미배정'}
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
                역할 저장
              </button>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-stage-text-muted">
              동의 {allConsented ? '(전원 완료)' : '(대기 중)'}
            </h3>
            <button
              disabled={busy || myConsent}
              onClick={() => run(() => recordConsent(token!, session!.id, true))}
              className="mt-2 rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {myConsent ? '동의함 ✓' : '더빙에 동의'}
            </button>
          </div>

          {isHost && (
            <button
              disabled={busy || !allConsented || tracks.length === 0}
              onClick={() => run(() => startRecording(token!, session!.id))}
              className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              녹음 시작
            </button>
          )}
        </div>
      )}

      {/* RECORDING: 다음 슬라이스에서 실제 캡처 */}
      {status === 'recording' && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-stage-text">녹음 단계에 진입했어요. (실제 녹음 캡처는 다음 업데이트)</p>
          <ul className="space-y-1 text-sm">
            {tracks.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="flex-1 truncate">{t.speakerName} · {t.transcriptText}</span>
                <span className="text-xs text-stage-text-muted">{memberName(t.participantId)} · {t.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
