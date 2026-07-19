import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Supabase env 누락 — .env 의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 확인하세요.',
  )
}

export const supabase = createClient(url, anonKey)

// DEV 전용 E2E 훅: 하네스가 refreshSession() 등으로 세션 갱신을 강제 트리거(RM-REJOIN 재현).
// 프로드 번들에선 tree-shake 로 소거된다(__streamAvatar 등과 동형).
if (import.meta.env.DEV) {
  ;(window as unknown as { __supabase?: typeof supabase }).__supabase = supabase
}
