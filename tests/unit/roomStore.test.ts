import { beforeEach, describe, expect, it } from 'vitest'
import { useRoomStore, type RoomParticipant } from '@/stores/roomStore'

// roomStore 는 순수 상태 컨테이너(zustand만 import) — 네트워크·SDK 목킹 불필요.
describe('roomStore', () => {
  beforeEach(() => {
    useRoomStore.getState().reset()
  })

  it('초기 상태는 DISCONNECTED·빈 참가자', () => {
    const s = useRoomStore.getState()
    expect(s.connectionState).toBe('DISCONNECTED')
    expect(s.participants).toEqual([])
    expect(s.micEnabled).toBe(false)
    expect(s.error).toBeNull()
  })

  it('연결 상태 전이를 반영한다', () => {
    useRoomStore.getState().setConnectionState('CONNECTING')
    expect(useRoomStore.getState().connectionState).toBe('CONNECTING')
    useRoomStore.getState().setConnectionState('CONNECTED')
    expect(useRoomStore.getState().connectionState).toBe('CONNECTED')
  })

  it('참가자 목록·마이크·에러를 갱신한다', () => {
    const participants: RoomParticipant[] = [
      { identity: 'a', name: '나', isLocal: true, isSpeaking: false },
      { identity: 'b', name: '상대', isLocal: false, isSpeaking: true },
    ]
    const store = useRoomStore.getState()
    store.setParticipants(participants)
    store.setMicEnabled(true)
    store.setError('연결 실패')
    const s = useRoomStore.getState()
    expect(s.participants).toHaveLength(2)
    expect(s.micEnabled).toBe(true)
    expect(s.error).toBe('연결 실패')
  })

  it('reset 은 초기 상태로 되돌린다', () => {
    const store = useRoomStore.getState()
    store.setConnectionState('FAILED')
    store.setMicEnabled(true)
    store.reset()
    const s = useRoomStore.getState()
    expect(s.connectionState).toBe('DISCONNECTED')
    expect(s.micEnabled).toBe(false)
  })
})
