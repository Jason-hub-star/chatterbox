import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// SSOT: contracts/AuthPage.md · state-machines/Auth.md
// Phase 0 범위: 이메일 로그인/회원가입 + 세션유지.
// ponytail: OAuth(AUTH-02)·비밀번호 재설정(G-54)·이메일 인증 UI(G-55)는 Phase 2에서 추가.
type AuthState =
  | 'UNAUTHENTICATED'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'PENDING_VERIFICATION'

interface UserStore {
  session: Session | null
  user: User | null
  authState: AuthState
  // ready: getSession 복원 완료 여부. ProtectedRoute 가 판단 전 깜빡 리다이렉트하지 않도록 게이트.
  ready: boolean
  error: string | null
  // init: 저장된 세션 복원 + auth 변경 구독. supabase-js 가 localStorage 에 세션을 보존하므로 새로고침 후에도 유지.
  init: () => () => void
  login: (email: string, password: string) => Promise<boolean>
  signUpWithEmail: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
}

export const useUserStore = create<UserStore>((set) => ({
  session: null,
  user: null,
  authState: 'UNAUTHENTICATED',
  ready: false,
  error: null,

  init: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({
        session: data.session,
        user: data.session?.user ?? null,
        authState: data.session ? 'AUTHENTICATED' : 'UNAUTHENTICATED',
        ready: true,
      })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user: session?.user ?? null,
        authState: session ? 'AUTHENTICATED' : 'UNAUTHENTICATED',
      })
    })

    return () => sub.subscription.unsubscribe()
  },

  login: async (email, password) => {
    set({ authState: 'AUTHENTICATING', error: null })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // enumeration 방지: 실패 사유를 구체화하지 않는다 (AuthPage.md MUST NOT).
      set({ authState: 'UNAUTHENTICATED', error: '이메일 또는 비밀번호가 올바르지 않습니다.' })
      return false
    }
    set({ session: data.session, user: data.user, authState: 'AUTHENTICATED', error: null })
    return true
  },

  signUpWithEmail: async (email, password) => {
    set({ authState: 'AUTHENTICATING', error: null })
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      set({ authState: 'UNAUTHENTICATED', error: error.message })
      return false
    }
    // 이메일 확인 OFF: session 즉시 발급 → 인증 완료. ON: session 없음 → 인증 대기.
    if (data.session) {
      set({ session: data.session, user: data.user, authState: 'AUTHENTICATED', error: null })
      return true
    }
    set({ user: data.user, authState: 'PENDING_VERIFICATION', error: null })
    return true
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, authState: 'UNAUTHENTICATED', error: null })
  },
}))
