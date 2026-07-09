import { create } from 'zustand'
import { DEFAULT_WORLD, type WorldId } from '@/scenes/manifest'

// 세계관(World) 단일 상태 — 로그인·광장·내부가 이 하나를 읽어 "세계관이 이어진다".
// 우선순위: effective = room ?? personal ?? DEFAULT.
//  - personal: 사용자가 고른 월드(월드 갤러리). localStorage 지속(로그인 전이라 DB 불가 → 개인 기기 값).
//  - room: 대극장 방 입장 시 방장 월드(rooms.world_id)로 통일. 퇴장 시 해제 (P2, DB).
// QA/딥링크 오버라이드: ?world=<id> → personal 로 설정·지속.
const LS_KEY = 'cb.world'

function readInitialPersonal(): WorldId {
  if (typeof window === 'undefined') return DEFAULT_WORLD
  try {
    const q = new URLSearchParams(window.location.search).get('world')
    if (q) {
      try { localStorage.setItem(LS_KEY, q) } catch { /* private mode */ }
      return q
    }
    return localStorage.getItem(LS_KEY) || DEFAULT_WORLD
  } catch {
    return DEFAULT_WORLD
  }
}

interface WorldStore {
  personal: WorldId
  room: WorldId | null
  setPersonal: (id: WorldId) => void
  enterRoomWorld: (id: WorldId) => void
  leaveRoomWorld: () => void
}

export const useWorldStore = create<WorldStore>((set) => ({
  personal: readInitialPersonal(),
  room: null,
  setPersonal: (id) => {
    try { if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, id) } catch { /* private mode */ }
    set({ personal: id })
  },
  enterRoomWorld: (id) => set({ room: id }),
  leaveRoomWorld: () => set({ room: null }),
}))

// 현재 유효 월드 id(반응형) — 컴포넌트는 resolveWorld(useEffectiveWorld()) 로 소비.
export function useEffectiveWorld(): WorldId {
  return useWorldStore((s) => s.room ?? s.personal ?? DEFAULT_WORLD)
}
