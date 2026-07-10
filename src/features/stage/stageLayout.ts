// 6석 원형 무대 좌표(3×3 그리드): 센터 프레임(col2·row2)을 상/중/하 × 좌·우 3쌍이 둘러싼다.
// SSOT: DESIGN-DIRECTION §6.1·§6.4 (원형 배치 — 좌3·우3 E형 대체). 상단중앙·하단중앙 셀은 비워 원형을 만든다.
// ponytail: 정밀 좌표·아바타→센터 glow 연결선(별자리)은 PENDING(§6.1). 드래그 재배치도 후속.
export const SLOT_PX = 120

export const SLOTS = [
  { col: 1, row: 1 }, // 상단 좌
  { col: 3, row: 1 }, // 상단 우
  { col: 1, row: 2 }, // 중단 좌 — 누락 금지(§6.4)
  { col: 3, row: 2 }, // 중단 우 — 누락 금지(§6.4)
  { col: 1, row: 3 }, // 하단 좌
  { col: 3, row: 3 }, // 하단 우
] as const

// 별자리 글로우(§6.1): 각 슬롯 중심 → 센터(50,50) 연결선용 좌표(%, 3×3 셀 중심).
// SLOTS 와 같은 순서. col/row 1·2·3 → 셀 중심 16.67·50·83.33%. gap 로 인한 미세오차는 lite 라 허용.
const CELL_PCT = [16.67, 50, 83.33] as const
export const STAGE_CENTER_PCT = { x: 50, y: 50 } as const
export const SLOT_POS_PCT = SLOTS.map((s) => ({ x: CELL_PCT[s.col - 1], y: CELL_PCT[s.row - 1] }))

// 절대좌석: 각 참가자를 자기 DB slot_index 자리에 고정 배치한다.
// identity 정렬(과거)은 인원 변동 시 좌석이 리플로우됐다 — slot_index 기반이면 입퇴장에 좌석 불변.
// slot 미상(멤버 fetch 랩) 또는 slot 충돌 참가자는 남은 최저 빈 슬롯에 임시 배치(fetch 완료 시 정착).
// 반환: 길이 slotCount 배열, seats[i] = 슬롯 i 참가자 또는 null(빈 자리).
export function seatParticipants<T extends { identity: string }>(
  participants: readonly T[],
  slotOf: (identity: string) => number | undefined,
  slotCount: number,
): (T | null)[] {
  const seats: (T | null)[] = Array(slotCount).fill(null)
  const overflow: T[] = []
  for (const p of participants) {
    const s = slotOf(p.identity)
    if (s !== undefined && s >= 0 && s < slotCount && seats[s] === null) seats[s] = p
    else overflow.push(p) // slot 미상·충돌 → 임시 배치 대기
  }
  for (const p of overflow) {
    const free = seats.indexOf(null)
    if (free === -1) break // 정원 초과분은 표시 안 함(§6.4 6석 상한)
    seats[free] = p
  }
  return seats
}
