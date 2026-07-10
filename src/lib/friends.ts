import { callFn } from '@/lib/edgeFn'

// FriendSystem 래퍼(PROFILE-04, contracts/FriendSystem.md). 쓰기·목록 전부 Edge 경유 —
// friendships RLS 는 클라 쓰기 무정책(서버 강제), 타인 display_name 은 service 만 읽음(users RLS=본인만).
export interface FriendEntry {
  user_id: string
  display_name: string | null
  online?: boolean // DP-1: 서버가 last_active_at 로 판정(친구만). following/pending 엔 없음
  activity?: 'room' | 'lobby'
}
export interface PendingInEntry extends FriendEntry {
  friendship_id: string
}
export interface FriendLists {
  friends: FriendEntry[]
  following: FriendEntry[] // 내가 팔로우(PROFILE-05 공연시작 알림 관계, 비상호)
  pending_in: PendingInEntry[]
  pending_out: FriendEntry[]
}

export const listFriends = (accessToken: string) => callFn<FriendLists>('list-friends', accessToken, {})

export const sendFriendRequest = (accessToken: string, targetUserId: string) =>
  callFn<{ ok: boolean; status: string; friendship_id?: string }>('send-friend-request', accessToken, {
    target_user_id: targetUserId,
  })

export const respondFriendRequest = (accessToken: string, friendshipId: string, action: 'accept' | 'reject') =>
  callFn<{ ok: boolean; status: string }>('respond-friend-request', accessToken, {
    friendship_id: friendshipId,
    action,
  })

export const removeFriend = (accessToken: string, targetUserId: string) =>
  callFn<{ ok: boolean }>('remove-friend', accessToken, { target_user_id: targetUserId })

export const setFollow = (accessToken: string, targetUserId: string, follow: boolean) =>
  callFn<{ ok: boolean; following: boolean }>('set-follow', accessToken, { target_user_id: targetUserId, follow })
