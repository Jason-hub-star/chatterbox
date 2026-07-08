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
  // LiveKit 연결 품질(6인 실증 — 참가자별 열화 감지). 값은 livekit-client ConnectionQuality 문자열.
  connectionQuality?: 'excellent' | 'good' | 'poor' | 'lost' | 'unknown'
}

// DataChannel 'chat' 토픽 메시지 (WebRTC.md DataChannel Multiplexing).
// ponytail: messages 테이블 영속화·sanitize 3단계(SecurityPolicies §6.4)는 Phase 2.
// 출력 XSS는 React 기본 이스케이프로 커버(dangerouslySetInnerHTML 미사용).
export interface ChatMessage {
  id: string
  sender: string
  text: string
  ts: number
  isLocal: boolean
}

// 현재 이 사용자가 속한 방의 DB 컨텍스트 (Phase 2). LiveKit 연결 상태와 별개.
export type RoomStatus = 'waiting' | 'live' | 'ended'
// room_participants.role. 호스트는 rooms.host_id 로 별도 판정(이 필드는 참가자 역할만).
export type ParticipantRole = 'actor' | 'viewer'
export interface RoomContext {
  currentRoomId: string | null
  roomStatus: RoomStatus | null
  hostId: string | null           // rooms.host_id (users.id) — room-authority 발신자 판별(후속)
  myParticipantId: string | null  // 내 room_participants.id
  mySlotIndex: number | null
  // 내 역할(ViewerGate.md §Store 의존성 roomStore.role). 뷰어 권한 게이트(A-SEAM-4)·MobileViewer(B)가 읽는다.
  myRole: ParticipantRole | null
}

interface RoomStore {
  // 상태
  connectionState: ConnectionState
  participants: RoomParticipant[]
  messages: ChatMessage[]
  micEnabled: boolean
  mutedByHost: boolean            // 호스트가 내 마이크를 강제 음소거(HOST-08)
  error: string | null
  // 방 컨텍스트 (Phase 2)
  currentRoomId: string | null
  roomStatus: RoomStatus | null
  hostId: string | null
  myParticipantId: string | null
  mySlotIndex: number | null
  myRole: ParticipantRole | null
  // 액션
  setConnectionState: (state: ConnectionState) => void
  setParticipants: (participants: RoomParticipant[]) => void
  addMessage: (message: ChatMessage) => void
  setMicEnabled: (enabled: boolean) => void
  setMutedByHost: (muted: boolean) => void
  setError: (error: string | null) => void
  setRoomContext: (ctx: Partial<RoomContext>) => void
  reset: () => void
}

const INITIAL = {
  connectionState: 'DISCONNECTED' as ConnectionState,
  participants: [] as RoomParticipant[],
  messages: [] as ChatMessage[],
  micEnabled: false,
  mutedByHost: false,
  error: null as string | null,
  currentRoomId: null as string | null,
  roomStatus: null as RoomStatus | null,
  hostId: null as string | null,
  myParticipantId: null as string | null,
  mySlotIndex: null as number | null,
  myRole: null as ParticipantRole | null,
}

export const useRoomStore = create<RoomStore>((set) => ({
  ...INITIAL,

  setConnectionState: (connectionState) => set({ connectionState }),
  setParticipants: (participants) => set({ participants }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  setMicEnabled: (micEnabled) => set({ micEnabled }),
  setMutedByHost: (mutedByHost) => set({ mutedByHost }),
  setError: (error) => set({ error }),
  setRoomContext: (ctx) => set({ ...ctx }),
  reset: () => set({ ...INITIAL }),
}))
