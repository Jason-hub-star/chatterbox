import { useTranslation } from 'react-i18next'

interface Props {
  isViewer: boolean
  micEnabled: boolean
  mutedByHost: boolean
  handRaised: boolean
  connected: boolean
  mixerOpen: boolean
  pipOpen: boolean
  onToggleMic: () => void
  onToggleHand: () => void
  onReaction: () => void
  onToggleMixer: () => void
  onTogglePip: () => void
  onLeave: () => void
}

export default function RoomBottomBar({
  isViewer,
  micEnabled,
  mutedByHost,
  handRaised,
  connected,
  mixerOpen,
  pipOpen,
  onToggleMic,
  onToggleHand,
  onReaction,
  onToggleMixer,
  onTogglePip,
  onLeave,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3 sm:gap-3">
      {/* 마이크(배우) / 손들기(관전) */}
      {isViewer ? (
        <button
          onClick={onToggleHand}
          disabled={!connected}
          aria-pressed={handRaised}
          className="flex items-center gap-1.5 rounded-lg border border-fire-amber px-3 py-1.5 text-xs font-semibold text-fire-amber transition-colors hover:bg-fire-amber/10 disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm"
          title={t('room.raiseHand')}
        >
          <span>✋</span>
          <span className="hidden sm:inline">{handRaised ? t('room.lowerHand') : t('room.raiseHand')}</span>
        </button>
      ) : (
        <button
          onClick={onToggleMic}
          disabled={!connected || mutedByHost}
          className="flex items-center gap-1.5 rounded-lg bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base transition-colors disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm"
          title={micEnabled ? t('room.micOff') : t('room.micOn')}
        >
          <span>{micEnabled ? '🎙' : '🔇'}</span>
          <span className="hidden sm:inline">{micEnabled ? t('room.micOff') : t('room.micOn')}</span>
        </button>
      )}

      {/* 음소거 상태 경고(배우 전용) */}
      {mutedByHost && !isViewer && (
        <span className="text-[10px] text-fire-hot sm:text-xs" role="status">
          {t('room.mutedByHost')}
        </span>
      )}

      {/* 리액션 버튼 */}
      <button
        onClick={onReaction}
        disabled={!connected}
        className="flex items-center gap-1.5 rounded-lg border border-stage-border px-3 py-1.5 text-xs font-semibold text-stage-text-muted transition-colors hover:text-stage-text disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm"
        title={t('room.ctrlReaction')}
      >
        <span>👋</span>
        <span className="hidden sm:inline">{t('room.ctrlReaction')}</span>
      </button>

      {/* 헤드폰 → 음량 믹서 토글(전원 — 듣기 볼륨은 로컬 권리) */}
      <button
        onClick={onToggleMixer}
        disabled={!connected}
        aria-pressed={mixerOpen}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm ${
          mixerOpen ? 'border-fire-amber text-fire-amber' : 'border-stage-border text-stage-text-muted hover:text-stage-text'
        }`}
        title={t('room.ctrlHeadphone')}
      >
        <span>🎧</span>
        <span className="hidden sm:inline">{t('room.ctrlHeadphone')}</span>
      </button>

      {/* 녹음 → defer(Egress 엔진 부재) — 비활성 '준비 중', 가짜 녹화 금지 */}
      <button
        disabled
        className="flex items-center gap-1.5 rounded-lg border border-stage-border/40 px-3 py-1.5 text-[10px] font-semibold text-stage-text-muted/40 sm:px-4 sm:py-2 sm:text-xs"
        title={t('room.ctrlRecordSoon')}
      >
        <span>⏺</span>
        <span className="hidden sm:inline">{t('room.ctrlRecord')}</span>
      </button>

      {/* 아바타/카메라 → self PiP 미리보기 토글(배우 전용 — 관전자는 트래킹 없음) */}
      {!isViewer && (
        <button
          onClick={onTogglePip}
          disabled={!connected}
          aria-pressed={pipOpen}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm ${
            pipOpen ? 'border-fire-amber text-fire-amber' : 'border-stage-border text-stage-text-muted hover:text-stage-text'
          }`}
          title={t('room.ctrlAvatar')}
        >
          <span>🎭</span>
          <span className="hidden sm:inline">{t('room.ctrlAvatar')}</span>
        </button>
      )}

      {/* 나가기 */}
      <button
        onClick={onLeave}
        className="ml-auto flex items-center gap-1.5 rounded-lg border border-stage-border px-3 py-1.5 text-xs font-semibold text-stage-text-muted transition-colors hover:text-stage-text sm:px-4 sm:py-2 sm:text-sm"
        title={t('room.leave')}
      >
        <span>🚪</span>
        <span className="hidden sm:inline">{t('room.leave')}</span>
      </button>
    </div>
  )
}
