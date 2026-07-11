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
  // 캐시버스트된 썸네일 URL(매니페스트 thumbRev 기반). 없으면(커미션 등) thumbUrlFor 폴백.
  thumbUrl?: string
}

const projectUrlFor = (id: string) => `${STORAGE_BASE}/${id}/project.json`

// 정적 썸네일 규약: project.json 옆 thumb.png — 생성·업로드는 scripts/generate-avatar-thumbs.mjs.
// 파일이 없으면(예: 워커가 아직 안 만드는 커미션분) <img onError> 폴백이 받는다.
// 같은 URL 재업로드는 브라우저/CDN 캐시가 구본을 계속 서빙(2026-07-10 주인님 실측: 수정 전 썸네일이
// 계속 보임) → 매니페스트 thumbRev 를 ?v= 로 붙여 재생성마다 URL 을 갈아끼운다(스크립트가 rev 갱신).
export const thumbUrlFor = (projectUrl: string, rev?: number | string) =>
  projectUrl.replace(/project\.json$/, 'thumb.png') + (rev ? `?v=${rev}` : '')

// 매니페스트 로드 실패 시 fallback. 현재 배포된 기본 아바타.
// 로스터 3종 확정(2026-07-10 주인님): 미미(mimi-smoke 최신 빌드)·유키·우로.
// akane·ruby(오시노코 IP)·aria·구 mimi·nao 는 제거 — 원본 rig 는 Vtube 존치(재배포 가능).
export const BUILTIN_AVATARS: AvatarPreset[] = [
  { id: 'yuki', name: '유키', projectUrl: projectUrlFor('yuki') },
  { id: 'mimi-smoke', name: '미미', projectUrl: projectUrlFor('mimi-smoke') },
]

export const DEFAULT_AVATAR_URL = BUILTIN_AVATARS[0].projectUrl

// 선택 가능한 아바타 목록. Storage 매니페스트를 읽어 동적으로 — 새 배포가 재빌드 없이 반영된다.
export async function fetchAvatarPresets(): Promise<AvatarPreset[]> {
  try {
    const res = await fetch(`${STORAGE_BASE}/manifest.json`, { cache: 'no-store' })
    if (!res.ok) return BUILTIN_AVATARS
    const data = (await res.json()) as {
      avatars?: Array<{ id?: string; name?: string }>
      thumbRev?: number
    }
    const list = (data.avatars ?? [])
      .filter((a): a is { id: string; name: string } => !!a.id && !!a.name)
      .map((a) => ({
        id: a.id,
        name: a.name,
        projectUrl: projectUrlFor(a.id),
        thumbUrl: thumbUrlFor(projectUrlFor(a.id), data.thumbRev),
      }))
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
