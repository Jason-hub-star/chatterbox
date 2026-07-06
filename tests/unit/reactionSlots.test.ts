import { describe, it, expect } from 'vitest'
import { slotAngle, slotOffset, nearestSlot } from '@/features/reaction/reactionSlots'

// 리액션 휠 지오메트리 — 순수 함수. N 가변(커스터마이즈)에 무관한 정합을 고정한다.
describe('reactionSlots geometry', () => {
  it('슬롯 0은 항상 12시(위)', () => {
    for (const n of [4, 6, 8, 12]) {
      const { x, y } = slotOffset(0, n, 100)
      expect(x).toBeCloseTo(0)
      expect(y).toBeCloseTo(-100) // +y=하 → 위는 음수
    }
  })

  it('시계방향 등분: 8슬롯의 slot 2 는 3시(우)', () => {
    expect(slotAngle(2, 8)).toBeCloseTo(0)
    const { x, y } = slotOffset(2, 8, 50)
    expect(x).toBeCloseTo(50)
    expect(y).toBeCloseTo(0)
  })

  it('nearestSlot: 위 방향 → 0, 우 방향 → count/4', () => {
    expect(nearestSlot(0, -1, 8)).toBe(0) // 위
    expect(nearestSlot(1, 0, 8)).toBe(2) // 우 = 8/4
    expect(nearestSlot(0, 1, 8)).toBe(4) // 아래 = 8/2
    expect(nearestSlot(-1, 0, 8)).toBe(6) // 좌 = 8*3/4
  })

  it('nearestSlot 은 slotOffset 의 역: 각 슬롯 오프셋을 다시 그 슬롯으로 매핑', () => {
    for (const n of [4, 6, 8, 12]) {
      for (let i = 0; i < n; i++) {
        const { x, y } = slotOffset(i, n, 80)
        expect(nearestSlot(x, y, n)).toBe(i)
      }
    }
  })

  it('데드존 안(중앙)이면 null → 취소', () => {
    expect(nearestSlot(5, 5, 8, 30)).toBeNull() // hypot ~7 < 30
    expect(nearestSlot(0, -40, 8, 30)).toBe(0) // hypot 40 > 30 → 조준
  })

  it('count 0 방어', () => {
    expect(nearestSlot(1, 1, 0)).toBeNull()
  })
})
