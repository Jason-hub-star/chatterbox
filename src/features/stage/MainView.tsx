import { useTranslation } from 'react-i18next'
import { useStageStore } from '@/stores/stageStore'

// 무대 센터 프레임(메인 뷰). 공유 영상이 있으면 재생, 없으면 placeholder.
// VGEN 공유재생: 각 뷰어가 자기 서명 URL(get-vgen-url)로 재생 — onEnded 시 자기 화면만 정리(자동 해제).
// 호스트만 "공유 중지"(전원 broadcast). SSOT: docs/contracts/MainViewComponent.md
export default function MainView({ isHost, onStop }: { isHost: boolean; onStop: () => void }) {
  const { t } = useTranslation()
  const url = useStageStore((s) => s.mainVideoUrl)
  const clear = useStageStore((s) => s.clearMainVideo)

  if (!url) {
    return (
      <div
        className="col-start-2 row-start-2 grid min-h-[120px] place-items-center rounded-lg border border-stage-border bg-stage-panel text-xs text-stage-text-muted"
        aria-label={t('stage.mainView')}
      >
        {t('stage.mainView')}
      </div>
    )
  }

  return (
    <div
      className="relative col-start-2 row-start-2 overflow-hidden rounded-lg border border-stage-border bg-black"
      aria-label={t('stage.sharedVideo')}
    >
      {/* 각 클라가 종료 시 자기 화면만 정리 → 15s 타이머 없이 자동 해제(짧은 클립이라 뷰어 간 편차 무시) */}
      <video src={url} autoPlay controls onEnded={clear} className="h-full w-full object-contain">
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
