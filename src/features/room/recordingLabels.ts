import type { RecordingPhase } from './useRoomRecording'
import type { RecordingKind } from '@/lib/rooms'

// 녹화 phase 별 표기(아이콘·i18n 키·색). RoomBottomBar(하단바 상태 뱃지)·HostConsole(시작/중지 진입) 공유.
// leaf 모듈로 분리 = react-refresh/only-export-components 회피(컴포넌트 파일에서 value export 금지) — fontScale.ts 선례.
export const REC_LABEL: Record<RecordingPhase, { icon: string; key: string; cls: string }> = {
  idle: { icon: '⏺', key: 'room.ctrlRecord', cls: 'border-stage-border text-stage-text-muted hover:text-stage-text' },
  consentPending: { icon: '⏳', key: 'room.ctrlRecordPending', cls: 'border-fire-amber text-fire-amber' },
  recording: { icon: '⏹', key: 'room.ctrlRecordStop', cls: 'border-fire-hot text-fire-hot' },
  uploading: { icon: '⏫', key: 'room.ctrlRecordUploading', cls: 'border-stage-border text-stage-text-muted' },
  uploadFailed: { icon: '⚠️', key: 'room.ctrlRecordRetry', cls: 'border-fire-hot text-fire-hot' },
}

export interface RecLabelOpts {
  uploadPct?: number | null
  /** REC-CONSENT-N — record-recording-consent 브로드캐스트의 consented_count/required_count. */
  consent?: { consented: number; required: number } | null
  /** ROOM-28 — 산출물 종류. 한국어는 영상=녹화 / 음성=녹음으로 단어가 갈린다(계약 U2). */
  kind?: RecordingKind
}

// ROOM-28: 종류로 갈리는 건 **시작·정지 2개뿐**이다. 진행 상태(동의 대기 n/N·업로드 %·재시도)는
//   종류와 무관하므로 기존 키를 공용한다 — phase 마다 2벌을 만들면 10키 × 3언어 = 30줄인데
//   실제로 다른 문구는 6줄뿐이다(계약 U2 의 "신규 4키 제한").
const VOICE_KEY: Partial<Record<RecordingPhase, string>> = {
  idle: 'room.ctrlRecordVoice',
  recording: 'room.ctrlRecordVoiceStop',
}

/** 종류별 아이콘. 음성은 무대를 안 그리므로 필름(⏺) 대신 마이크로 구분한다. */
export function recIcon(phase: RecordingPhase, kind: RecordingKind = 'stage'): string {
  if (kind === 'voice' && phase === 'idle') return '🎙'
  return REC_LABEL[phase].icon
}

// 라벨 텍스트 조립 단일 지점. 하단바만 진행률(%)을 붙이고 호스트 콘솔은 정적 라벨이던 편차를 여기서 없앤다
//   — 호스트가 실제로 보고 판단하는 자리가 콘솔인데 거기가 더 정보가 적었다.
//
// REC-CONSENT-N: consentPending 이 "⏳ 동의 대기중" 한 줄로 굳어 있어, 무응답자가 있으면 호스트는
//   "3명 중 1명 남음"인지 "아무도 안 봄"인지 구분할 수 없었다(거절만 toast 로 알렸다 — useRoomRecording:170).
//   분자/분모는 서버가 SEC-KICK-3 분모 규칙으로 계산해 보내준다(_shared/recordingConsent.ts) —
//   클라가 참가자 수를 세면 강퇴자 처리가 갈려 서버 게이트와 어긋난다.
export function recLabelText(
  phase: RecordingPhase,
  t: (key: string, opts?: Record<string, unknown>) => string,
  opts: RecLabelOpts = {},
): string {
  if (phase === 'uploading' && typeof opts.uploadPct === 'number') {
    return `${t(REC_LABEL.uploading.key)} ${opts.uploadPct}%`
  }
  if (phase === 'consentPending' && opts.consent && opts.consent.required > 0) {
    return t('room.ctrlRecordPendingN', { done: opts.consent.consented, total: opts.consent.required })
  }
  const voiceKey = opts.kind === 'voice' ? VOICE_KEY[phase] : undefined
  return t(voiceKey ?? REC_LABEL[phase].key)
}
