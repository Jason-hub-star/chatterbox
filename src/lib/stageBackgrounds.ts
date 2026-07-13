// 무대 배경(HOST-04·05, ROOM-09) 후보 — 기존 public/scenes 에셋 재사용(무대 전용 아트는 후속/트랙 B).
// 서버(set-room-background)는 '/scenes/' prefix + '..' 부재로 이 집합을 검증(임의 URL·SSRF 차단).
// ponytail: scenes 테이블(SceneBackground.md 레이어 씬·ROOM-26)로 승격 시 이 정적 배열을 대체.
export interface StageBackground {
  id: string
  url: string // '' = 배경 없음(기본 무대)
  labelKey: string
  // 원화 속 불 위치 글로우 앵커(% 좌표, r=지름% — fire-calib 실렌더 캘리브). 미선언 = 글로우 없음.
  fireGlow?: { x: number; y: number; r: number }[]
}

export const STAGE_BACKGROUNDS: StageBackground[] = [
  { id: 'none', url: '', labelKey: 'stage.bg.none' },
  {
    id: 'campfire',
    url: '/scenes/room-stage/campfire-forest.webp',
    labelKey: 'stage.bg.campfire',
    fireGlow: [
      { x: 48.8, y: 68.5, r: 9 }, // 불꽃 본체 코어
      { x: 49.2, y: 76.5, r: 16 }, // 바닥 빛 웅덩이(넓게·은은)
    ],
  },
  // 무대 전용 대극장(F-8, 주인님 채택 2026-07-13) — 구 로비 매표소 원화 재사용을 교체. 계보 v2/masters/theater_stage_v1.png
  { id: 'theater', url: '/scenes/room-stage/theater-stage.webp', labelKey: 'stage.bg.theater' },
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
