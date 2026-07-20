import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { useDubStore } from '@/stores/dubStore'
import {
  uploadDubRecording, submitDubTrack, confirmDubTrack,
  type DubTrack, type RoomMember,
} from '@/lib/dub'
import { toast } from '@/hooks/useToast'

// Phase 3B 슬라이스 2: 더빙 녹음(DUB-04) 최소 UI.
// 계약(DubRecorder.md) 준수: 원본 음소거 재생·본인 트랙만·미리보기 필수 저장·assigned→submitted→synced.
// ponytail defer: 청크/resume·IndexedDB 백업(ROOM-23)·Realtime·전체 재촬영·비프/자동차례.
// U1 PANEL-UNIFY-V2: 캡처 엔진 헤드리스 — 렌더 상태(recTrackId·recPreview 등)는 dubStore, 액션은
//   recEngine 레지스트리로 등록(blob 만 엔진 ref). 좌패널·센터 HUD 가 패널 무소속으로 조작한다.
//   우패널 탭은 hidden 유지(RightPanel "MUST NOT 언마운트")라 이 컴포넌트가 recording 동안 상시 마운트.

const MIME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
function pickMime(): string {
  for (const m of MIME) if (MediaRecorder.isTypeSupported(m)) return m
  return 'audio/webm'
}

// G9-P1: 녹음 중 마이크 입력 실시간 레벨미터 — "녹음이 되고 있는지" 즉시 체감.
// AnalyserNode 는 destination 에 연결하지 않는다(모니터 아웃 = 하울링, GOAL-dub-recording-tangible §3).
const SILENT_AFTER_MS = 2500
const SILENT_PEAK = 0.02

export function MicLevelMeter({ stream }: { stream: MediaStream }) {
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

// U3: 방금 녹음 테이크의 미니 파형 — 무음/클리핑을 눈으로 확인(프리뷰 HUD 재료).
// objectURL fetch→decodeAudioData→피크 다운샘플→canvas. 실패는 비치명(파형 없이 진행).
export function TakeWaveform({ url }: { url: string }) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const buf = await fetch(url).then((r) => r.arrayBuffer())
        const actx = new AudioContext()
        const audio = await actx.decodeAudioData(buf).finally(() => void actx.close())
        const canvas = canvasRef.current
        if (cancelled || !canvas) return
        const g = canvas.getContext('2d')
        if (!g) return
        const { width, height } = canvas
        g.clearRect(0, 0, width, height)
        g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-fire-amber').trim() || '#ff8c2a'
        const data = audio.getChannelData(0)
        const step = Math.max(1, Math.floor(data.length / width))
        for (let x = 0; x < width; x++) {
          let peak = 0
          const off = x * step
          for (let i = 0; i < step; i += 16) { const v = Math.abs(data[off + i] ?? 0); if (v > peak) peak = v }
          const h = Math.max(1, peak * height)
          g.fillRect(x, (height - h) / 2, 1, h)
        }
      } catch { /* 파형 실패 비치명 */ }
    })()
    return () => { cancelled = true }
  }, [url])
  return (
    <canvas
      ref={canvasRef} width={192} height={28} data-dub-waveform
      role="img" aria-label={t('dub.waveformLabel')}
      className="h-7 w-48 rounded bg-black/40"
    />
  )
}

interface Props {
  myId: string | null
  isHost: boolean
  tracks: DubTrack[]
  members: RoomMember[]
  onChanged: () => void | Promise<void>
}

export default function DubRecorder({ myId, isHost, tracks, members, onChanged }: Props) {
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
  // U1: 렌더 상태는 dubStore(좌패널·센터 HUD 공유), blob 만 엔진 내부 ref
  // U4: 세그별 조작 행·원본 오디오 플레이어·번역 토글 제거 — 재생/녹음/프리뷰는 센터가 정본,
  //     이 컴포넌트는 캡처 엔진 + 얇은 레일(확정 대기 목록·진행)만 남는다.
  const recordingTrackId = useDubStore((s) => s.recTrackId)
  const preview = useDubStore((s) => s.recPreview)
  const busy = useDubStore((s) => s.recBusy)
  const error = useDubStore((s) => s.recError)
  const calMs = useDubStore((s) => s.recCalMs)
  const setRec = useDubStore((s) => s.setRec)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const previewBlobRef = useRef<Blob | null>(null)

  const memberName = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? uid.slice(0, 8)
  const isRecording = recordingTrackId !== null

  // 언마운트 시 스트림 정리
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (preview) URL.revokeObjectURL(preview.url)
  }, [preview])

  // 언마운트 시 로컬모드 해제 — 센터를 잔존 record/preview 상태로 두지 않는다(G9-P2)
  // U1: store 로 승격된 rec 상태도 함께 리셋(세션 전환 후 stale 미리보기/녹음중 표기 방지)
  useEffect(() => () => {
    useDubStore.getState().setLocalMode(null)
    previewBlobRef.current = null
    useDubStore.getState().setRec({ recTrackId: null, recPreview: null, recBusy: false, recCalMs: 0, recMicStream: null, recError: null })
  }, [])

  const startRec = useCallback(async (track: DubTrack) => {
    if (isRecording) return
    setRec({ recError: null, recCalMs: 0 })
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
        const url = URL.createObjectURL(blob)
        previewBlobRef.current = blob
        setRec({ recPreview: { trackId: track.id, url, durationMs }, recTrackId: null, recMicStream: null })
        // G9-P2: 정지 즉시 센터에서 방금 녹음 자동 미리보기(녹음이 구간보다 길면 그만큼 연장)
        useDubStore.getState().setLocalMode({
          kind: 'preview',
          startMs: track.startTimeMs,
          endMs: Math.max(track.endTimeMs, track.startTimeMs + durationMs),
          audioUrl: url,
        })
      })
      if (useDubStore.getState().screening) useDubStore.getState().setScreening(false) // 시사회 오디오와 겹침 방지(호스트면 전원 종료 broadcast)
      // W3 프리롤: 마이크는 이미 획득 → 구간 시작 프레임 정지(preroll) + 3‑2‑1 카운트다운 후 재생+녹음.
      //   즉시 달려나가 "영상이 먼저 흐르는" 통제권 부재 해소. 레벨미터는 카운트다운 중에도(스트림 세팅).
      setRec({ recMicStream: stream })
      useDubStore.getState().setLocalMode({
        kind: 'record', startMs: track.startTimeMs, endMs: track.endTimeMs, audioUrl: null, preroll: true,
      })
      for (let n = 3; n >= 1; n--) { setRec({ recCountdown: n }); await new Promise((r) => setTimeout(r, 450)) }
      setRec({ recCountdown: null })
      if (streamRef.current !== stream) return // 카운트다운 중 취소/전환(스트림 교체) 시 이 테이크 폐기
      // 실제 녹음 시작 → 센터 영상이 이 구간을 음소거 재생(내 화면만 — MainView 가 vodSync 일시 해제).
      // ponytail: 시크 완료와 녹음 시작 사이 수백 ms 오차 가능 — P4 캘리브레이션(±200ms)이 보정 경로.
      startedAtRef.current = performance.now()
      recorderRef.current = rec
      setRec({ recTrackId: track.id })
      rec.start()
      useDubStore.getState().setLocalMode({
        kind: 'record', startMs: track.startTimeMs, endMs: track.endTimeMs, audioUrl: null,
      })
    } catch (e) {
      setRec({ recError: e instanceof Error ? e.message : t('dub.micAccessError'), recCountdown: null })
    }
  }, [isRecording, setRec, t])

  const stopRec = useCallback(() => { recorderRef.current?.stop() }, [])

  const submit = useCallback(async () => {
    const blob = previewBlobRef.current
    if (!token || !preview || !blob) return
    const submittedId = preview.trackId
    const submittedTrack = tracks.find((tr) => tr.id === submittedId)
    setRec({ recBusy: true, recError: null })
    try {
      const path = await uploadDubRecording(token, submittedId, blob)
      await submitDubTrack(token, submittedId, path, preview.durationMs, calMs)
      useDubStore.getState().setLocalMode(null) // 제출 → 로컬모드 해제(동기 복귀), objectURL 소멸 전에
      URL.revokeObjectURL(preview.url)
      previewBlobRef.current = null
      setRec({ recPreview: null })
      // W2 솔로 자동확정: 모든 트랙이 내 것(솔로 더빙)이면 제출=확정 자동(확정 단계 생략·완료 카운트 즉시↑). 실패는 비치명(수동 확정 가능).
      const solo = isHost && tracks.length > 0 && tracks.every((tr) => tr.participantId === myId)
      if (solo) { try { await confirmDubTrack(token, submittedId) } catch { /* 수동 확정 폴백 */ } }
      toast.success(t('dub.submitSuccess')) // 감사 픽스: "제출됐나?" 무피드백 해소
      // W2 자동 다음 이동: 다음 미제출 내 차례 세그로 센터 시크(다음 🎙 준비 — 49세그 스크롤 탐색 제거)
      if (submittedTrack) {
        const remaining = tracks
          .filter((tr) => tr.participantId === myId && tr.id !== submittedId && (tr.status === 'assigned' || tr.status === 'recording'))
          .sort((a, b) => a.startTimeMs - b.startTimeMs)
        const next = remaining.find((tr) => tr.startTimeMs > submittedTrack.startTimeMs) ?? remaining[0]
        if (next) useDubStore.getState().setSeekRequest({ ms: next.startTimeMs, nonce: Date.now() })
      }
      await onChanged()
    } catch (e) {
      setRec({ recError: e instanceof Error ? e.message : t('dub.submitError') })
    } finally { setRec({ recBusy: false }) }
  }, [token, preview, calMs, setRec, onChanged, t, tracks, myId, isHost])

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
    setRec({ recBusy: true, recError: null })
    try { await confirmDubTrack(token, trackId, undo); await onChanged() }
    catch (e) { setRec({ recError: e instanceof Error ? e.message : t(undo ? 'dub.unconfirmError' : 'dub.confirmError') }) }
    finally { setRec({ recBusy: false }) }
  }, [token, setRec, onChanged, t])

  // W2 호스트 일괄 확정: submitted 트랙 전부 confirmDubTrack 순차(기존 Edge·새 Edge 0). 하나씩 확정 클릭 제거.
  const confirmAll = useCallback(async () => {
    if (!token) return
    const pending = tracks.filter((tr) => tr.status === 'submitted')
    if (pending.length === 0) return
    setRec({ recBusy: true, recError: null })
    try { for (const tr of pending) await confirmDubTrack(token, tr.id); await onChanged() }
    catch (e) { setRec({ recError: e instanceof Error ? e.message : t('dub.confirmError') }) }
    finally { setRec({ recBusy: false }) }
  }, [token, tracks, setRec, onChanged, t])

  // W2 키보드: 녹음 중 Space=중지 · 미리보기 중 Space/Enter=제출(반복 마우스 왕복 제거). 입력 포커스 시 무시.
  //   Space-시작은 대상 세그 모호(playhead 미보유)라 defer — 시작은 좌패널 🎙/센터 배너 유지.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.code === 'Space' && isRecording) { e.preventDefault(); stopRec() }
      else if ((e.code === 'Space' || e.key === 'Enter') && preview && !busy) { e.preventDefault(); void submit() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isRecording, preview, busy, stopRec, submit])

  // U1: 엔진 레지스트리 — 좌패널·센터 HUD 가 패널 무소속으로 호출(F8 recordRequest nonce 브리지 대체).
  // start 가드는 F8 소비 effect 와 동형: 내 트랙만·녹음/busy 중 무시.
  const startById = useCallback((trackId: string) => {
    const track = tracks.find((tr) => tr.id === trackId)
    if (!track || track.participantId !== myId || isRecording || busy) return
    void startRec(track)
  }, [tracks, myId, isRecording, busy, startRec])
  useEffect(() => {
    useDubStore.getState().setRecEngine({ start: startById, stop: stopRec, replay: replayPreview, submit })
    return () => { useDubStore.getState().setRecEngine(null) }
  }, [startById, stopRec, replayPreview, submit])

  const syncedCount = tracks.filter((t) => t.status === 'synced').length
  const allSynced = tracks.length > 0 && syncedCount === tracks.length

  const myPending = tracks.some((tr) => tr.participantId === myId && (tr.status === 'assigned' || tr.status === 'recording'))
  const railTracks = tracks.filter((tr) => tr.status === 'submitted' || tr.status === 'synced')
  // 대사 번호(친화 폴백) — 시작시각 순서. speaker_name 은 "Segment N"(영어 합성 라벨)이라 직노출 금지.
  const lineNoById = new Map([...tracks].sort((a, b) => a.startTimeMs - b.startTimeMs).map((tr, i) => [tr.id, i + 1]))
  const lineText = (track: DubTrack) => track.translatedText || track.transcriptText || t('dub.lineLabel', { n: lineNoById.get(track.id) ?? 0 })

  return (
    <div className="mt-3 space-y-3">
      {error && <p className="rounded bg-fire-hot/10 px-3 py-2 text-sm text-fire-hot" role="alert">{error}</p>}

      {/* U4 레일: 세그별 조작 행 제거(녹음·프리뷰·제출은 좌패널 🎙+센터 HUD 가 정본) — 조작 소재 안내 1줄 */}
      {myPending && (
        <p className="text-[11px] text-stage-text-muted" role="note">{t('dub.railRecordHint')}</p>
      )}

      {/* W2 호스트 일괄 확정 — 제출 대기 2건 이상일 때만(하나면 개별 버튼으로 충분) */}
      {isHost && tracks.filter((tr) => tr.status === 'submitted').length > 1 && (
        <button onClick={confirmAll} disabled={busy} data-dub-confirm-all
          className="rounded-lg bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40">
          {t('dub.confirmAll', { count: tracks.filter((tr) => tr.status === 'submitted').length })}
        </button>
      )}

      {/* 확정 대기/확정 목록(고유 기능만 존치): 호스트=확정·되돌리기, 배우=내 제출 대기 표시 */}
      {railTracks.map((track) => (
        <div key={track.id} data-dub-rail-track className="flex items-center gap-2 rounded-lg border border-stage-border px-3 py-2 text-sm">
          <span className="w-12 shrink-0 text-xs text-stage-text-muted">{(track.startTimeMs / 1000).toFixed(1)}s</span>
          <span className="min-w-0 flex-1 truncate text-xs">
            {lineText(track)} · {memberName(track.participantId)} · {getStatusMark(track.status)}
          </span>
          {isHost && track.status === 'submitted' && (
            <button onClick={() => confirm(track.id)} disabled={busy}
              className="shrink-0 rounded-lg border border-stage-border px-3 py-1.5 text-xs hover:bg-stage-border/30 disabled:opacity-40">
              {t('dub.confirmButton')}
            </button>
          )}
          {/* DUB-RETAKE: 확정 해제 → submitted 복귀 → 배우 재녹음 재활성(Realtime 이 전파) */}
          {isHost && track.status === 'synced' && (
            <button onClick={() => confirm(track.id, true)} disabled={busy}
              className="shrink-0 rounded-lg border border-stage-border px-3 py-1.5 text-xs text-stage-text-muted hover:bg-stage-border/30 disabled:opacity-40">
              {t('dub.unconfirmButton')}
            </button>
          )}
          {!isHost && track.status === 'submitted' && track.participantId === myId && (
            <span className="shrink-0 text-[11px] text-stage-text-muted" role="status">{t('dub.waitingConfirmHint')}</span>
          )}
        </div>
      ))}

      {/* 하단: 진행도 (전 트랙 synced 시 DubPanel 이 DubCompositor 마운트) */}
      <div className="flex items-center justify-between border-t border-stage-border pt-3" role="status" aria-live="polite">
        <span className="text-xs text-stage-text-muted">{t('dub.progressDisplay', { count: syncedCount, total: tracks.length })}</span>
        {allSynced && <span className="text-xs text-fire-amber">{t('dub.recordingComplete')}</span>}
      </div>
    </div>
  )
}
