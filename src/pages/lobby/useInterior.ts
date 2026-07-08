import { useState } from 'react'
import { SCENES, resolveScene, type HubDest, type InteriorScene, type SceneVariant } from '@/scenes/manifest'

// 내부 씬 해석(로비 v3). 시간대 variant 는 로그인·로비와 공유. 밤 점진 등재 대비:
// night variant 에 해당 내부가 아직 없으면 morning 내부로 폴백(광장만 밤이어도 내부가 안 사라짐).
export function useInterior(dest: HubDest): InteriorScene | null {
  const [interior] = useState(() => {
    const scene = resolveScene(SCENES.lobbyStreet, new Date().getHours())
    const morning: SceneVariant | undefined = SCENES.lobbyStreet.variants.morning
    return scene?.interiors?.[dest] ?? morning?.interiors?.[dest] ?? null
  })
  return interior
}
