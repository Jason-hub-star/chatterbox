import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecordingPhase } from './useRoomRecording'
import { REC_LABEL } from './recordingLabels'

interface Props {
  isViewer: boolean
  micEnabled: boolean
  mutedByHost: boolean
  handRaised: boolean
  connected: boolean
  mixerOpen: boolean
  mixerSlot?: ReactNode // 🎧 오디오 팝오버(AudioMixerPanel) — 버튼 relative 래퍼 안에서 버튼 위로 열린다
  onToggleMic: () => void
  onToggleHand: () => void
  onToggleMixer: () => void
  onLeave: () => void
  // V-3 녹화(호스트만 노출 — 서버가 host 재검증). phase 별 라벨/동작은 useRoomRecording 상태기계.
  recordPhase?: RecordingPhase
  onToggleRecord?: () => void
}

export default function RoomBottomBar({
  isViewer,
  micEnabled,
  mutedByHost,
  connected,
  mixerOpen,
  mixerSlot,
  onToggleMic,
  onToggleMixer,
  onLeave,
  recordPhase = 'idle',
  onToggleRecord,
}: Props) {
  const { t } = useTranslation()
  const rec = REC_LABEL[recordPhase]

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3 sm:gap-3">
      {/* 마이크(배우) — 손들기(관전)는 ROOM-21 무대 승격 완성까지 가림(prop·i18n 보존, 부활 시 JSX만 복원). */}
      {!isViewer && (
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

      {/* 오디오(🎧) → 믹서 팝오버 토글. 팝오버(mixerSlot)는 버튼 바로 위에서 열린다(relative 앵커). */}
      <div className="relative">
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
        {mixerSlot}
      </div>

      {/* 무대 녹화 상태 뱃지(V-3) — 시작(idle)은 HostConsole 진입, 하단바는 진행 상태만(호스트 중지·재시도). */}
      {onToggleRecord && recordPhase !== 'idle' && (
        <button
          data-record-button={recordPhase}
          onClick={onToggleRecord}
          disabled={!connected || recordPhase === 'uploading'}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm ${rec.cls}`}
          title={t(rec.key)}
        >
          <span className={recordPhase === 'recording' ? 'animate-pulse' : undefined}>{rec.icon}</span>
          <span className="hidden sm:inline">{t(rec.key)}</span>
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
