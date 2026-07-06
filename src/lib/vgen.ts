import { supabase } from '@/lib/supabase'
import type { VgenJob, VgenStatus } from '@/types/vgen'
import type { VgenResolution } from '@/lib/fal'

// VGEN Edge Function 경계 래퍼 + Realtime 구독. dub.ts / rooms.ts 와 동일 패턴(callFn + 타입드 래퍼).
// 와이어는 snake_case(DB/API), React 안은 camelCase.
// SSOT: docs/API-SURFACE.md, docs/reference/patterns/falai-vgen-pipeline.md

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function callFn<T>(name: string, accessToken: string, body: unknown): Promise<T> {
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error ? String(json.error) : `${name} 실패 (${res.status})`)
  return json as T
}

function mapJob(r: Record<string, unknown>): VgenJob {
  return {
    id: r.id as string,
    roomId: r.room_id as string,
    triggeredBy: r.triggered_by as string,
    promptText: r.prompt_text as string,
    status: r.status as VgenStatus,
    creditCost: (r.credit_cost as number) ?? 0,
    resultUrl: (r.result_url as string | null) ?? null,
    durationSec: (r.duration_sec as number) ?? 0,
    failureReason: (r.failure_reason as string | null) ?? null,
    createdAt: r.created_at as string,
  }
}

// ── Edge Function 래퍼 ──────────────────────────────────────────────
export const triggerVgen = (accessToken: string, roomId: string, promptText: string, durationSec: number, resolution: VgenResolution) =>
  callFn<{ job_id: string; status: VgenStatus; credit_cost: number; cached?: boolean }>(
    'trigger-vgen', accessToken, { room_id: roomId, prompt_text: promptText, duration_sec: durationSec, resolution },
  )

// 개떡 입력 → Seedance 최적 프롬프트 LLM 정제(무과금·미리보기용). 결과는 편집 가능.
export const refineVgenPrompt = (accessToken: string, roomId: string, roughPrompt: string) =>
  callFn<{ refined_prompt: string }>(
    'refine-vgen-prompt', accessToken, { room_id: roomId, rough_prompt: roughPrompt },
  )

export const getVgenUrl = (accessToken: string, jobId: string) =>
  callFn<{ url: string }>('get-vgen-url', accessToken, { job_id: jobId }).then((r) => r.url)

// ── 조회 + Realtime ─────────────────────────────────────────────────
export async function fetchRecentJobs(roomId: string, limit = 5): Promise<VgenJob[]> {
  const { data } = await supabase
    .from('vgen_jobs').select('*')
    .eq('room_id', roomId).order('created_at', { ascending: false }).limit(limit)
  return (data ?? []).map((r) => mapJob(r as Record<string, unknown>))
}

// job status 실시간 구독(postgres_changes). vgen-webhook 의 DB UPDATE 가 자동 방송된다.
export function subscribeToVgenJob(jobId: string, onChange: (job: VgenJob) => void): () => void {
  const ch = supabase
    .channel(`vgen_job:${jobId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'vgen_jobs', filter: `id=eq.${jobId}` },
      (p) => onChange(mapJob(p.new as Record<string, unknown>)),
    )
    .subscribe()
  return () => { void supabase.removeChannel(ch) }
}
