import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecordingPhase } from './useRoomRecording'
import { REC_LABEL, recLabelText } from './recordingLabels'

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
  onOpenReactions: () => void // UX-KBD-WHEEL: 리액션 휠 sticky 개화(키보드/SR·터치 진입 경로)
  onReportProblem: () => void // ISS-04 창구: 방 안 진입점(카테고리 '방·무대'/'소리·마이크'를 겪는 자리)
  onLeave: () => void
  // V-3 녹화(호스트만 노출 — 서버가 host 재검증). phase 별 라벨/동작은 useRoomRecording 상태기계.
  recordPhase?: RecordingPhase
  onToggleRecord?: () => void
  uploadPct?: number | null // UX-UPLOAD-PROGRESS: 업로드 중 진행률(%) — 라벨에 병기
  consentTally?: { consented: number; required: number } | null // REC-CONSENT-N: 동의 n/N
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
  onOpenReactions,
  onReportProblem,
  onLeave,
  recordPhase = 'idle',
  onToggleRecord,
  uploadPct,
  consentTally,
}: Props) {
  const { t } = useTranslation()
  const rec = REC_LABEL[recordPhase]
  // 라벨 조립은 recordingLabels 단일 지점(업로드 % · 동의 n/N) — HostConsole 과 문구가 갈리지 않게.
  const recLabel = recLabelText(recordPhase, t, { uploadPct, consent: consentTally })

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] sm:gap-3">
      {/* 마이크(배우) — 손들기(관전)는 ROOM-21 무대 승격 완성까지 가림(prop·i18n 보존, 부활 시 JSX만 복원).
          FB-MIC-DUP 연타 가드는 여기가 아니라 `useLiveKitRoom.toggleMic`(공유 함수)에 있다 —
          호스트 콘솔 등 다른 호출부가 생겨도 한 곳에서 막히게. */}
      {!isViewer && (
        <button
          onClick={onToggleMic}
          disabled={!connected || mutedByHost}
          aria-label={micEnabled ? t('room.micOff') : t('room.micOn')}
          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base transition-colors disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm"
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
          aria-label={t('room.ctrlHeadphone')}
          className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm ${
            mixerOpen ? 'border-fire-amber text-fire-amber' : 'border-stage-border text-stage-text-muted hover:text-stage-text'
          }`}
          title={t('room.ctrlHeadphone')}
        >
          <span>🎧</span>
          <span className="hidden sm:inline">{t('room.ctrlHeadphone')}</span>
        </button>
        {mixerSlot}
      </div>

      {/* 리액션(UX-KBD-WHEEL) — 우클릭·롱프레스 외 키보드/SR·모바일 진입점. 휠 sticky 개화. */}
      <button
        onClick={onOpenReactions}
        disabled={!connected}
        aria-label={t('room.openReactions')}
        title={t('room.openReactions')}
        className="flex min-h-11 items-center gap-1.5 rounded-lg border border-stage-border px-3 py-1.5 text-xs font-semibold text-stage-text-muted transition-colors hover:text-stage-text disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm"
      >
        <span aria-hidden>😊</span>
        <span className="hidden sm:inline">{t('room.openReactions')}</span>
      </button>

      {/* 무대 녹화 상태 뱃지(V-3) — 시작(idle)은 HostConsole 진입, 하단바는 진행 상태만(호스트 중지·재시도). */}
      {onToggleRecord && recordPhase !== 'idle' && (
        <button
          data-record-button={recordPhase}
          onClick={onToggleRecord}
          disabled={!connected || recordPhase === 'uploading'}
          aria-label={recLabel}
          className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm ${rec.cls}`}
          title={recLabel}
        >
          <span className={recordPhase === 'recording' ? 'animate-pulse' : undefined}>{rec.icon}</span>
          <span className="hidden sm:inline">{recLabel}</span>
        </button>
      )}

      {/* 문제 알리기(ISS-04) — 방·소리 문제를 겪는 자리에서 바로. 연결 끊겨도 눌러야 한다
          (연결 실패 자체가 신고감이므로 disabled 를 걸지 않는다 — 형제 버튼들과 다른 유일한 이유). */}
      <button
        onClick={onReportProblem}
        aria-label={t('feedback.button')}
        title={t('feedback.button')}
        className="flex min-h-11 items-center gap-1.5 rounded-lg border border-stage-border px-3 py-1.5 text-xs font-semibold text-stage-text-muted transition-colors hover:text-stage-text sm:px-4 sm:py-2 sm:text-sm"
      >
        <span aria-hidden>🛟</span>
        <span className="hidden sm:inline">{t('feedback.button')}</span>
      </button>

      {/* 나가기 */}
      <button
        onClick={onLeave}
        aria-label={t('room.leave')}
        className="ml-auto flex min-h-11 items-center gap-1.5 rounded-lg border border-stage-border px-3 py-1.5 text-xs font-semibold text-stage-text-muted transition-colors hover:text-stage-text sm:px-4 sm:py-2 sm:text-sm"
        title={t('room.leave')}
      >
        <span>🚪</span>
        <span className="hidden sm:inline">{t('room.leave')}</span>
      </button>
    </div>
  )
}
