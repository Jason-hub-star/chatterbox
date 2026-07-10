import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useStageStore } from '@/stores/stageStore'
import {
  publishVodSync,
  setVodSyncApplier,
  setVodSyncReader,
  vodNeedsSeek,
  vodTargetMs,
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
  const videoRef = useRef<HTMLVideoElement>(null)

  // 타임라인 동기(ROOM-01): 호스트=상태 리더+play/pause/seeked 발행 / 비호스트=수신 보정.
  // 비호스트 controls 는 유지(스크럽해도 다음 호스트 이벤트·5s 하트비트에서 ±200ms 로 복귀 — 계약 §Scrubber 편차).
  useEffect(() => {
    const v = videoRef.current
    if (!url || !v) return
    if (isHost) {
      const read = (): VodSyncState => ({ positionMs: v.currentTime * 1000, playing: !v.paused && !v.ended, atMs: Date.now() })
      setVodSyncReader(read)
      const emit = () => publishVodSync(read())
      v.addEventListener('play', emit)
      v.addEventListener('pause', emit)
      v.addEventListener('seeked', emit)
      return () => {
        setVodSyncReader(null)
        v.removeEventListener('play', emit)
        v.removeEventListener('pause', emit)
        v.removeEventListener('seeked', emit)
      }
    }
    setVodSyncApplier((s) => {
      const target = vodTargetMs(s, Date.now())
      if (vodNeedsSeek(v.currentTime * 1000, target)) v.currentTime = target / 1000
      if (s.playing && v.paused) void v.play().catch(() => {}) // 자동재생 차단 시 다음 보정에서 재시도
      else if (!s.playing && !v.paused) v.pause()
    })
    return () => setVodSyncApplier(null)
  }, [url, isHost])

  if (!url) {
    return (
      <div
        className="relative col-start-2 row-start-2 grid min-h-[120px] place-items-center overflow-hidden rounded-xl border border-stage-border bg-gradient-to-br from-stage-elevated/60 via-stage-panel/30 to-stage-base/50 text-xs text-stage-text-muted"
        aria-label={t('stage.mainView')}
      >
        {/* 중앙 히어로 비네트(코드 임시) — 레퍼런스급은 씬 자산 필요(scene-pipeline). */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35))]" aria-hidden />
        <span className="relative flex flex-col items-center gap-1.5 opacity-70">
          <span aria-hidden className="text-2xl">🎬</span>
          {t('stage.mainView')}
        </span>
      </div>
    )
  }

  return (
    <div
      className="relative col-start-2 row-start-2 overflow-hidden rounded-lg border border-stage-border bg-black"
      aria-label={t('stage.sharedVideo')}
    >
      {/* 각 클라가 종료 시 자기 화면만 정리 → 15s 타이머 없이 자동 해제(짧은 클립이라 뷰어 간 편차 무시) */}
      <video ref={videoRef} src={url} autoPlay controls onEnded={clear} className="h-full w-full object-contain">
        <track kind="captions" />
      </video>
      {isHost && (
        <button
          onClick={onStop}
          className="absolute right-1 top-1 rounded bg-stage-base/70 px-2 py-0.5 text-[11px] text-stage-text hover:text-fire-hot"
        >
          {t('stage.stopShare')}
        </button>
      )}
    </div>
  )
}
