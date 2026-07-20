import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStageStore } from '@/stores/stageStore'
import { useDubStore } from '@/stores/dubStore'
import { useUserStore } from '@/stores/userStore'
import { playDubPreview, type DubPreviewHandle } from '@/lib/dubPreview'
import DubTimeline from '@/features/dub/DubTimeline'
import { fetchDubRecordings } from '@/lib/dub'
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
  // S2 배경 베드(각인 #1): 기존 목소리 제거 스템을 video 에 슬레이브 — [기존 소리|배경만] 토글.
  const bedUrls = useDubStore((s) => s.bedUrls)
  const bedMode = useDubStore((s) => s.bedMode)
  const isDub = !!dubUrl
  const effectiveBed = isDub && bedUrls.length > 0 && bedMode === 'bed'
  const centerUrl = dubUrl ?? url
  const [subtitle, setSubtitle] = useState('')
  // record 중 구간 끝 도달 → 중지 유도. localMode 객체 정체성에 귀속 — 모드가 바뀌면 자동 무효(별도 리셋 불필요).
  const [endedFor, setEndedFor] = useState<object | null>(null)
  const [myTurn, setMyTurn] = useState(false) // G9-P4: 재생 위치가 내 미제출 트랙 구간(배너)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [dubDurMs, setDubDurMs] = useState(0) // DUB-EDIT: 타임라인 스케일(loadedmetadata 실측)
  const [rate, setRate] = useState(1) // 호스트 배속 칩 활성 표시용(진실은 video.playbackRate)
  const bedRefs = useRef<Map<string, HTMLAudioElement>>(new Map()) // S2: 스템 N개 = audio N개(동일 슬레이브)
  const localActiveRef = useRef(false) // vodSync 게이트(이벤트 리스너·applier 가 클로저 밖에서 읽음)
  const localPrevRef = useRef<{ ms: number; paused: boolean } | null>(null) // 로컬모드 진입 전 위치(복귀용)
  const previewHandleRef = useRef<DubPreviewHandle | null>(null)

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
      if (localMode.kind === 'record') {
        v.currentTime = localMode.startMs / 1000
        void v.play().catch(() => {})
        return
      }
      if (!localMode.audioUrl) return
      let cancelled = false
      // S2 각인 #2: 미리보기를 배경 스템 베드 위에서 — "배경음 위 내 목소리"가 즉시 들림
      void playDubPreview(v, [{ url: localMode.audioUrl, startMs: localMode.startMs, calMs: localMode.calMs }], localMode.startMs, useDubStore.getState().bedUrls)
        .then((h) => { if (cancelled) h.stop(); else previewHandleRef.current = h })
        .catch(() => {})
      return () => { cancelled = true }
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

  // 언마운트 시 미리보기 오디오 정리(위 효과의 상단 정리는 재실행 시에만 돈다)
  useEffect(() => () => { previewHandleRef.current?.stop() }, [])

  // F2 텔레포트: 좌패널 대사 클릭 → 센터 시크(DOM 조작만 — setState 없음). nonce 로 재클릭 재발화.
  const seekRequest = useDubStore((s) => s.seekRequest)
  useEffect(() => {
    const v = videoRef.current
    if (!seekRequest || !isDub || !v) return
    v.currentTime = seekRequest.ms / 1000
  }, [seekRequest, isDub])

  // S2 베드 슬레이브: video 에 play/pause/seek/rate 미러 + 1s 드리프트 보정(±0.3s — vodSync applier 축소판).
  // 로컬모드·시사회 중엔 정지(그쪽 오디오는 dubPreview 스케줄러 소유 — 이중 방지).
  useEffect(() => {
    const v = videoRef.current
    if (!isDub || !v) return
    const active = effectiveBed && !localMode && !screening
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
  }, [isDub, effectiveBed, localMode, screening, bedUrls])

  // G9-P3 시사회 재생: 각 클라가 멤버 게이트(get-dub-recordings)로 submitted+synced 트랙을 받아
  // 0초부터 스케줄. 비호스트 영상은 vodSync applier 가 계속 보정(스케줄 오디오는 자기 시계 — ±200ms 허용오차 내).
  useEffect(() => {
    const v = videoRef.current
    if (!screening || !v) return
    const token = useUserStore.getState().session?.access_token
    const sessionId = useDubStore.getState().activeSessionId
    if (!token || !sessionId) return
    let cancelled = false
    let handle: DubPreviewHandle | null = null
    void fetchDubRecordings(token, sessionId)
      .then((recs) => {
        if (cancelled || recs.length === 0) return null
        return playDubPreview(
          v,
          recs.map((r) => ({ url: r.url, startMs: r.startTimeMs, calMs: r.calibrationOffsetMs })),
          0,
          useDubStore.getState().bedUrls, // S2: 시사회도 배경 베드 위(각인 #2)
        )
      })
      .then((h) => {
        if (!h) return
        if (cancelled) h.stop()
        else handle = h
      })
      .catch(() => {})
    const onEnded = () => useDubStore.getState().setScreening(false) // 영상 끝 → 각자 종료(전원 동기라 동시 도달)
    v.addEventListener('ended', onEnded)
    return () => {
      cancelled = true
      handle?.stop()
      v.removeEventListener('ended', onEnded)
    }
  }, [screening])

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
        muted={isDub ? (effectiveBed || !!localMode || screening) : false}
        onLoadedMetadata={isDub ? (e) => {
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
          setMyTurn(useDubStore.getState().myTurnRanges.some((r) => ms >= r.startMs && ms < r.endMs)) // 동값이면 리렌더 스킵
          // G9-P2: 구간 끝 도달 시 정지 — record 는 [중지] 유도, preview 는 재생 종료(로컬모드는 제출/재녹음까지 유지)
          const lm = useDubStore.getState().localMode
          if (lm && ms >= lm.endMs && !v.paused) {
            v.pause()
            if (lm.kind === 'record') setEndedFor(lm)
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
      {/* S2 각인 #1: [기존 소리|배경만] A/B 토글 — 탭 1로 기존 목소리 소멸 청취. 로컬 취향(전파 없음). */}
      {isDub && !localMode && bedUrls.length > 0 && (
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
      {/* G9-P2: 로컬모드 배지 — 녹음 중 REC(+구간 끝 힌트) / 미리보기 재생 중 */}
      {isDub && localMode?.kind === 'record' && (
        <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-2 rounded bg-black/70 px-2 py-1 text-xs text-white" role="status">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-fire-hot" aria-hidden />
          {t('dub.recBadge')}
          {endedFor === localMode && <span className="text-fire-amber">{t('dub.segmentEndHint')}</span>}
        </div>
      )}
      {isDub && localMode?.kind === 'preview' && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-fire-amber" role="status">
          {t('dub.previewBadge')}
        </div>
      )}
      {/* G9-P4: 내 차례 배너 — 재생 위치가 내 미제출 트랙 구간(녹음 유도, DubRecorder.md §4) */}
      {isDub && myTurn && !localMode && (
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center" role="status">
          <span className="rounded bg-fire-amber/90 px-3 py-1 text-xs font-semibold text-stage-base">
            🎙 {t('dub.myTurnBanner')}
          </span>
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
