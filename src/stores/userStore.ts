import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { isValidAvatarUrl } from '@/lib/avatars'

// SSOT: contracts/AuthPage.md · state-machines/Auth.md
// Phase 0 범위: 이메일 로그인/회원가입 + 세션유지.
// 인증 복구(A-FUNC-2): 비밀번호 재설정 요청(G-54)·인증메일 재전송(G-55)·재설정 완료 추가.
// OAuth(AUTH-02): loginWithOAuth 배선됨 — Supabase 대시보드 프로바이더(google/kakao) 설정 후
// VITE_OAUTH_PROVIDERS 로 버튼 노출(LoginPage). 리다이렉트 복귀 세션은 init 의 onAuthStateChange 가 흡수.
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
  // creditBalance: 내 VGEN 크레딧 잔액. credits 테이블 로드 + Realtime 구독으로 갱신.
  creditBalance: number
  // appUserId: users.id(auth_id 아님). credits/vgen 등 users.id 참조용.
  appUserId: string | null
  // 온보딩(G-ONB): 신규 가입자는 'intro'로 시작(handle_new_user 트리거), 기존 유저는 null(가이드 미노출).
  // step ∈ {'intro','genre'} 에서만 OnboardingGuide 노출. 완료/건너뛰기 → 'done'.
  onboardingStep: string | null
  preferredGenres: string[]
  // completeOnboarding: 온보딩 종료(+선택 장르 저장). users_update_own 로 본인 행 직접 update(비민감 컬럼).
  completeOnboarding: (genres?: string[]) => Promise<void>
  // init: 저장된 세션 복원 + auth 변경 구독. supabase-js 가 localStorage 에 세션을 보존하므로 새로고침 후에도 유지.
  init: () => () => void
  login: (email: string, password: string) => Promise<boolean>
  // OAuth 간편로그인 — 성공 시 프로바이더로 리다이렉트되므로 반환값은 "시작 성공" 여부.
  loginWithOAuth: (provider: 'google' | 'kakao') => Promise<boolean>
  signUpWithEmail: (email: string, password: string) => Promise<boolean>
  // 인증 복구(A-FUNC-2). enumeration 방지: 요청/재전송은 성공 여부와 무관하게 동일 안내를 보이게 boolean 만 반환.
  requestPasswordReset: (email: string) => Promise<boolean>
  resendVerification: (email: string) => Promise<boolean>
  // 재설정 링크로 진입한 복구 세션에서 새 비번 확정(/reset).
  updatePassword: (newPassword: string) => Promise<boolean>
  // setMyAvatar: 내 users.avatar_url 갱신(RLS users_update_own 로 본인 행 직접 update).
  setMyAvatar: (url: string) => Promise<boolean>
  logout: () => Promise<void>
}

// 크레딧 잔액 로드 + Realtime 구독(생성 후 차감/환불 자동 반영). 단일 활성 채널.
let creditChannel: ReturnType<typeof supabase.channel> | null = null
async function loadCredits(userId: string, set: (partial: Partial<UserStore>) => void) {
  const { data } = await supabase.from('credits').select('balance').eq('user_id', userId).maybeSingle()
  set({ creditBalance: (data?.balance as number | undefined) ?? 0 })
  if (creditChannel) void supabase.removeChannel(creditChannel)
  creditChannel = supabase
    .channel(`credits:${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'credits', filter: `user_id=eq.${userId}` },
      (p) => set({ creditBalance: (p.new as { balance: number }).balance }),
    )
    .subscribe()
}

// 내 users 프로필(avatar_url + id + 온보딩) 로드 + 크레딧 로드. 실패해도 조용히 fallback.
async function loadAvatarUrl(authId: string, set: (partial: Partial<UserStore>) => void) {
  const { data } = await supabase
    .from('users')
    .select('id, avatar_url, onboarding_step, preferred_genres')
    .eq('auth_id', authId)
    .maybeSingle()
  set({
    avatarUrl: (data?.avatar_url as string | null) ?? null,
    appUserId: (data?.id as string | undefined) ?? null,
    onboardingStep: (data?.onboarding_step as string | null) ?? null,
    preferredGenres: (data?.preferred_genres as string[] | null) ?? [],
  })
  if (data?.id) void loadCredits(data.id as string, set)
}

export const useUserStore = create<UserStore>((set, get) => ({
  session: null,
  user: null,
  authState: 'UNAUTHENTICATED',
  ready: false,
  error: null,
  avatarUrl: null,
  creditBalance: 0,
  appUserId: null,
  onboardingStep: null,
  preferredGenres: [],

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

  loginWithOAuth: async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/lobby` },
    })
    if (error) {
      set({ error: '간편로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' })
      return false
    }
    return true // 브라우저가 프로바이더로 이동
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

  requestPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    })
    return !error
  },

  resendVerification: async (email) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    return !error
  },

  updatePassword: async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return !error
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

  completeOnboarding: async (genres) => {
    const authId = get().user?.id
    // 낙관적 종료: DB 실패해도 이번 세션엔 가이드를 닫는다(재로그인 시 재시도 — 무해).
    set({ onboardingStep: 'done', ...(genres ? { preferredGenres: genres } : {}) })
    if (!authId) return
    const patch: { onboarding_step: string; preferred_genres?: string[] } = { onboarding_step: 'done' }
    if (genres && genres.length) patch.preferred_genres = genres
    await supabase.from('users').update(patch).eq('auth_id', authId)
  },

  logout: async () => {
    await supabase.auth.signOut()
    if (creditChannel) { void supabase.removeChannel(creditChannel); creditChannel = null }
    set({ session: null, user: null, authState: 'UNAUTHENTICATED', error: null, avatarUrl: null, creditBalance: 0, appUserId: null })
  },
}))
