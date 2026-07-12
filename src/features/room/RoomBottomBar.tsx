import { useTranslation } from 'react-i18next'
import type { RecordingPhase } from './useRoomRecording'

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
  // V-3 녹화(호스트만 노출 — 서버가 host 재검증). phase 별 라벨/동작은 useRoomRecording 상태기계.
  recordPhase?: RecordingPhase
  onToggleRecord?: () => void
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
  recordPhase = 'idle',
  onToggleRecord,
}: Props) {
  const { t } = useTranslation()

  // 녹화 버튼 phase 별 표기(아이콘·라벨·색). uploading 은 진행 중이라 클릭 불가.
  const REC_LABEL: Record<RecordingPhase, { icon: string; key: string; cls: string }> = {
    idle: { icon: '⏺', key: 'room.ctrlRecord', cls: 'border-stage-border text-stage-text-muted hover:text-stage-text' },
    consentPending: { icon: '⏳', key: 'room.ctrlRecordPending', cls: 'border-fire-amber text-fire-amber' },
    recording: { icon: '⏹', key: 'room.ctrlRecordStop', cls: 'border-fire-hot text-fire-hot' },
    uploading: { icon: '⏫', key: 'room.ctrlRecordUploading', cls: 'border-stage-border text-stage-text-muted' },
    uploadFailed: { icon: '⚠️', key: 'room.ctrlRecordRetry', cls: 'border-fire-hot text-fire-hot' },
  }
  const rec = REC_LABEL[recordPhase]

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

      {/* 무대 녹화(V-3, 호스트 전용) — 동의 게이트→합성 캡처→R2 업로드. 상태기계는 useRoomRecording. */}
      {onToggleRecord && (
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
