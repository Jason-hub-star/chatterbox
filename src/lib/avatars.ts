// 아바타 레지스트리 — 유저가 고를 수 있는 아바타 목록의 SSOT.
// 선택 목록 = Storage `avatars/manifest.json`(배포 스크립트가 유지). 새 아바타는 `scripts/deploy-avatar.mjs`
// 가 rig 업로드 + 매니페스트 갱신까지 하므로, **코드 수정·프론트 재배포 없이** 앱에 바로 나타난다(슬롯에 꼽기).
// 렌더는 users.avatar_url(project.json URL)로 참가자별 수행 — 매니페스트는 "선택지"에만 쓰인다.
// ponytail: 유저 업로드(MOD-02)가 붙으면 매니페스트→DB `avatars` 테이블로 승격, 유저별 rig는 avatars/<userId>/.

const STORAGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars`

export interface AvatarPreset {
  id: string
  name: string
  projectUrl: string
}

const projectUrlFor = (id: string) => `${STORAGE_BASE}/${id}/project.json`

// 매니페스트 로드 실패 시 fallback. 현재 배포된 기본 아바타.
export const BUILTIN_AVATARS: AvatarPreset[] = [
  { id: 'aria', name: '아리아', projectUrl: projectUrlFor('aria') },
  { id: 'akane', name: '아카네', projectUrl: projectUrlFor('akane') },
]

export const DEFAULT_AVATAR_URL = BUILTIN_AVATARS[0].projectUrl

// 선택 가능한 아바타 목록. Storage 매니페스트를 읽어 동적으로 — 새 배포가 재빌드 없이 반영된다.
export async function fetchAvatarPresets(): Promise<AvatarPreset[]> {
  try {
    const res = await fetch(`${STORAGE_BASE}/manifest.json`, { cache: 'no-store' })
    if (!res.ok) return BUILTIN_AVATARS
    const data = (await res.json()) as { avatars?: Array<{ id?: string; name?: string }> }
    const list = (data.avatars ?? [])
      .filter((a): a is { id: string; name: string } => !!a.id && !!a.name)
      .map((a) => ({ id: a.id, name: a.name, projectUrl: projectUrlFor(a.id) }))
    return list.length ? list : BUILTIN_AVATARS
  } catch {
    return BUILTIN_AVATARS
  }
}

// 저장된 avatar_url 이 없으면 기본 아바타. 방·프리뷰 렌더의 단일 진입점.
export function resolveAvatarUrl(url?: string | null): string {
  return url && url.length > 0 ? url : DEFAULT_AVATAR_URL
}

// setMyAvatar 검증: 우리 avatars 버킷의 `<id>/project.json` 형태만 허용(정크·비신뢰 origin 차단).
// 매니페스트에 없어도 방금 배포된 아바타는 즉시 저장 가능(형태 검증이라 목록 로드에 의존하지 않음).
export function isValidAvatarUrl(url: string): boolean {
  return url.startsWith(`${STORAGE_BASE}/`) && url.endsWith('/project.json')
}
