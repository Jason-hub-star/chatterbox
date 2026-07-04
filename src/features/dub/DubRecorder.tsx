import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

export default function DubRecorder({ dubSessionId, myId, isHost, tracks, members, onChanged }: Props) {
  const { t } = useTranslation()
  const token = useUserStore((s) => s.session?.access_token)

  const getStatusMark = (status: DubTrack['status']): string => {
    const marks: Record<DubTrack['status'], string> = {
      assigned: t('dub.statusAssigned'),
      recording: t('dub.statusRecording'),
      submitted: t('dub.statusSubmitted'),
      synced: t('dub.statusSynced'),
    }
    return marks[status]
  }
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [recordingTrackId, setRecordingTrackId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ trackId: string; url: string; blob: Blob; durationMs: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)

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
      setError(e instanceof Error ? e.message : t('dub.micAccessError'))
    }
  }, [isRecording, t])

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
      setError(e instanceof Error ? e.message : t('dub.submitError'))
    } finally { setBusy(false) }
  }, [token, preview, onChanged, t])

  const confirm = useCallback(async (trackId: string) => {
    if (!token) return
    setBusy(true); setError(null)
    try { await confirmDubTrack(token, trackId); await onChanged() }
    catch (e) { setError(e instanceof Error ? e.message : t('dub.confirmError')) }
    finally { setBusy(false) }
  }, [token, onChanged, t])

  const syncedCount = tracks.filter((t) => t.status === 'synced').length
  const allSynced = tracks.length > 0 && syncedCount === tracks.length

  return (
    <div className="mt-3 space-y-4">
      {error && <p className="rounded bg-fire-hot/10 px-3 py-2 text-sm text-fire-hot" role="alert">{error}</p>}

      {/* 원본 재생 (녹음 중엔 음소거 — 마이크 유입 방지, 헤드폰 권장) */}
      {sourceUrl && (
        <div>
          <h3 className="text-xs font-semibold text-stage-text-muted">{t('dub.sourceLabel')}</h3>
          <audio src={sourceUrl} controls muted={isRecording} className="mt-1 w-full">
            <track kind="captions" />
          </audio>
          {isRecording && <p className="text-xs text-stage-text-muted">{t('dub.mutedInfo')}</p>}
        </div>
      )}

      {/* 트랙 목록 + 내 트랙 녹음 */}
      {tracks.some((track) => track.translatedText) && (
        <button
          onClick={() => setShowTranslation((v) => !v)}
          className="rounded border border-stage-border px-2 py-0.5 text-xs text-stage-text-muted hover:text-stage-text"
        >
          {showTranslation ? t('dub.showOriginal') : t('dub.showTranslation')}
        </button>
      )}
      <ul className="space-y-2">
        {tracks.map((track) => {
          const mine = track.participantId === myId
          const previewing = preview?.trackId === track.id
          return (
            <li key={track.id} className="rounded-lg border border-stage-border px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-xs text-stage-text-muted">
                  {(track.startTimeMs / 1000).toFixed(1)}s
                </span>
                <span className="flex-1 truncate">{track.speakerName} · {showTranslation && track.translatedText ? track.translatedText : track.transcriptText}</span>
                <span className="shrink-0 text-xs text-stage-text-muted">
                  {memberName(track.participantId)} · {getStatusMark(track.status)}
                </span>
              </div>

              {mine && track.status !== 'synced' && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {recordingTrackId === track.id ? (
                    <button onClick={stopRec}
                      className="rounded-lg bg-fire-hot px-3 py-1.5 text-xs font-semibold text-stage-base">
                      {t('dub.stopButton')}
                    </button>
                  ) : (
                    <button onClick={() => startRec(track.id)} disabled={isRecording || busy}
                      className="rounded-lg bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40">
                      {t('dub.recordButton')}
                    </button>
                  )}
                  {previewing && (
                    <>
                      <audio src={preview.url} controls className="h-8">
                        <track kind="captions" />
                      </audio>
                      <button onClick={submit} disabled={busy}
                        className="rounded-lg bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40">
                        {busy ? t('dub.submitLoading') : t('dub.submitButton')}
                      </button>
                    </>
                  )}
                </div>
              )}

              {isHost && track.status === 'submitted' && (
                <button onClick={() => confirm(track.id)} disabled={busy}
                  className="mt-2 rounded-lg border border-stage-border px-3 py-1.5 text-xs hover:bg-stage-border/30 disabled:opacity-40">
                  {t('dub.confirmButton')}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {/* 하단: 진행도 (전 트랙 synced 시 DubPanel 이 DubCompositor 마운트) */}
      <div className="flex items-center justify-between border-t border-stage-border pt-3">
        <span className="text-xs text-stage-text-muted">{t('dub.progressDisplay', { count: syncedCount, total: tracks.length })}</span>
        {allSynced && <span className="text-xs text-fire-amber">{t('dub.recordingComplete')}</span>}
      </div>
    </div>
  )
}
