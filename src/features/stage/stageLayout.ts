// 6석 원형 무대 좌표(3×3 그리드): 센터 프레임(col2·row2)을 상/중/하 × 좌·우 3쌍이 둘러싼다.
// SSOT: DESIGN-DIRECTION §6.1·§6.4 (원형 배치 — 좌3·우3 E형 대체). 상단중앙·하단중앙 셀은 비워 원형을 만든다.
// ponytail: 정밀 좌표·아바타→센터 glow 연결선(별자리)은 PENDING(§6.1). DB slot_index 기반 배정·드래그 재배치도 후속.
export const SLOT_PX = 120

export const SLOTS = [
  { col: 1, row: 1 }, // 상단 좌
  { col: 3, row: 1 }, // 상단 우
  { col: 1, row: 2 }, // 중단 좌 — 누락 금지(§6.4)
  { col: 3, row: 2 }, // 중단 우 — 누락 금지(§6.4)
  { col: 1, row: 3 }, // 하단 좌
  { col: 3, row: 3 }, // 하단 우
] as const
