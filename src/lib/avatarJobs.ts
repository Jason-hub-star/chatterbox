import { supabase } from '@/lib/supabase'
import { callFn } from '@/lib/edgeFn'
import type { AvatarJob, AvatarJobStatus, AvatarJobPhase } from '@/types/avatarJob'

// 이미지→Live2D 리깅 잡 Edge 경계 래퍼 + Storage 업로드 + Realtime 구독.
// vgen.ts 패턴 복제(callFn + 타입드 래퍼 + subscribeTo*). SSOT: avatar_jobs 마이그.

function mapJob(r: Record<string, unknown>): AvatarJob {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    status: r.status as AvatarJobStatus,
    phase: (r.phase as AvatarJobPhase) ?? null,
    resultProjectUrl: (r.result_project_url as string | null) ?? null,
    error: (r.error as string | null) ?? null,
    createdAt: r.created_at as string,
    cached: r.provider === 'cache',
  }
}

// 파일 바이트 SHA-256 → 64-hex. 콘텐츠-해시 디덥 키(레버 ④) — 같은 그림 재주문을 서버가 즉시 캐시 반환.
export async function sha256Hex(file: File): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 아바타 업로드 허용 MIME → 확장자 맵(Phase 0 파리티 프로브 게이트). 버킷 allowed_mime_types
// (마이그 20260715120000)·CommissionCorner validateImage 와 3자 정합의 단일 진실. Modal 은 PIL
// 매직바이트로 포맷 무관 디코드라 확장자는 표기용(무손실 WebP=PNG 픽셀동일·파일 더 작음).
export const AVATAR_UPLOAD_MIME = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
} as const
export type AvatarUploadMime = keyof typeof AVATAR_UPLOAD_MIME

// 업로드 이미지 → avatar-uploads 버킷 `<authUid>/uploads/<uuid>.<ext>`. 반환 = object key(엣지에 넘김).
// 폴더 최상위 = auth.uid() (Storage RLS + 엣지 isSafeObjectKey 와 동일 오리진). contentType 은 원본
// 그대로(버킷 allowed_mime_types 검사와 정합) — 재인코딩 없이 네이티브 통과.
export async function uploadAvatarPng(file: File): Promise<string> {
  const ext = AVATAR_UPLOAD_MIME[file.type as AvatarUploadMime]
  if (!ext) throw new Error('지원하지 않는 이미지 형식이에요.') // 서버경계 방어(프론트 validateImage 1차)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요해요.')
  const key = `${user.id}/uploads/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from('avatar-uploads').upload(key, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return key
}

// 리깅 잡 트리거 → Modal 웹엔드포인트 spawn(엣지 경유). inputHash 있으면 디덥 히트 시 status='done'
// + result_project_url 을 즉시 반환(33분 연산 스킵).
export const createAvatarJob = (accessToken: string, objectKey: string, inputHash?: string) =>
  callFn<{ job_id: string; status: AvatarJobStatus; result_project_url?: string }>(
    'create-avatar-job', accessToken, { object_key: objectKey, input_hash: inputHash },
  )

// 내 잡 목록(재진입 — 탭 닫았다 와도 진행 중/완료 잡이 보임).
export async function fetchMyAvatarJobs(limit = 10): Promise<AvatarJob[]> {
  const { data } = await supabase
    .from('avatar_jobs').select('*')
    .order('created_at', { ascending: false }).limit(limit)
  return (data ?? []).map((r) => mapJob(r as Record<string, unknown>))
}

// job status/phase 실시간 구독(postgres_changes). 파이프라인의 service_role PATCH 가 자동 방송된다.
export function subscribeToAvatarJob(jobId: string, onChange: (job: AvatarJob) => void): () => void {
  const ch = supabase
    .channel(`avatar_job:${jobId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'avatar_jobs', filter: `id=eq.${jobId}` },
      (p) => onChange(mapJob(p.new as Record<string, unknown>)),
    )
    .subscribe()
  return () => { void supabase.removeChannel(ch) }
}
