import type { RecordingPhase } from './useRoomRecording'

// 녹화 phase 별 표기(아이콘·i18n 키·색). RoomBottomBar(하단바 상태 뱃지)·HostConsole(시작/중지 진입) 공유.
// leaf 모듈로 분리 = react-refresh/only-export-components 회피(컴포넌트 파일에서 value export 금지) — fontScale.ts 선례.
export const REC_LABEL: Record<RecordingPhase, { icon: string; key: string; cls: string }> = {
  idle: { icon: '⏺', key: 'room.ctrlRecord', cls: 'border-stage-border text-stage-text-muted hover:text-stage-text' },
  consentPending: { icon: '⏳', key: 'room.ctrlRecordPending', cls: 'border-fire-amber text-fire-amber' },
  recording: { icon: '⏹', key: 'room.ctrlRecordStop', cls: 'border-fire-hot text-fire-hot' },
  uploading: { icon: '⏫', key: 'room.ctrlRecordUploading', cls: 'border-stage-border text-stage-text-muted' },
  uploadFailed: { icon: '⚠️', key: 'room.ctrlRecordRetry', cls: 'border-fire-hot text-fire-hot' },
}
