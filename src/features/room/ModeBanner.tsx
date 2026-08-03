import { useTranslation } from 'react-i18next'
import { useStageStore, type StageMode } from '@/stores/stageStore'

// G-261 모드 전환 배너 — announceMode(broadcast 수신) 시에만 2.4s 표출(store 가 타이머 소유, toastStore 패턴).
// 입장 복원(setMode)은 조용. 색상은 계약(RoomView.md §G-261): normal 회색 / vgen 인디고틴트 / dub 바이올렛틴트.
// 무채 다크 팔레트 조화 틴트(생 파랑/보라 "AI 티" 재색, GOAL-color-harmony.md CP2) — text-white 대비 AAA.
const BANNER_BG: Record<StageMode, string> = {
  normal: 'bg-stage-elevated',
  vgen: 'bg-[#374C76]',
  dub: 'bg-[#55436F]',
}
const BANNER_KEY: Record<StageMode, string> = {
  normal: 'stage.modeNormal',
  vgen: 'stage.modeVgen',
  dub: 'stage.modeDub',
}

export default function ModeBanner() {
  const { t } = useTranslation()
  const bannerMode = useStageStore((s) => s.bannerMode)
  if (!bannerMode) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={`cb-mode-banner fixed left-1/2 top-4 z-50 rounded-lg px-4 py-2 text-sm font-bold text-white ${BANNER_BG[bannerMode]}`}
    >
      {t(BANNER_KEY[bannerMode])}
    </div>
  )
}
