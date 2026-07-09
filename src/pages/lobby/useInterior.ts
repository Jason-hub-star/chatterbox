import { useMemo } from 'react'
import { resolveWorld, type HubDest, type InteriorScene } from '@/scenes/manifest'
import { useEffectiveWorld } from '@/stores/worldStore'

// 내부 씬 해석 — 현재 세계관(worldStore)의 내부 4관. 월드에 해당 내부 에셋이 없으면 resolveWorld 가
// DEFAULT 월드로 표면별 폴백(좌표 정합 보존) — 로그인·광장과 같은 월드로 이어짐.
export function useInterior(dest: HubDest): InteriorScene | null {
  const worldId = useEffectiveWorld()
  return useMemo(() => resolveWorld(worldId).interiors[dest] ?? null, [worldId, dest])
}
