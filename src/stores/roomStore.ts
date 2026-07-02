import { create } from 'zustand'

// SSOT: state-machines/WebRTC.md
// Phase 1B PoC 범위: 2인 오디오 연결 상태 + 참가자 목록만.
// ponytail: ICE_TIMEOUT·CODEC_FAILED·CONNECTED_AUDIO_ONLY·재시도횟수·연결품질은 Phase 2에서 추가.
export type ConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'FAILED'

// LiveKit SDK 객체를 store에 직접 담지 않는다 (CODING-CONVENTIONS §2).
// SDK Participant → 이 UI 타입으로 매핑해서 보관한다.
export interface RoomParticipant {
  identity: string
  name: string
  isLocal: boolean
  isSpeaking: boolean
}

interface RoomStore {
  // 상태
  connectionState: ConnectionState
  participants: RoomParticipant[]
  micEnabled: boolean
  error: string | null
  // 액션
  setConnectionState: (state: ConnectionState) => void
  setParticipants: (participants: RoomParticipant[]) => void
  setMicEnabled: (enabled: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

const INITIAL = {
  connectionState: 'DISCONNECTED' as ConnectionState,
  participants: [] as RoomParticipant[],
  micEnabled: false,
  error: null as string | null,
}

export const useRoomStore = create<RoomStore>((set) => ({
  ...INITIAL,

  setConnectionState: (connectionState) => set({ connectionState }),
  setParticipants: (participants) => set({ participants }),
  setMicEnabled: (micEnabled) => set({ micEnabled }),
  setError: (error) => set({ error }),
  reset: () => set({ ...INITIAL }),
}))
