import { create } from 'zustand'
import { listFriends, type FriendEntry, type PendingInEntry } from '@/lib/friends'

// FriendSystem(PROFILE-04) — 친구/요청 목록 + 접속상태(LoL식 로비 상시 패널).
// presence(DP-1 재설계): 전역 채널 폐기 → list-friends 응답의 online/activity 에서 파생. barrel 금지(§12.3).
export type PresenceActivity = 'lobby' | 'room'

interface FriendStore {
  friends: FriendEntry[]
  following: FriendEntry[]
  pendingIn: PendingInEntry[]
  pendingOut: FriendEntry[]
  onlinePresence: Record<string, PresenceActivity> // users.id → 활동(온라인 친구만 키 존재)
  loading: boolean
  // 패널 개폐를 스토어에 둔다 — 친구 알림(friend_request/accepted)의 목적지가 벨과 같은 로비 헤더라
  // 라우팅으로는 못 열기 때문. 전역 CustomEvent 대신 스토어라 유닛 테스트로 검증된다.
  panelOpen: boolean
  setPanelOpen: (v: boolean) => void
  load: (accessToken: string) => Promise<void>
  reset: () => void
}

const INITIAL = {
  friends: [] as FriendEntry[],
  following: [] as FriendEntry[],
  pendingIn: [] as PendingInEntry[],
  pendingOut: [] as FriendEntry[],
  onlinePresence: {} as Record<string, PresenceActivity>,
  loading: false,
  panelOpen: false,
}

export const useFriendStore = create<FriendStore>((set) => ({
  ...INITIAL,

  setPanelOpen: (v) => set({ panelOpen: v }),

  load: async (accessToken) => {
    set({ loading: true })
    try {
      const lists = await listFriends(accessToken)
      // presence 파생(DP-1): 서버가 친구만 online/activity 판정 → 온라인 친구만 맵에 키.
      const onlinePresence: Record<string, PresenceActivity> = {}
      for (const f of lists.friends) if (f.online) onlinePresence[f.user_id] = f.activity ?? 'lobby'
      set({
        friends: lists.friends,
        following: lists.following ?? [],
        pendingIn: lists.pending_in,
        pendingOut: lists.pending_out,
        onlinePresence,
        loading: false,
      })
    } catch {
      set({ loading: false }) // 목록 실패는 조용히(다음 폴링/재열기에서 재시도)
    }
  },
  reset: () => set({ ...INITIAL }),
}))
