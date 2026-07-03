import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { isValidAvatarUrl } from '@/lib/avatars'

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
  // 선택한 아바타 project.json URL(users.avatar_url). null 이면 기본 아바타(resolveAvatarUrl).
  avatarUrl: string | null
  // init: 저장된 세션 복원 + auth 변경 구독. supabase-js 가 localStorage 에 세션을 보존하므로 새로고침 후에도 유지.
  init: () => () => void
  login: (email: string, password: string) => Promise<boolean>
  signUpWithEmail: (email: string, password: string) => Promise<boolean>
  // setMyAvatar: 내 users.avatar_url 갱신(RLS users_update_own 로 본인 행 직접 update).
  setMyAvatar: (url: string) => Promise<boolean>
  logout: () => Promise<void>
}

// 내 users.avatar_url 로드(로그인/세션복원 직후). 실패해도 조용히 null 유지 → 기본 아바타 fallback.
async function loadAvatarUrl(authId: string, set: (partial: Partial<UserStore>) => void) {
  const { data } = await supabase.from('users').select('avatar_url').eq('auth_id', authId).maybeSingle()
  set({ avatarUrl: (data?.avatar_url as string | null) ?? null })
}

export const useUserStore = create<UserStore>((set, get) => ({
  session: null,
  user: null,
  authState: 'UNAUTHENTICATED',
  ready: false,
  error: null,
  avatarUrl: null,

  init: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({
        session: data.session,
        user: data.session?.user ?? null,
        authState: data.session ? 'AUTHENTICATED' : 'UNAUTHENTICATED',
        ready: true,
      })
      if (data.session) void loadAvatarUrl(data.session.user.id, set)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user: session?.user ?? null,
        authState: session ? 'AUTHENTICATED' : 'UNAUTHENTICATED',
      })
      if (session) void loadAvatarUrl(session.user.id, set)
      else set({ avatarUrl: null })
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
    if (data.user) void loadAvatarUrl(data.user.id, set)
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
      if (data.user) void loadAvatarUrl(data.user.id, set)
      return true
    }
    set({ user: data.user, authState: 'PENDING_VERIFICATION', error: null })
    return true
  },

  setMyAvatar: async (url) => {
    const authId = get().user?.id
    // 우리 avatars 버킷의 project.json 만 저장(정크/비신뢰 URL 차단). 방금 배포된 아바타도 즉시 허용.
    if (!authId || !isValidAvatarUrl(url)) return false
    const { error } = await supabase.from('users').update({ avatar_url: url }).eq('auth_id', authId)
    if (error) return false
    set({ avatarUrl: url })
    return true
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, authState: 'UNAUTHENTICATED', error: null, avatarUrl: null })
  },
}))
