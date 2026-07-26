import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStageStore } from '@/stores/stageStore'
import { useDubStore } from '@/stores/dubStore'
import { attachDubLayer, playDubPreview, type DubPreviewHandle } from '@/lib/dubPreview'
import DubTimeline from '@/features/dub/DubTimeline'
import { MicLevelMeter, TakeWaveform } from '@/features/dub/DubRecorder'
import {
  publishVodSync,
  setVodSyncApplier,
  setVodSyncReader,
  vodNeedsSeek,
  vodTargetMs,
  VOD_RATES,
  type VodSyncState,
} from '@/features/stage/vodSync'

// 무대 센터 프레임(메인 뷰). 공유 영상이 있으면 재생, 없으면 placeholder.
// VGEN 공유재생: 각 뷰어가 자기 서명 URL(get-vgen-url)로 재생 — onEnded 시 자기 화면만 정리(자동 해제).
// 호스트만 "공유 중지"(전원 broadcast). 타임라인은 호스트가 진실(±200ms 동기 — vodSync.ts).
// SSOT: docs/contracts/MainViewComponent.md
export default function MainView({ isHost, onStop, onDubEdit }: { isHost: boolean; onStop: () => void; onDubEdit?: (segmentId: number) => void }) {
  const { t } = useTranslation()
  const url = useStageStore((s) => s.mainVideoUrl)
  const clear = useStageStore((s) => s.clearMainVideo)
  const backgroundUrl = useStageStore((s) => s.backgroundUrl)
  // DUB-UX: 더빙 활성 시 센터에 소스 영상 + 현재 대사 자막(원음 음소거·타임라인은 vgen 과 동일 vodSync).
  //   dubUrl 이 vgen 공유영상보다 우선(더빙 중엔 소스가 센터의 주인공).
  const dubUrl = useDubStore((s) => s.sourceUrl)
  const dubSegments = useDubStore((s) => s.segments)
  const setDubSegment = useDubStore((s) => s.setCurrentSegment)
  // G9-P2 녹음 로컬모드: 녹음/미리보기 동안 내 화면만 구간 재생(vodSync 발행·수신 일시 해제).
  const localMode = useDubStore((s) => s.localMode)
  // G9-P3 누적 시사회: 호스트 토글 → 전원이 각자 트랙을 받아 얹음(영상 동기는 기존 vodSync 그대로).
  const screening = useDubStore((s) => s.screening)
  // S2 배경 베드(각인 #1): 기존 목소리 제거 스템을 video 에 슬레이브 — [원본 소리|목소리 뺀 배경] 토글.
  const bedUrls = useDubStore((s) => s.bedUrls)
  const bedMode = useDubStore((s) => s.bedMode)
  // DUB-PART-LOOP: submitted+synced 녹음 — 상시 레이어(일반 재생·시사회·리허설에서 항상 들림)
  const recordings = useDubStore((s) => s.recordings)
  const isDub = !!dubUrl
  const effectiveBed = isDub && bedUrls.length > 0 && bedMode === 'bed'
  // rehearse 는 재생 관점에선 일반 재생과 동일(원음/베드 유지) — record/preview 만 센터를 점유
  const localBlocking = !!localMode && localMode.kind !== 'rehearse'
  const centerUrl = dubUrl ?? url
  const [subtitle, setSubtitle] = useState('')
  const [myTurnTrackId, setMyTurnTrackId] = useState<string | null>(null) // G9-P4→U2: 재생 위치의 내 미제출 트랙(배너+원버튼)
  // U2 센터 녹음 HUD: 엔진 렌더 상태(U1 승격분) — 조작은 recEngine(getState 호출·구독 불필요)
  const recMicStream = useDubStore((s) => s.recMicStream)
  const recPreview = useDubStore((s) => s.recPreview)
  const recCalMs = useDubStore((s) => s.recCalMs)
  const recBusy = useDubStore((s) => s.recBusy)
  const recError = useDubStore((s) => s.recError)
  const recCountdown = useDubStore((s) => s.recCountdown) // W3 구간 진입 3‑2‑1 프리롤
  const recLoop = useDubStore((s) => s.recLoop)           // W3 구간 루프 재생 토글
  const videoRef = useRef<HTMLVideoElement>(null)
  const [dubDurMs, setDubDurMs] = useState(0) // DUB-EDIT: 타임라인 스케일(loadedmetadata 실측)
  const [rate, setRate] = useState(1) // 호스트 배속 칩 활성 표시용(진실은 video.playbackRate)
  const bedRefs = useRef<Map<string, HTMLAudioElement>>(new Map()) // S2: 스템 N개 = audio N개(동일 슬레이브)
  const localActiveRef = useRef(false) // vodSync 게이트(이벤트 리스너·applier 가 클로저 밖에서 읽음)
  const localPrevRef = useRef<{ ms: number; paused: boolean } | null>(null) // 로컬모드 진입 전 위치(복귀용)
  const previewHandleRef = useRef<DubPreviewHandle | null>(null)

  // W1 DUB-VIDEO-STALL: 첫 진입에 소스가 readyState 0 에 고착(error 미발생)해 무한 스피너 되는 걸 자가복구.
  //   loadstart 후 STALL_MS 내 loadedmetadata 없으면 .load() 재시도(최대 MAX_RETRY). onError/onStalled 도 합류.
  //   readyState>=1(메타데이터 도착) 이면 재시도 안 함 — 정상 로드·재생 중 버퍼링 오탐 방지.
  const stallTimerRef = useRef<number | null>(null)
  const loadRetryRef = useRef(0)
  const STALL_MS = 4000
  const MAX_RETRY = 2
  const retryVideoLoad = () => {
    const v = videoRef.current
    if (!v || v.readyState >= 1 || loadRetryRef.current >= MAX_RETRY) return
    loadRetryRef.current += 1
    if (import.meta.env.DEV) {
      ;(window as unknown as { __dubStallRetries?: number }).__dubStallRetries = loadRetryRef.current
      console.warn(`[dub] 소스 로드 stall — .load() 재시도 ${loadRetryRef.current}/${MAX_RETRY}`)
    }
    v.load() // → onLoadStart 재발화 → 워치독 재무장
  }
  const armStallWatchdog = () => {
    if (stallTimerRef.current) window.clearTimeout(stallTimerRef.current)
    stallTimerRef.current = window.setTimeout(retryVideoLoad, STALL_MS)
  }
  const clearStallWatchdog = () => {
    if (stallTimerRef.current) { window.clearTimeout(stallTimerRef.current); stallTimerRef.current = null }
  }
  // 새 소스마다 재시도 카운터 리셋(소스당 MAX_RETRY 독립)
  useEffect(() => { loadRetryRef.current = 0 }, [centerUrl])

  // 타임라인 동기(ROOM-01): 호스트=상태 리더+play/pause/seeked/ratechange 발행 / 비호스트=수신 보정.
  // 비호스트 controls 는 유지(스크럽해도 다음 호스트 이벤트·5s 하트비트에서 ±200ms 로 복귀 — 계약 §Scrubber 편차).
  useEffect(() => {
    const v = videoRef.current
    if (!centerUrl || !v) return
    if (isHost) {
      const read = (): VodSyncState => ({ positionMs: v.currentTime * 1000, playing: !v.paused && !v.ended, atMs: Date.now(), rate: v.playbackRate })
      setVodSyncReader(() => (localActiveRef.current ? null : read())) // 로컬모드 중 하트비트 정지
      const emit = () => {
        setRate(v.playbackRate)
        if (localActiveRef.current) return // 로컬 시크/재생을 방 전체에 방송하지 않음
        publishVodSync(read())
      }
      v.addEventListener('play', emit)
      v.addEventListener('pause', emit)
      v.addEventListener('seeked', emit)
      v.addEventListener('ratechange', emit) // 배속(U-3)도 즉시 발행 — 칩 클릭은 playbackRate 설정만(발행 단일 경로)
      return () => {
        setVodSyncReader(null)
        v.removeEventListener('play', emit)
        v.removeEventListener('pause', emit)
        v.removeEventListener('seeked', emit)
        v.removeEventListener('ratechange', emit)
      }
    }
    setVodSyncApplier((s) => {
      if (localActiveRef.current) return // 로컬모드 중 호스트 보정 무시(복귀 시 다음 하트비트가 재동기)
      if (v.playbackRate !== s.rate) v.playbackRate = s.rate // 배속 먼저 — 드리프트 판정이 새 속도 기준
      const target = vodTargetMs(s, Date.now())
      const durMs = v.duration * 1000
      if (Number.isFinite(durMs) && target >= durMs - 250) {
        // 재연결 늦배달 stale 메시지의 과속 외삽(예: 2x 시절 at_ms) — 끝 강제 시크는 onEnded 로
        // 뷰어 공유를 영구 소멸시킨다. 시크만 스킵(다음 fresh 이벤트/5s 하트비트가 보정).
      } else if (vodNeedsSeek(v.currentTime * 1000, target)) v.currentTime = target / 1000
      if (s.playing && v.paused) void v.play().catch(() => {}) // 자동재생 차단 시 다음 보정에서 재시도
      else if (!s.playing && !v.paused) v.pause()
    })
    return () => setVodSyncApplier(null)
  }, [centerUrl, isHost])

  // G9-P2 로컬모드 진입/전환/복귀. record=구간 시작으로 시크·음소거 재생, preview=방금 녹음을 스케줄해 동기 재생.
  useEffect(() => {
    previewHandleRef.current?.stop() // 모드 전환마다 이전 미리보기 오디오 정리
    previewHandleRef.current = null
    const v = videoRef.current
    if (!v) return
    if (localMode) {
      if (!localPrevRef.current) localPrevRef.current = { ms: v.currentTime * 1000, paused: v.paused } // record→preview 연쇄에도 최초 위치 유지
      localActiveRef.current = true
      if (localMode.kind === 'record' || localMode.kind === 'rehearse') {
        v.currentTime = localMode.startMs / 1000
        if (localMode.kind === 'record' && localMode.preroll) v.pause() // W3: 카운트다운 중 구간 시작 프레임 정지(준비) — 끝나면 record(preroll 없음)로 재생
        else void v.play().catch(() => {}) // rehearse: 구간 재생(반복은 onTimeUpdate, 더빙 오디오는 상시 레이어)
        return
      }
      if (!localMode.audioUrl) return
      let cancelled = false
      // W5: 미리보기 오디오(Web Audio)를 영상 pause/play 에 묶는다(정지 시 백그라운드 재생 방지)
      const onPause = () => previewHandleRef.current?.pause()
      const onPlay = () => previewHandleRef.current?.resume()
      // S2 각인 #2: 미리보기를 배경 스템 베드 위에서 — "배경음 위 내 목소리"가 즉시 들림.
      // durationMs 트림 = 합성(atrim)과 동일 규칙 — 프리뷰가 완성본 소리를 대변.
      void playDubPreview(v, [{ url: localMode.audioUrl, startMs: localMode.startMs, calMs: localMode.calMs, durationMs: localMode.endMs - localMode.startMs }], localMode.startMs, useDubStore.getState().bedUrls)
        .then((h) => {
          if (cancelled) { h.stop(); return }
          previewHandleRef.current = h
          v.addEventListener('pause', onPause)
          v.addEventListener('play', onPlay)
        })
        .catch(() => {})
      return () => { cancelled = true; v.removeEventListener('pause', onPause); v.removeEventListener('play', onPlay) }
    }
    // 해제 → 진입 전 위치·재생상태 복원(호스트면 seeked/play 발행이 동기 재개)
    localActiveRef.current = false
    const prev = localPrevRef.current
    if (prev) {
      localPrevRef.current = null
      v.currentTime = prev.ms / 1000
      if (prev.paused) v.pause()
      else void v.play().catch(() => {})
    }
  }, [localMode])

  // 언마운트 시 미리보기 오디오 정리(위 효과의 상단 정리는 재실행 시에만 돈다) + W1 워치독 타이머 정리
  useEffect(() => () => { previewHandleRef.current?.stop(); clearStallWatchdog() }, [])

  // F2 텔레포트: 좌패널→센터 시크(DOM 조작만 — setState 없음). nonce 로 재클릭 재발화.
  // localMode 게이트: 녹음/프리뷰/리허설 중 텔레포트가 영상을 옮기면 테이크·구간 재생이 깨진다(잠재버그 픽스).
  const seekRequest = useDubStore((s) => s.seekRequest)
  useEffect(() => {
    const v = videoRef.current
    if (!seekRequest || !isDub || !v) return
    if (useDubStore.getState().localMode) return
    v.currentTime = seekRequest.ms / 1000
  }, [seekRequest, isDub])

  // S2 베드 슬레이브: video 에 play/pause/seek/rate 미러 + 1s 드리프트 보정(±0.3s — vodSync applier 축소판).
  // record/preview 중엔 정지(그쪽 오디오는 dubPreview 스케줄러 소유 — 이중 방지).
  // 시사회는 베드 강제(원음 뮤트 대체) · 리허설은 일반 재생 취급(bedMode 그대로).
  useEffect(() => {
    const v = videoRef.current
    if (!isDub || !v) return
    const active = (effectiveBed || screening) && !localBlocking
    const beds = [...bedRefs.current.values()]
    const syncTime = () => beds.forEach((b) => { if (Math.abs(b.currentTime - v.currentTime) > 0.3) b.currentTime = v.currentTime })
    const syncRate = () => beds.forEach((b) => { b.playbackRate = v.playbackRate })
    const play = () => { if (active && !v.paused) beds.forEach((b) => void b.play().catch(() => {})) }
    const pause = () => beds.forEach((b) => b.pause())
    syncRate(); syncTime()
    if (active && !v.paused) play(); else pause()
    const onPlay = () => { syncTime(); play() }
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', pause)
    v.addEventListener('seeked', syncTime)
    v.addEventListener('ratechange', syncRate)
    const iv = window.setInterval(syncTime, 1000)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', pause)
      v.removeEventListener('seeked', syncTime)
      v.removeEventListener('ratechange', syncRate)
      window.clearInterval(iv)
      pause()
    }
  }, [isDub, effectiveBed, localBlocking, screening, bedUrls])

  // DUB-PART-LOOP 상시 레이어: submitted+synced 녹음(dubStore.recordings — DubPanel 이 Realtime 갱신)을
  // 일반 재생·시사회·리허설에서 항상 얹는다. 시크/배속은 attachDubLayer 가 재정렬(seeked/ratechange 재스케줄).
  // record/preview 중엔 해제 — 그 구간 오디오는 녹음 엔진/프리뷰 스케줄러 소유.
  useEffect(() => {
    const v = videoRef.current
    if (!isDub || !v || recordings.length === 0 || localBlocking) return
    let cancelled = false
    let detach: (() => void) | null = null
    void attachDubLayer(v, recordings.map((r) => ({
      url: r.url,
      startMs: r.startTimeMs,
      calMs: r.calibrationOffsetMs,
      // 세그 길이 트림 — 초과 테이크의 다음 세그 침범 차단(endTimeMs=0 은 stale 서버 하위호환 → 트림 없음)
      durationMs: r.endTimeMs > r.startTimeMs ? r.endTimeMs - r.startTimeMs : 0,
    })))
      .then((d) => { if (cancelled) d(); else detach = d })
      .catch(() => {})
    return () => { cancelled = true; detach?.() }
  }, [isDub, recordings, localBlocking])

  // G9-P3 시사회: 상시 레이어가 오디오를 담당하므로 여기선 "처음부터 함께 보기"만 —
  // 호스트가 0으로 시크+재생(발행은 기존 vodSync seeked/play 리스너 단일 경로), 비호스트는 vodSync 추종.
  useEffect(() => {
    const v = videoRef.current
    if (!screening || !v) return
    if (isHost) {
      v.currentTime = 0
      void v.play().catch(() => {})
    }
    const onEnded = () => useDubStore.getState().setScreening(false) // 영상 끝 → 각자 종료(전원 동기라 동시 도달)
    v.addEventListener('ended', onEnded)
    return () => v.removeEventListener('ended', onEnded)
  }, [screening, isHost])

  if (!centerUrl) {
    // 씬 설정 시(방장 선택) 무대 전체 배경이 씬을 담당 → 센터는 투명(중복 제거·불꽃이 비침). 공유 시 이 자리에 영상.
    if (backgroundUrl) return <div className="col-start-2 row-start-2" aria-hidden />
    return (
      <div
        className="relative col-start-2 row-start-2 grid min-h-[120px] place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-stage-elevated/50 via-stage-panel/20 to-stage-base/40 text-xs text-stage-text-muted"
        aria-label={t('stage.mainView')}
      >
        {/* 씬 힌트(그라디언트+🎬) — 방장이 배경을 고르면 무대 전체 배경이 씬을 담당(중복 방지)해 이 자리는 영상 슬롯이 된다. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.28))]" aria-hidden />
        <span className="relative flex flex-col items-center gap-1.5 opacity-60">
          <span aria-hidden className="text-2xl">🎬</span>
          {t('stage.mainView')}
        </span>
      </div>
    )
  }

  return (
    <div
      className="col-start-2 row-start-2 flex h-full w-full flex-col overflow-hidden rounded-lg border border-stage-border bg-black"
      aria-label={isDub ? t('dub.centerLabel') : t('stage.sharedVideo')}
    >
      {/* DUB-EDIT: 비디오+오버레이는 내부 relative 래퍼(flex-1) — 타임라인이 하단 행으로 붙어도
          자막(bottom-10)·배지 앵커가 비디오 영역 기준을 유지(오버레이 충돌 0). 비-더빙도 단일 자식이라 레이아웃 동일. */}
      <div className="relative min-h-0 flex-1">
      {/* 각 클라가 종료 시 자기 화면만 정리(vgen) → 15s 타이머 없이 자동 해제. 더빙은 참조영상이라 onEnded 무동작. */}
      <video
        ref={videoRef}
        src={centerUrl}
        autoPlay
        controls
        muted={isDub ? (effectiveBed || localBlocking || screening) : false}
        onLoadStart={isDub ? armStallWatchdog : undefined}
        onStalled={isDub ? retryVideoLoad : undefined}
        onError={isDub ? retryVideoLoad : undefined}
        onLoadedMetadata={isDub ? (e) => {
          clearStallWatchdog() // W1: 메타데이터 도착 = 정상 로드, 워치독 해제
          const d = e.currentTarget.duration
          setDubDurMs(Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : 0)
          // S3: 소스 AR → 더빙 무대 fit 재료(Stage 가 읽음)
          const { videoWidth: vw, videoHeight: vh } = e.currentTarget
          useDubStore.getState().setSourceAR(vw > 0 && vh > 0 ? vw / vh : null)
        } : undefined}
        onEnded={isDub ? undefined : clear}
        onTimeUpdate={isDub ? () => {
          const v = videoRef.current
          if (!v) return
          const ms = v.currentTime * 1000
          const seg = dubSegments.find((s) => ms >= s.start_ms && ms < s.end_ms)
          setSubtitle(seg ? (seg.translated_text || seg.text) : '')
          setDubSegment(seg ? seg.id : null)
          // U4: submitted 는 배너 제외(재녹음 진입은 좌패널 🎙) — 배너 = "아직 미제출" 유도만
          const turn = useDubStore.getState().myTurnRanges.find((r) => !r.submitted && ms >= r.startMs && ms < r.endMs)
          setMyTurnTrackId(turn ? turn.trackId : null) // 동값이면 리렌더 스킵
          // G9-P2/W3 수리: 구간 끝 도달 — 녹음이 파트를 넘지 않는다.
          //   record+루프 ON = 이전 테이크 폐기 후 새 테이크로 되감기 / OFF = 자동 정지 → 프리뷰.
          //   rehearse = 구간 반복(상시 레이어가 seeked 로 더빙도 재정렬) / preview = 재생 종료.
          const lm = useDubStore.getState().localMode
          if (lm && ms >= lm.endMs && !v.paused) {
            if (lm.kind === 'rehearse') {
              v.currentTime = lm.startMs / 1000
            } else if (lm.kind === 'record') {
              if (useDubStore.getState().recLoop) {
                useDubStore.getState().recEngine?.restartTake()
                v.currentTime = lm.startMs / 1000
              } else {
                useDubStore.getState().recEngine?.stop()
              }
            } else {
              v.pause()
            }
          }
        } : undefined}
        className="h-full w-full object-contain"
      >
        <track kind="captions" />
      </video>
      {/* S2 베드 오디오(숨김) — 스템 N개를 video 에 슬레이브. 로컬모드/시사회 중엔 위 effect 가 정지. */}
      {isDub && bedUrls.map((u) => (
        <audio
          key={u}
          src={u}
          preload="auto"
          aria-hidden="true"
          className="hidden"
          ref={(el) => { if (el) bedRefs.current.set(u, el); else bedRefs.current.delete(u) }}
        />
      ))}
      {/* S2 각인 #1: [원본 소리|목소리 뺀 배경] A/B 토글 — 탭 1로 기존 목소리 소멸 청취. 로컬 취향(전파 없음). */}
      {isDub && !localBlocking && bedUrls.length > 0 && (
        <div className="absolute right-1 top-8 z-10 flex overflow-hidden rounded border border-stage-border bg-stage-base/80 text-[10px]">
          <button
            onClick={() => useDubStore.getState().setBedMode('original')}
            aria-pressed={!effectiveBed}
            className={`px-2 py-0.5 ${!effectiveBed ? 'bg-fire-amber text-stage-base' : 'text-stage-text hover:text-fire-amber'}`}
          >
            {t('dub.bedOriginal')}
          </button>
          <button
            onClick={() => useDubStore.getState().setBedMode('bed')}
            aria-pressed={effectiveBed}
            className={`px-2 py-0.5 ${effectiveBed ? 'bg-fire-amber text-stage-base' : 'text-stage-text hover:text-fire-amber'}`}
          >
            {t('dub.bedOnly')}
          </button>
          {/* F3: 토글이 각자 로컬임을 명시 — 협업 시 서로 다른 소리를 듣는 상태 인지 */}
          <span className="self-center px-1 text-[9px] text-stage-text-muted" title={t('dub.bedLocalHint')}>
            {t('dub.bedLocalTag')}
          </span>
        </div>
      )}
      {/* G9-P2: 로컬모드 배지 — 녹음 중 REC(구간 끝 자동 정지라 별도 힌트 불필요) */}
      {isDub && localMode?.kind === 'record' && (
        <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-2 rounded bg-black/70 px-2 py-1 text-xs text-white" role="status">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-fire-hot" aria-hidden />
          {t('dub.recBadge')}
        </div>
      )}
      {/* DUB-PART-LOOP: 리허설 배지 — 파트 반복 중 + 해제(같은 대사 재클릭도 해제) */}
      {isDub && localMode?.kind === 'rehearse' && (
        <div className="absolute inset-x-0 top-2 z-10 flex justify-center" role="status">
          <span className="flex items-center gap-2 rounded bg-black/70 px-3 py-1 text-xs text-white">
            🔁 {t('dub.rehearseBadge')}
            <button
              onClick={() => useDubStore.getState().setLocalMode(null)}
              className="rounded bg-white/15 px-2 py-0.5 hover:bg-white/25"
            >
              {t('dub.rehearseStop')}
            </button>
          </span>
        </div>
      )}
      {/* U2: 프리뷰 배지는 제거 — 프리뷰 HUD(재재생·제출)가 상태를 대변, 360px 에서 배지-HUD 겹침 해소 */}
      {/* G9-P4→U2: 내 차례 배너 + [지금 녹음] 원버튼 — 영상 보다가 그 자리에서 녹음 진입(recEngine 직결) */}
      {isDub && myTurnTrackId && !localMode && (
        <div className="absolute inset-x-0 top-2 z-10 flex justify-center" role="status">
          <span className="flex items-center gap-2 rounded bg-fire-amber/90 px-3 py-1 text-xs font-semibold text-stage-base">
            🎙 {t('dub.myTurnBanner')}
            <button
              onClick={() => useDubStore.getState().recEngine?.start(myTurnTrackId)}
              className="rounded bg-stage-base/90 px-2 py-0.5 text-fire-amber hover:brightness-110"
            >
              {t('dub.recordNow')}
            </button>
          </span>
        </div>
      )}
      {/* W3 구간 진입 카운트다운(3‑2‑1) — 즉시 재생 대신 준비 시간, 그동안 구간 시작 프레임 정지 */}
      {isDub && recCountdown != null && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" role="status" aria-label={t('dub.countdownLabel')}>
          <span className="text-7xl font-bold text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.9)]">{recCountdown}</span>
        </div>
      )}
      {/* U2 녹음 HUD — 레벨미터+중지 + W3 구간 루프 토글(센터에서 시작한 녹음을 센터에서 끝냄) */}
      {isDub && localMode?.kind === 'record' && (
        <div className="absolute inset-x-0 top-2 z-10 flex justify-center">
          <div className="flex w-72 max-w-[90%] items-center gap-2 rounded bg-black/70 px-3 py-1.5">
            {recMicStream && <MicLevelMeter stream={recMicStream} />}
            <button
              onClick={() => useDubStore.getState().recEngine?.stop()}
              className="shrink-0 rounded-lg bg-fire-hot px-3 py-1 text-xs font-semibold text-stage-base"
            >
              {t('dub.stopButton')}
            </button>
            {/* W3 구간 반복 — ON 이면 구간 끝에서 되돌아 반복(타이밍 재시도), OFF 면 끝에서 정지 */}
            <button
              onClick={() => useDubStore.getState().setRecLoop(!recLoop)}
              aria-pressed={recLoop}
              title={t('dub.loopHint')}
              className={`shrink-0 rounded-lg px-2 py-1 text-xs ${recLoop ? 'bg-fire-amber text-stage-base' : 'text-stage-text hover:text-fire-amber'}`}
            >
              🔁
            </button>
          </div>
        </div>
      )}
      {/* U2 프리뷰 HUD — 캘리브레이션·재재생·다시 녹음·제출(우패널 왕복 제거) */}
      {isDub && localMode?.kind === 'preview' && recPreview && (
        <div className="absolute inset-x-0 top-2 z-10 flex justify-center">
          <div className="flex max-w-[95%] flex-wrap items-center justify-center gap-2 rounded bg-black/70 px-3 py-1.5 text-xs text-white">
            <TakeWaveform url={recPreview.url} />
            <label className="flex items-center gap-1 text-stage-text-muted">
              {t('dub.calibrationLabel')}
              <input
                type="range" min={-200} max={200} step={10} value={recCalMs}
                onChange={(e) => useDubStore.getState().setRec({ recCalMs: Number(e.target.value) })}
                className="w-24 accent-fire-amber"
              />
              <span className="w-12 text-right tabular-nums">{recCalMs > 0 ? `+${recCalMs}` : recCalMs}ms</span>
            </label>
            <button
              onClick={() => useDubStore.getState().recEngine?.replay()}
              disabled={recBusy}
              className="rounded-lg border border-stage-border px-2 py-1 hover:bg-white/10 disabled:opacity-40"
            >
              {t('dub.replayPreview')}
            </button>
            <button
              onClick={() => useDubStore.getState().recEngine?.start(recPreview.trackId)}
              disabled={recBusy}
              className="rounded-lg border border-stage-border px-2 py-1 hover:bg-white/10 disabled:opacity-40"
            >
              🎙 {t('dub.retake')}
            </button>
            <button
              onClick={() => useDubStore.getState().recEngine?.submit()}
              disabled={recBusy}
              className="rounded-lg bg-fire-amber px-3 py-1 font-semibold text-stage-base disabled:opacity-40"
            >
              {recBusy ? t('dub.submitLoading') : t('dub.submitButton')}
            </button>
          </div>
        </div>
      )}
      {/* U2: 엔진 오류(마이크 거부 등)를 센터에도 — 좌패널/센터 트리거 시 우패널이 hidden 이어도 보이게 */}
      {isDub && recError && (
        <div className="pointer-events-none absolute inset-x-0 top-10 z-10 flex justify-center" role="alert">
          <span className="max-w-[90%] truncate rounded bg-fire-hot/90 px-2 py-0.5 text-[11px] text-white">{recError}</span>
        </div>
      )}
      {/* G9-P3: 시사회 배지(전원) + 호스트 토글 */}
      {isDub && screening && !localMode && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-fire-amber" role="status">
          {t('dub.screeningBadge')}
        </div>
      )}
      {isHost && isDub && !localMode && (
        <div className="absolute right-1 top-1">
          <button
            onClick={() => useDubStore.getState().setScreening(!screening)}
            title={t('dub.screeningHint')}
            className="touch-target rounded bg-stage-base/70 px-2 py-0.5 text-[11px] text-stage-text hover:text-fire-amber"
          >
            {screening ? t('dub.screeningStop') : t('dub.screeningStart')}
          </button>
        </div>
      )}
      {/* DUB-UX: 현재 세그먼트 자막(번역 우선) — 무대 센터에서 전원이 같은 줄을 본다. */}
      {isDub && subtitle && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center px-4">
          <span className="rounded bg-black/85 px-3 py-1 text-center text-sm font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] sm:text-base">{subtitle}</span>
        </div>
      )}
      {isHost && !isDub && (
        <div className="absolute right-1 top-1 flex items-center gap-1">
          {/* 배속 3단(U-3) — 클릭은 playbackRate 설정만, 발행은 ratechange 리스너가(단일 경로) */}
          {VOD_RATES.map((r) => (
            <button
              key={r}
              onClick={() => {
                const v = videoRef.current
                if (v) v.playbackRate = r
              }}
              aria-label={t('stage.rate', { rate: r })}
              className={`rounded bg-stage-base/70 px-1.5 py-0.5 text-[11px] ${rate === r ? 'text-fire-amber' : 'text-stage-text hover:text-fire-amber'}`}
            >
              {r}x
            </button>
          ))}
          <button
            onClick={onStop}
            className="rounded bg-stage-base/70 px-2 py-0.5 text-[11px] text-stage-text hover:text-fire-hot"
          >
            {t('stage.stopShare')}
          </button>
        </div>
      )}
      </div>
      {/* DUB-EDIT: 세그먼트 타임라인 — 하단 고정 행(전원 읽기 · 호스트 드래그 트림/삭제 · 편집중 배지) */}
      {isDub && <DubTimeline videoRef={videoRef} durationMs={dubDurMs} isHost={isHost} onDubEdit={onDubEdit} />}
    </div>
  )
}
