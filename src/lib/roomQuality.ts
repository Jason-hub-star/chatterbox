import type { ConnectionState, RoomParticipant } from '@/stores/roomStore'

// 우상단 네트워크 인디케이터의 표시 등급(ROOM-10·25). 연결 상태(연결 자체)와 LiveKit 연결 품질을
// 하나의 등급으로 통합한다: 연결이 CONNECTED 가 아니면 연결 상태가 우선(품질은 무의미),
// CONNECTED 면 내 로컬 참가자의 품질 enum(livekit ConnectionQuality)을 3단계로 낮춘다.
// ponytail: RTT·packet loss 세부(NetworkStatusIndicator.md networkStore)는 트랙 B/후속 — 여기선 enum만.
export type NetTier =
  | 'good'
  | 'fair'
  | 'poor'
  | 'connecting'
  | 'reconnecting'
  | 'offline'
  | 'unknown'

type Quality = NonNullable<RoomParticipant['connectionQuality']>

export function netTier(state: ConnectionState, quality: Quality | undefined): NetTier {
  if (state === 'CONNECTING') return 'connecting'
  if (state === 'RECONNECTING') return 'reconnecting'
  if (state === 'DISCONNECTED' || state === 'FAILED') return 'offline'
  // state === 'CONNECTED': 품질 enum → 3단계
  switch (quality) {
    case 'excellent':
    case 'good':
      return 'good'
    case 'poor':
      return 'fair'
    case 'lost':
      return 'poor'
    default:
      return 'unknown' // 'unknown' 또는 미측정(undefined)
  }
}
