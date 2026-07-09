// 대본 역할 클레임 맵(ROOM-14) — 순수 로직만(스토어·네트워크 무의존, 유닛 테스트 대상).
// 동기 프로토콜: 서버 릴레이 'script-role' 토픽(sync-script-role Edge). SSOT: docs/DATA-SCHEMA.md §2.
export interface RoleClaim {
  authId: string // LiveKit identity = auth uid
  name: string | null
}
export type RoleMap = Record<string, RoleClaim>

export type RoleEvent =
  | { kind: 'set'; role: string; authId: string; name: string | null }
  | { kind: 'clear'; role: string }

// 수신 페이로드 방어(형태 검증 통과분만 리듀서로).
export function isRoleEvent(v: unknown): v is RoleEvent {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  if (typeof e.role !== 'string' || e.role.length < 1 || e.role.length > 50) return false
  if (e.kind === 'clear') return true
  if (e.kind !== 'set') return false
  return typeof e.authId === 'string' && (e.name === null || typeof e.name === 'string')
}

// set 은 같은 사람의 기존 클레임을 새 역할로 옮긴다(1인 1역). clear 는 해당 역할만 비운다.
export function applyRoleEvent(map: RoleMap, evt: RoleEvent): RoleMap {
  if (evt.kind === 'clear') {
    if (!(evt.role in map)) return map
    const next = { ...map }
    delete next[evt.role]
    return next
  }
  const next: RoleMap = {}
  for (const [role, claim] of Object.entries(map)) {
    if (claim.authId !== evt.authId) next[role] = claim
  }
  next[evt.role] = { authId: evt.authId, name: evt.name }
  return next
}

// 퇴장자 클레임 필터(렌더 파생용) — 참조 보존: 변화 없으면 원본 반환.
export function pruneRoleMap(map: RoleMap, presentAuthIds: ReadonlySet<string>): RoleMap {
  const entries = Object.entries(map).filter(([, c]) => presentAuthIds.has(c.authId))
  return entries.length === Object.keys(map).length ? map : Object.fromEntries(entries)
}

// 내가 맡은 역할(1인 1역 불변식 하에 첫 매치).
export const roleOf = (map: RoleMap, authId: string): string | null =>
  Object.entries(map).find(([, c]) => c.authId === authId)?.[0] ?? null
