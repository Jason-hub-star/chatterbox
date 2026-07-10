import { create } from 'zustand'
import { listFriends, type FriendEntry, type PendingInEntry } from '@/lib/friends'

// FriendSystem(PROFILE-04) — 친구/요청 목록 + friends_presence 접속상태(LoL식 로비 상시 패널).
// SDK 채널 객체는 usePresence 훅이 보유(컨벤션 §2) — store 는 데이터만. barrel 금지(§12.3).
export type PresenceActivity = 'lobby' | 'room'

interface FriendStore {
  friends: FriendEntry[]
  pendingIn: PendingInEntry[]
  pendingOut: FriendEntry[]
  onlinePresence: Record<string, PresenceActivity> // users.id → 활동(접속 중인 사용자만 키 존재)
  loading: boolean
  load: (accessToken: string) => Promise<void>
  setOnlinePresence: (map: Record<string, PresenceActivity>) => void
  reset: () => void
}

const INITIAL = {
  friends: [] as FriendEntry[],
  pendingIn: [] as PendingInEntry[],
  pendingOut: [] as FriendEntry[],
  onlinePresence: {} as Record<string, PresenceActivity>,
  loading: false,
}

export const useFriendStore = create<FriendStore>((set) => ({
  ...INITIAL,

  load: async (accessToken) => {
    set({ loading: true })
    try {
      const lists = await listFriends(accessToken)
      set({ friends: lists.friends, pendingIn: lists.pending_in, pendingOut: lists.pending_out, loading: false })
    } catch {
      set({ loading: false }) // 목록 실패는 조용히(다음 realtime/재열기에서 재시도)
    }
  },
  setOnlinePresence: (onlinePresence) => set({ onlinePresence }),
  reset: () => set({ ...INITIAL }),
}))
