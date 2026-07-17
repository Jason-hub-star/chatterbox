import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStageStore } from '@/stores/stageStore'
import { useDubStore } from '@/stores/dubStore'
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
export default function MainView({ isHost, onStop }: { isHost: boolean; onStop: () => void }) {
  const { t } = useTranslation()
  const url = useStageStore((s) => s.mainVideoUrl)
  const clear = useStageStore((s) => s.clearMainVideo)
  const backgroundUrl = useStageStore((s) => s.backgroundUrl)
  // DUB-UX: 더빙 활성 시 센터에 소스 영상 + 현재 대사 자막(원음 음소거·타임라인은 vgen 과 동일 vodSync).
  //   dubUrl 이 vgen 공유영상보다 우선(더빙 중엔 소스가 센터의 주인공).
  const dubUrl = useDubStore((s) => s.sourceUrl)
  const dubSegments = useDubStore((s) => s.segments)
  const setDubSegment = useDubStore((s) => s.setCurrentSegment)
  const isDub = !!dubUrl
  const centerUrl = dubUrl ?? url
  const [subtitle, setSubtitle] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const [rate, setRate] = useState(1) // 호스트 배속 칩 활성 표시용(진실은 video.playbackRate)

  // 타임라인 동기(ROOM-01): 호스트=상태 리더+play/pause/seeked/ratechange 발행 / 비호스트=수신 보정.
  // 비호스트 controls 는 유지(스크럽해도 다음 호스트 이벤트·5s 하트비트에서 ±200ms 로 복귀 — 계약 §Scrubber 편차).
  useEffect(() => {
    const v = videoRef.current
    if (!centerUrl || !v) return
    if (isHost) {
      const read = (): VodSyncState => ({ positionMs: v.currentTime * 1000, playing: !v.paused && !v.ended, atMs: Date.now(), rate: v.playbackRate })
      setVodSyncReader(read)
      const emit = () => {
        setRate(v.playbackRate)
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
      className="relative col-start-2 row-start-2 overflow-hidden rounded-lg border border-stage-border bg-black"
      aria-label={isDub ? t('dub.centerLabel') : t('stage.sharedVideo')}
    >
      {/* 각 클라가 종료 시 자기 화면만 정리(vgen) → 15s 타이머 없이 자동 해제. 더빙은 참조영상이라 onEnded 무동작. */}
      <video
        ref={videoRef}
        src={centerUrl}
        autoPlay
        controls
        muted={isDub}
        onEnded={isDub ? undefined : clear}
        onTimeUpdate={isDub ? () => {
          const v = videoRef.current
          if (!v) return
          const ms = v.currentTime * 1000
          const seg = dubSegments.find((s) => ms >= s.start_ms && ms < s.end_ms)
          setSubtitle(seg ? (seg.translated_text || seg.text) : '')
          setDubSegment(seg ? seg.id : null)
        } : undefined}
        className="h-full w-full object-contain"
      >
        <track kind="captions" />
      </video>
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
  )
}
