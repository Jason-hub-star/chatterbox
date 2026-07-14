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
  isViewer: boolean
  onShare: () => void
}

export default function RoomTopBar({ roomName, tags, connected, elapsed, count, capacity, isViewer, onShare }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 sm:flex-nowrap sm:gap-3">
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
        <span className="flex shrink-0 items-center gap-2 rounded-full border border-stage-border px-3 py-1">
          <span className="h-2 w-2 rounded-full bg-fire-hot motion-safe:animate-pulse" aria-hidden />
          <span className="text-[11px] font-medium uppercase tracking-wide text-fire-hot">{t('room.live')}</span>
          <span className="text-sm font-bold tabular-nums text-stage-text">{elapsed}</span>
        </span>
      )}
      {/* 관전 배지 — 뷰어는 하단바 마이크가 없어 자기 상태를 알 수 없음. 아이콘+텍스트 병행(색상단독 회피). */}
      {isViewer && (
        <span
          className="flex shrink-0 items-center gap-1 rounded-full border border-fire-amber/40 bg-fire-amber/10 px-2.5 py-1 text-[11px] font-medium text-fire-amber"
          role="status"
        >
          <span aria-hidden>👀</span>
          <span>{t('room.watching')}</span>
        </span>
      )}
      {/* UX-A11Y-1: 모바일 공유숨김 해소 — 모바일은 아이콘 전용(🔗+aria-label), sm↑는 텍스트. 컨테이너 flex-wrap 로 360px 가로 오버플로 방지. */}
      <button
        onClick={onShare}
        aria-label={t('room.shareLink')}
        title={t('room.shareLink')}
        className="shrink-0 rounded-lg border border-stage-border px-2 py-1.5 text-xs text-stage-text-muted hover:text-stage-text sm:px-3"
      >
        <span className="sm:hidden" aria-hidden>🔗</span>
        <span className="hidden sm:inline">{t('room.shareLink')}</span>
      </button>
      <span className="shrink-0 text-xs tabular-nums text-stage-text-muted" aria-label={t('room.participants')}>
        {count}/{capacity}
      </span>
      <NetworkStatusIndicator />
    </div>
  )
}
