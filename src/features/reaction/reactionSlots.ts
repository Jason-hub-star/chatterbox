// 라디얼 리액션 휠의 순수 지오메트리(React·DOM 무관 — 테스트 가능).
// 슬롯 N개를 원 위에 균등 배치(12시 기준, 시계방향). N 가변 → 커스터마이즈 슬롯 수에 무관.
// 커스터마이즈 슬롯 데이터(ReactionSlot[])는 stores/reactionStore 가 소유(localStorage 영속).

// 슬롯 i 의 각도(rad). 12시(-π/2)에서 시작해 시계방향으로 등분.
export function slotAngle(index: number, count: number): number {
  return -Math.PI / 2 + (index / count) * Math.PI * 2
}

// 중심에서 슬롯 i 칩의 오프셋(px). +x=우, +y=하(화면 좌표계).
export function slotOffset(index: number, count: number, radius: number): { x: number; y: number } {
  const a = slotAngle(index, count)
  return { x: Math.cos(a) * radius, y: Math.sin(a) * radius }
}

// 중심에서 드래그 벡터(dx,dy) 방향에 가장 가까운 슬롯 index.
// hypot < deadzone(중앙 데드존)이면 null → 취소(어떤 슬롯도 조준 안 함).
export function nearestSlot(dx: number, dy: number, count: number, deadzone = 0): number | null {
  if (count <= 0) return null
  if (Math.hypot(dx, dy) < deadzone) return null
  // slotAngle 과 동일 기준으로 환산: (a + π/2)/2π 를 [0,1) 로 → count 등분 최근접.
  const rel = (Math.atan2(dy, dx) + Math.PI / 2) / (Math.PI * 2)
  const wrapped = rel - Math.floor(rel)
  return Math.round(wrapped * count) % count
}
