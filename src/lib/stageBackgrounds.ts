// 무대 배경(HOST-04·05, ROOM-09) 후보 — 기존 public/scenes 에셋 재사용(무대 전용 아트는 후속/트랙 B).
// 서버(set-room-background)는 '/scenes/' prefix + '..' 부재로 이 집합을 검증(임의 URL·SSRF 차단).
// ponytail: scenes 테이블(SceneBackground.md 레이어 씬·ROOM-26)로 승격 시 이 정적 배열을 대체.
export interface StageBackground {
  id: string
  url: string // '' = 배경 없음(기본 무대)
  labelKey: string
}

export const STAGE_BACKGROUNDS: StageBackground[] = [
  { id: 'none', url: '', labelKey: 'stage.bg.none' },
  { id: 'campfire', url: '/scenes/room-stage/campfire-forest.webp', labelKey: 'stage.bg.campfire' },
  { id: 'theater', url: '/scenes/lobby-interiors/theater.webp', labelKey: 'stage.bg.theater' },
  { id: 'teahouse', url: '/scenes/lobby-interiors/teahouse.webp', labelKey: 'stage.bg.teahouse' },
  { id: 'workshop', url: '/scenes/lobby-interiors/workshop.webp', labelKey: 'stage.bg.workshop' },
  { id: 'plaza', url: '/scenes/lobby-plaza/plaza-1.webp', labelKey: 'stage.bg.plaza' },
  { id: 'atelier', url: '/scenes/lobby-interiors/atelier.webp', labelKey: 'stage.bg.atelier' },
  { id: 'street', url: '/scenes/lobby-street/day.webp', labelKey: 'stage.bg.street' },
]

// 서버 검증과 동일 규칙(클라 방어적 미러): 우리 public 씬 에셋 경로만 허용.
export function isValidBackgroundUrl(url: string): boolean {
  return url === '' || (url.startsWith('/scenes/') && !url.includes('..'))
}
