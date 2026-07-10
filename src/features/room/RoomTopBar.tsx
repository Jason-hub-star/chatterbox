import { useTranslation } from 'react-i18next'
import NetworkStatusIndicator from './NetworkStatusIndicator'

// 상단바(리디자인) — 로고 · 방 제목/태그 · 라이브+경과 · 링크공유 · N/정원 · 네트워크.
// 프레젠테이션 전용. 데이터·콜백은 RoomPage 주입. 호스트 관리 기능은 우도크 '관리' 탭(중복 배치 지양).
interface Props {
  roomName: string
  tags: string[]
  connected: boolean
  elapsed: string
  count: number
  capacity: number
  onShare: () => void
}

export default function RoomTopBar({ roomName, tags, connected, elapsed, count, capacity, onShare }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="shrink-0 text-lg font-semibold tracking-tight text-fire-amber">ChatterBox</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1 className="truncate text-sm font-semibold">{roomName || t('room.title')}</h1>
        {tags.map((tag) => (
          <span
            key={tag}
            className="hidden shrink-0 rounded-full bg-stage-elevated px-2 py-0.5 text-[11px] text-stage-text-muted sm:inline"
          >
            #{tag}
          </span>
        ))}
      </div>
      {connected && (
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-stage-border px-3 py-1 text-xs">
          <span className="h-2 w-2 rounded-full bg-fire-hot motion-safe:animate-pulse" aria-hidden />
          <span className="font-medium text-fire-hot">{t('room.live')}</span>
          <span className="tabular-nums text-stage-text-muted">{elapsed}</span>
        </span>
      )}
      <button
        onClick={onShare}
        className="hidden shrink-0 rounded-lg border border-stage-border px-3 py-1.5 text-xs text-stage-text-muted hover:text-stage-text sm:block"
      >
        {t('room.shareLink')}
      </button>
      <span className="shrink-0 text-xs tabular-nums text-stage-text-muted" aria-label={t('room.participants')}>
        {count}/{capacity}
      </span>
      <NetworkStatusIndicator />
    </div>
  )
}
