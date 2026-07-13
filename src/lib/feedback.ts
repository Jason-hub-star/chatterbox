import { supabase } from '@/lib/supabase'
import { callFn } from '@/lib/edgeFn'

// 인앱 피드백/문의(ISS-04 창구) — 쓰기는 Edge(create-feedback)가 레이트리밋·diag 화이트리스트를
// 강제, 조회는 RLS 본인 행만(접수 상태 추적). 진단 번들은 opt-in — 서버가 허용 키만 저장.
export const FEEDBACK_CATEGORIES = ['avatar', 'room', 'audio', 'other'] as const
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]

export interface FeedbackDiag {
  avatar_job_id?: string
  avatar_url?: string
  user_agent?: string
  app_url?: string
}

export const createFeedback = (
  accessToken: string,
  payload: { category: FeedbackCategory; description: string; diag?: FeedbackDiag },
) => callFn<{ ok: boolean; id: string }>('create-feedback', accessToken, payload)

export interface MyFeedback {
  id: string
  category: string
  status: 'received' | 'investigating' | 'fixed' | 'closed'
  created_at: string
}

// 내 문의 목록(최근 5건) — feedback_select_own RLS.
export async function fetchMyFeedback(): Promise<MyFeedback[]> {
  const { data, error } = await supabase
    .from('feedback')
    .select('id, category, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw new Error(error.message)
  return (data ?? []) as MyFeedback[]
}
