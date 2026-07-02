import { useCallback, useEffect, useRef, useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import {
  getDubSourceUrl, uploadDubRecording, submitDubTrack, confirmDubTrack,
  type DubTrack, type RoomMember,
} from '@/lib/dub'

// Phase 3B 슬라이스 2: 더빙 녹음(DUB-04) 최소 UI.
// 계약(DubRecorder.md) 준수: 원본 음소거 재생·본인 트랙만·미리보기 필수 저장·assigned→submitted→synced.
// ponytail defer: 청크/resume·IndexedDB 백업(ROOM-23)·calibration 슬라이더·Realtime·전체 재촬영·비프/자동차례.

const MIME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
function pickMime(): string {
  for (const m of MIME) if (MediaRecorder.isTypeSupported(m)) return m
  return 'audio/webm'
}

interface Props {
  dubSessionId: string
  myId: string | null
  isHost: boolean
  tracks: DubTrack[]
  members: RoomMember[]
  onChanged: () => void | Promise<void>
}

const STATUS_MARK: Record<DubTrack['status'], string> = {
  assigned: '대기', recording: '녹음중', submitted: '제출됨', synced: '완료 ✓',
}

export default function DubRecorder({ dubSessionId, myId, isHost, tracks, members, onChanged }: Props) {
  const token = useUserStore((s) => s.session?.access_token)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [recordingTrackId, setRecordingTrackId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ trackId: string; url: string; blob: Blob; durationMs: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)

  const memberName = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? uid.slice(0, 8)
  const isRecording = recordingTrackId !== null

  // 소스 재생 URL (원본 음소거 재생용)
  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const url = await getDubSourceUrl(token, dubSessionId)
        if (!cancelled) setSourceUrl(url)
      } catch { /* 재생 없이도 진행 가능 */ }
    })()
    return () => { cancelled = true }
  }, [token, dubSessionId])

  // 언마운트 시 스트림 정리
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (preview) URL.revokeObjectURL(preview.url)
  }, [preview])

  const startRec = useCallback(async (trackId: string) => {
    if (isRecording) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      })
      streamRef.current = stream
      const rec = new MediaRecorder(stream, { mimeType: pickMime() })
      chunksRef.current = []
      rec.addEventListener('dataavailable', (e) => { if (e.data.size) chunksRef.current.push(e.data) })
      rec.addEventListener('stop', () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const durationMs = Math.round(performance.now() - startedAtRef.current)
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        setPreview({ trackId, url: URL.createObjectURL(blob), blob, durationMs })
        setRecordingTrackId(null)
      })
      startedAtRef.current = performance.now()
      recorderRef.current = rec
      setRecordingTrackId(trackId)
      rec.start()
    } catch (e) {
      setError(e instanceof Error ? e.message : '마이크 접근 실패')
    }
  }, [isRecording])

  const stopRec = useCallback(() => { recorderRef.current?.stop() }, [])

  const submit = useCallback(async () => {
    if (!token || !preview) return
    setBusy(true); setError(null)
    try {
      const path = await uploadDubRecording(token, preview.trackId, preview.blob)
      await submitDubTrack(token, preview.trackId, path, preview.durationMs)
      URL.revokeObjectURL(preview.url)
      setPreview(null)
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : '제출 실패')
    } finally { setBusy(false) }
  }, [token, preview, onChanged])

  const confirm = useCallback(async (trackId: string) => {
    if (!token) return
    setBusy(true); setError(null)
    try { await confirmDubTrack(token, trackId); await onChanged() }
    catch (e) { setError(e instanceof Error ? e.message : '확인 실패') }
    finally { setBusy(false) }
  }, [token, onChanged])

  const syncedCount = tracks.filter((t) => t.status === 'synced').length
  const allSynced = tracks.length > 0 && syncedCount === tracks.length

  return (
    <div className="mt-3 space-y-4">
      {error && <p className="rounded bg-fire-hot/10 px-3 py-2 text-sm text-fire-hot" role="alert">{error}</p>}

      {/* 원본 재생 (녹음 중엔 음소거 — 마이크 유입 방지, 헤드폰 권장) */}
      {sourceUrl && (
        <div>
          <h3 className="text-xs font-semibold text-stage-text-muted">원본 (타이밍 참고)</h3>
          <audio src={sourceUrl} controls muted={isRecording} className="mt-1 w-full">
            <track kind="captions" />
          </audio>
          {isRecording && <p className="text-xs text-stage-text-muted">녹음 중엔 원음이 마이크에 섞이지 않도록 음소거돼요(헤드폰 권장).</p>}
        </div>
      )}

      {/* 트랙 목록 + 내 트랙 녹음 */}
      <ul className="space-y-2">
        {tracks.map((t) => {
          const mine = t.participantId === myId
          const previewing = preview?.trackId === t.id
          return (
            <li key={t.id} className="rounded-lg border border-stage-border px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-xs text-stage-text-muted">
                  {(t.startTimeMs / 1000).toFixed(1)}s
                </span>
                <span className="flex-1 truncate">{t.speakerName} · {t.transcriptText}</span>
                <span className="shrink-0 text-xs text-stage-text-muted">
                  {memberName(t.participantId)} · {STATUS_MARK[t.status]}
                </span>
              </div>

              {mine && t.status !== 'synced' && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {recordingTrackId === t.id ? (
                    <button onClick={stopRec}
                      className="rounded-lg bg-fire-hot px-3 py-1.5 text-xs font-semibold text-stage-base">
                      ■ 중지
                    </button>
                  ) : (
                    <button onClick={() => startRec(t.id)} disabled={isRecording || busy}
                      className="rounded-lg bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40">
                      ● 녹음
                    </button>
                  )}
                  {previewing && (
                    <>
                      <audio src={preview.url} controls className="h-8">
                        <track kind="captions" />
                      </audio>
                      <button onClick={submit} disabled={busy}
                        className="rounded-lg bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40">
                        {busy ? '제출 중…' : '제출'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {isHost && t.status === 'submitted' && (
                <button onClick={() => confirm(t.id)} disabled={busy}
                  className="mt-2 rounded-lg border border-stage-border px-3 py-1.5 text-xs hover:bg-stage-border/30 disabled:opacity-40">
                  확인(synced)
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {/* 하단: 진행도 (전 트랙 synced 시 DubPanel 이 DubCompositor 마운트) */}
      <div className="flex items-center justify-between border-t border-stage-border pt-3">
        <span className="text-xs text-stage-text-muted">{syncedCount}/{tracks.length} 완료</span>
        {allSynced && <span className="text-xs text-fire-amber">전원 녹음 완료 — 아래에서 합성</span>}
      </div>
    </div>
  )
}
