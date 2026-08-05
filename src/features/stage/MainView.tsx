import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useStageStore } from '@/stores/stageStore'
import { useDubStore } from '@/stores/dubStore'
import DubTimeline from '@/features/dub/DubTimeline'
import { MicLevelMeter, TakeWaveform } from '@/features/dub/DubRecorder'
import { VOD_RATES } from '@/features/stage/vodSync'
import { useDubCenterPlayback } from '@/features/stage/useDubCenterPlayback'

// 무대 센터 프레임(메인 뷰). 공유 영상이 있으면 재생, 없으면 placeholder.
// VGEN 공유재생: 각 뷰어가 자기 서명 URL(get-vgen-url)로 재생 — onEnded 시 자기 화면만 정리(자동 해제).
// 호스트만 "공유 중지"(전원 broadcast). 타임라인은 호스트가 진실(±200ms 동기 — vodSync.ts).
// AA3: 재생 소유 로직(vodSync·localMode·베드·레이어·시사회·워치독·구간 경계)은 useDubCenterPlayback 훅 —
//      이 컴포넌트는 렌더·HUD 만 담당한다.
// SSOT: docs/contracts/MainViewComponent.md
export default function MainView({ isHost, onStop, onDubEdit }: { isHost: boolean; onStop: () => void; onDubEdit?: (segmentId: number) => void }) {
  const { t } = useTranslation()
  const url = useStageStore((s) => s.mainVideoUrl)
  const clear = useStageStore((s) => s.clearMainVideo)
  const backgroundUrl = useStageStore((s) => s.backgroundUrl)
  // DUB-UX: 더빙 활성 시 센터에 소스 영상 + 현재 대사 자막(원음 음소거·타임라인은 vgen 과 동일 vodSync).
  //   dubUrl 이 vgen 공유영상보다 우선(더빙 중엔 소스가 센터의 주인공).
  const dubUrl = useDubStore((s) => s.sourceUrl)
  // U2 센터 녹음 HUD: 엔진 렌더 상태(U1 승격분) — 조작은 recEngine(getState 호출·구독 불필요)
  const recMicStream = useDubStore((s) => s.recMicStream)
  const recPreview = useDubStore((s) => s.recPreview)
  const recCalMs = useDubStore((s) => s.recCalMs)
  const recBusy = useDubStore((s) => s.recBusy)
  const recError = useDubStore((s) => s.recError)
  const recCountdown = useDubStore((s) => s.recCountdown) // W3 구간 진입 3‑2‑1 프리롤
  const recLoop = useDubStore((s) => s.recLoop)           // W3 구간 루프 재생 토글
  const videoRef = useRef<HTMLVideoElement>(null)
  const centerUrl = dubUrl ?? url
  const {
    isDub, localBlocking, effectiveBed, localMode, screening, bedUrls,
    subtitle, myTurnTrackId, dubDurMs, rate, bedRefs,
    onLoadStart, onStalled, onError, onLoadedMetadata, onTimeUpdate, onEnded,
  } = useDubCenterPlayback({ videoRef, centerUrl, dubUrl, isHost })

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
      {/* 각 클라가 종료 시 자기 화면만 정리(vgen) → 15s 타이머 없이 자동 해제. 더빙은 onEnded 가 구간 경계 미러(험지 픽스). */}
      <video
        ref={videoRef}
        src={centerUrl}
        autoPlay
        controls
        muted={isDub ? (effectiveBed || localBlocking || screening) : false}
        onLoadStart={isDub ? onLoadStart : undefined}
        onStalled={isDub ? onStalled : undefined}
        onError={isDub ? onError : undefined}
        onLoadedMetadata={isDub ? onLoadedMetadata : undefined}
        onEnded={isDub ? onEnded : clear}
        onTimeUpdate={isDub ? onTimeUpdate : undefined}
        className="h-full w-full object-contain"
      >
        <track kind="captions" />
      </video>
      {/* S2 베드 오디오(숨김) — 스템 N개를 video 에 슬레이브. 로컬모드/시사회 중엔 훅의 effect 가 정지. */}
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
              className="touch-target rounded bg-stage-base/90 px-2 py-0.5 text-fire-amber hover:brightness-110"
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
              className="touch-target shrink-0 rounded-lg bg-fire-hot px-3 py-1 text-xs font-semibold text-stage-base"
            >
              {t('dub.stopButton')}
            </button>
            {/* W3 구간 반복 — ON 이면 구간 끝에서 되돌아 반복(타이밍 재시도), OFF 면 끝에서 정지 */}
            <button
              onClick={() => useDubStore.getState().setRecLoop(!recLoop)}
              aria-pressed={recLoop}
              title={t('dub.loopHint')}
              className={`touch-target shrink-0 rounded-lg px-2 py-1 text-xs ${recLoop ? 'bg-fire-amber text-stage-base' : 'text-stage-text hover:text-fire-amber'}`}
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
              className="touch-target rounded-lg border border-stage-border px-2 py-1 hover:bg-white/10 disabled:opacity-40"
            >
              {t('dub.replayPreview')}
            </button>
            <button
              onClick={() => useDubStore.getState().recEngine?.start(recPreview.trackId)}
              disabled={recBusy}
              className="touch-target rounded-lg border border-stage-border px-2 py-1 hover:bg-white/10 disabled:opacity-40"
            >
              🎙 {t('dub.retake')}
            </button>
            <button
              onClick={() => useDubStore.getState().recEngine?.submit()}
              disabled={recBusy}
              className="touch-target rounded-lg bg-fire-amber px-3 py-1 font-semibold text-stage-base disabled:opacity-40"
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
              className={`touch-target rounded bg-stage-base/70 px-1.5 py-0.5 text-[11px] ${rate === r ? 'text-fire-amber' : 'text-stage-text hover:text-fire-amber'}`}
            >
              {r}x
            </button>
          ))}
          <button
            onClick={onStop}
            className="touch-target rounded bg-stage-base/70 px-2 py-0.5 text-[11px] text-stage-text hover:text-fire-hot"
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
