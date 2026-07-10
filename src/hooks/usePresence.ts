import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useUserStore } from '@/stores/userStore'

// presence 근본 재설계(DP-1, 델타 감사) — 전역 Realtime 채널 폐기.
// 온라인 여부는 본인 users.last_active_at heartbeat 로만 기록(RLS auth_id=auth.uid() → 본인 행만).
// 친구의 online/activity 는 list-friends 가 친구관계 서버검증 후 반환 → 전역 노출 0.
// activity(공연 중 여부)는 서버가 활성 room_participants 로 판정하므로 클라는 heartbeat 만.
const HEARTBEAT_MS = 30_000

export function usePresence() {
  const appUserId = useUserStore((s) => s.appUserId)

  useEffect(() => {
    if (!appUserId) return
    const beat = () => {
      void supabase.from('users').update({ last_active_at: new Date().toISOString() }).eq('id', appUserId)
    }
    beat() // 로그인 즉시 1회
    const id = setInterval(beat, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [appUserId])
}
