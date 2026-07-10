import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useUserStore } from '@/stores/userStore'
import { useRoomStore } from '@/stores/roomStore'
import { useFriendStore, type PresenceActivity } from '@/stores/friendStore'

// friends_presence(contracts/FriendSystem.md) — LoL식 전역 접속상태.
// key=users.id, payload.activity 는 roomStore.currentRoomId 파생(방에 있으면 '공연 중').
// 표시단(FriendsPanel)이 친구(accepted)만 렌더 → 비친구 presence 는 자연 필터.
// ponytail: roomId 공유(따라가기)는 공개방 판별 seam 확보 후(비공개 방 노출 방지) — 후속.
export function usePresence() {
  const appUserId = useUserStore((s) => s.appUserId)

  useEffect(() => {
    if (!appUserId) return
    let activity: PresenceActivity = useRoomStore.getState().currentRoomId ? 'room' : 'lobby'
    const ch = supabase.channel('friends_presence', { config: { presence: { key: appUserId } } })

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<{ activity?: PresenceActivity }>()
      const map: Record<string, PresenceActivity> = {}
      for (const [key, metas] of Object.entries(state)) {
        map[key] = metas[0]?.activity === 'room' ? 'room' : 'lobby'
      }
      useFriendStore.getState().setOnlinePresence(map)
    })

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track({ activity })
    })

    // 방 입장/퇴장 → 활동 갱신(재트랙). 고빈도 아님(방 컨텍스트 전이 시에만).
    const unsub = useRoomStore.subscribe((s) => {
      const next: PresenceActivity = s.currentRoomId ? 'room' : 'lobby'
      if (next !== activity) {
        activity = next
        void ch.track({ activity })
      }
    })

    return () => {
      unsub()
      useFriendStore.getState().setOnlinePresence({})
      void supabase.removeChannel(ch)
    }
  }, [appUserId])
}
