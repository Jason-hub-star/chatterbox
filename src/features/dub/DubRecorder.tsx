import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { useDubStore } from '@/stores/dubStore'
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

// G9-P1: 녹음 중 마이크 입력 실시간 레벨미터 — "녹음이 되고 있는지" 즉시 체감.
// AnalyserNode 는 destination 에 연결하지 않는다(모니터 아웃 = 하울링, GOAL-dub-recording-tangible §3).
const SILENT_AFTER_MS = 2500
const SILENT_PEAK = 0.02

function MicLevelMeter({ stream }: { stream: MediaStream }) {
  const { t } = useTranslation()
  const [level, setLevel] = useState(0)
  const [silent, setSilent] = useState(false)

  useEffect(() => {
    const ctx = new AudioContext()
    void ctx.resume() // autoplay 정책 suspended 방지(DUB-RETAKE 하드닝 — suspended 미터=0 오탐)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    const buf = new Uint8Array(analyser.frequencyBinCount) // 1회 생성·재사용
    const src = ctx.createMediaStreamSource(stream)
    src.connect(analyser)
    let startedAt = performance.now()
    let peak = 0
    let display = 0
    let raf = requestAnimationFrame(function tick() {
      raf = requestAnimationFrame(tick)
      if (ctx.state !== 'running') startedAt = performance.now() // 측정 불가 구간은 무음 판정에 미산입
      analyser.getByteTimeDomainData(buf)
      let max = 0
      for (const v of buf) { const d = Math.abs(v - 128); if (d > max) max = d }
      const lvl = max / 128 // 128=무음 기준, 편차=입력 세기
      peak = Math.max(peak, lvl)
      display = Math.max(lvl, display * 0.85) // 시각 감쇠
      setLevel(display)
      setSilent(performance.now() - startedAt > SILENT_AFTER_MS && peak < SILENT_PEAK)
    })
    return () => {
      cancelAnimationFrame(raf)
      src.disconnect()
      void ctx.close()
    }
  }, [stream])

  return (
    <div className="flex min-w-28 flex-1 items-center gap-2">
      <div
        role="meter" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(level * 100))}
        aria-label={t('dub.micLevelLabel')}
        className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-stage-border"
      >
        <div
          className={`h-full rounded-full ${silent ? 'bg-fire-hot' : 'bg-fire-amber'}`}
          style={{ width: `${Math.min(100, Math.round(level * 100))}%` }}
        />
      </div>
      {silent && <span className="shrink-0 text-xs text-fire-hot" role="status">{t('dub.micSilentHint')}</span>}
    </div>
  )
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
  const [micStream, setMicStream] = useState<MediaStream | null>(null)
  const [calMs, setCalMs] = useState(0) // G9-P4 ±200ms 캘리브레이션(테이크마다 0 리셋)

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

  // 언마운트 시 로컬모드 해제 — 센터를 잔존 record/preview 상태로 두지 않는다(G9-P2)
  useEffect(() => () => { useDubStore.getState().setLocalMode(null) }, [])

  const startRec = useCallback(async (track: DubTrack) => {
    if (isRecording) return
    setError(null)
    setCalMs(0)
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
        setMicStream(null)
        const url = URL.createObjectURL(blob)
        setPreview({ trackId: track.id, url, blob, durationMs })
        setRecordingTrackId(null)
        // G9-P2: 정지 즉시 센터에서 방금 녹음 자동 미리보기(녹음이 구간보다 길면 그만큼 연장)
        useDubStore.getState().setLocalMode({
          kind: 'preview',
          startMs: track.startTimeMs,
          endMs: Math.max(track.endTimeMs, track.startTimeMs + durationMs),
          audioUrl: url,
        })
      })
      startedAtRef.current = performance.now()
      recorderRef.current = rec
      setRecordingTrackId(track.id)
      setMicStream(stream)
      rec.start()
      // G9-P2: 녹음 시작 → 센터 영상이 이 구간을 음소거 재생(내 화면만 — MainView 가 vodSync 일시 해제).
      // ponytail: 시크 완료와 녹음 시작 사이 수백 ms 오차 가능 — P4 캘리브레이션(±200ms)이 보정 경로.
      if (useDubStore.getState().screening) useDubStore.getState().setScreening(false) // 시사회 오디오와 겹침 방지(호스트면 전원 종료 broadcast)
      useDubStore.getState().setLocalMode({
        kind: 'record', startMs: track.startTimeMs, endMs: track.endTimeMs, audioUrl: null,
      })
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
      await submitDubTrack(token, preview.trackId, path, preview.durationMs, calMs)
      useDubStore.getState().setLocalMode(null) // 제출 → 로컬모드 해제(동기 복귀), objectURL 소멸 전에
      URL.revokeObjectURL(preview.url)
      setPreview(null)
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dub.submitError'))
    } finally { setBusy(false) }
  }, [token, preview, calMs, onChanged, t])

  // G9-P4: 보정 슬라이더 반영해 센터 미리보기 재재생(오디오를 calMs 만큼 이동)
  const replayPreview = useCallback(() => {
    if (!preview) return
    const track = tracks.find((tr) => tr.id === preview.trackId)
    if (!track) return
    useDubStore.getState().setLocalMode({
      kind: 'preview',
      startMs: track.startTimeMs,
      endMs: Math.max(track.endTimeMs, track.startTimeMs + preview.durationMs + Math.max(0, calMs)),
      audioUrl: preview.url,
      calMs,
    })
  }, [preview, tracks, calMs])

  const confirm = useCallback(async (trackId: string, undo = false) => {
    if (!token) return
    setBusy(true); setError(null)
    try { await confirmDubTrack(token, trackId, undo); await onChanged() }
    catch (e) { setError(e instanceof Error ? e.message : t(undo ? 'dub.unconfirmError' : 'dub.confirmError')) }
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
                    <>
                      <button onClick={stopRec}
                        className="rounded-lg bg-fire-hot px-3 py-1.5 text-xs font-semibold text-stage-base">
                        {t('dub.stopButton')}
                      </button>
                      {micStream && <MicLevelMeter stream={micStream} />}
                    </>
                  ) : (
                    <button onClick={() => startRec(track)} disabled={isRecording || busy}
                      className="rounded-lg bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40">
                      {t('dub.recordButton')}
                    </button>
                  )}
                  {previewing && (
                    <>
                      <audio src={preview.url} controls className="h-8">
                        <track kind="captions" />
                      </audio>
                      {/* G9-P4 캘리브레이션 — 미리보기로 맞추고 제출하면 합성에도 동일 적용 */}
                      <label className="flex items-center gap-1 text-xs text-stage-text-muted">
                        {t('dub.calibrationLabel')}
                        <input
                          type="range" min={-200} max={200} step={10} value={calMs}
                          onChange={(e) => setCalMs(Number(e.target.value))}
                          className="w-24 accent-fire-amber"
                        />
                        <span className="w-14 text-right tabular-nums">{calMs > 0 ? `+${calMs}` : calMs}ms</span>
                      </label>
                      <button onClick={replayPreview} disabled={busy}
                        className="rounded-lg border border-stage-border px-3 py-1.5 text-xs hover:bg-stage-border/30 disabled:opacity-40">
                        {t('dub.replayPreview')}
                      </button>
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
              {/* DUB-RETAKE: 확정 해제 → submitted 복귀 → 배우 [● 녹음] 재활성(Realtime 이 전파) */}
              {isHost && track.status === 'synced' && (
                <button onClick={() => confirm(track.id, true)} disabled={busy}
                  className="mt-2 rounded-lg border border-stage-border px-3 py-1.5 text-xs text-stage-text-muted hover:bg-stage-border/30 disabled:opacity-40">
                  {t('dub.unconfirmButton')}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {/* 하단: 진행도 (전 트랙 synced 시 DubPanel 이 DubCompositor 마운트) */}
      <div className="flex items-center justify-between border-t border-stage-border pt-3" role="status" aria-live="polite">
        <span className="text-xs text-stage-text-muted">{t('dub.progressDisplay', { count: syncedCount, total: tracks.length })}</span>
        {allSynced && <span className="text-xs text-fire-amber">{t('dub.recordingComplete')}</span>}
      </div>
    </div>
  )
}
