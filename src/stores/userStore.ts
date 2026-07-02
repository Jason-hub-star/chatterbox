import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface UserStore {
  session: Session | null
  user: User | null
  ready: boolean
  // init: 저장된 세션 복원 + auth 변경 구독. 새로고침 후에도 세션 유지(supabase-js가 localStorage에 보존).
  init: () => () => void
}

export const useUserStore = create<UserStore>((set) => ({
  session: null,
  user: null,
  ready: false,

  init: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, user: data.session?.user ?? null, ready: true })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null })
    })

    return () => sub.subscription.unsubscribe()
  },
}))
