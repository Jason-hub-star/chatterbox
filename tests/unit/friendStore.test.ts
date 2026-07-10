import { beforeEach, describe, expect, it, vi } from 'vitest'

// FriendSystem(PROFILE-04): friendStore load(목록 반영·실패 조용)·presence 맵 세팅·reset.
const { listFriendsMock } = vi.hoisted(() => ({ listFriendsMock: vi.fn() }))
vi.mock('@/lib/friends', () => ({ listFriends: listFriendsMock }))

import { useFriendStore } from '@/stores/friendStore'

describe('friendStore (PROFILE-04)', () => {
  beforeEach(() => {
    useFriendStore.getState().reset()
    listFriendsMock.mockReset()
  })

  it('load: list-friends 응답을 상태에 반영한다', async () => {
    listFriendsMock.mockResolvedValue({
      friends: [{ user_id: 'a', display_name: 'A' }],
      pending_in: [{ friendship_id: 'f1', user_id: 'b', display_name: 'B' }],
      pending_out: [{ user_id: 'c', display_name: null }],
    })
    await useFriendStore.getState().load('tok')
    const s = useFriendStore.getState()
    expect(s.friends).toHaveLength(1)
    expect(s.pendingIn[0].friendship_id).toBe('f1')
    expect(s.pendingOut[0].user_id).toBe('c')
    expect(s.loading).toBe(false)
  })

  it('load 실패는 조용히(loading 만 해제)', async () => {
    listFriendsMock.mockRejectedValue(new Error('boom'))
    await useFriendStore.getState().load('tok')
    expect(useFriendStore.getState().loading).toBe(false)
    expect(useFriendStore.getState().friends).toHaveLength(0)
  })

  it('presence 맵 세팅 + reset 초기화', () => {
    useFriendStore.getState().setOnlinePresence({ a: 'room', b: 'lobby' })
    expect(useFriendStore.getState().onlinePresence.a).toBe('room')
    useFriendStore.getState().reset()
    expect(useFriendStore.getState().onlinePresence).toEqual({})
  })
})
