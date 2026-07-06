import { describe, it, expect } from 'vitest'
import { seatParticipants, SLOTS } from '@/features/stage/stageLayout'

// 절대좌석(slot_index) 배치 — 핵심 불변식: 인원 변동에도 각자 좌석이 안 바뀐다(리플로우 없음).
type P = { identity: string }
const N = SLOTS.length // 6

const slotMap = (m: Record<string, number>) => (id: string): number | undefined => m[id]

describe('seatParticipants', () => {
  it('각 참가자를 자기 slot_index 절대 자리에 놓고 나머지는 null', () => {
    const parts: P[] = [{ identity: 'a' }, { identity: 'c' }, { identity: 'f' }]
    const seats = seatParticipants(parts, slotMap({ a: 0, c: 2, f: 5 }), N)
    expect(seats.map((p) => p?.identity ?? null)).toEqual(['a', null, 'c', null, null, 'f'])
  })

  it('중간 인원 퇴장 시 나머지 좌석 불변(리플로우 없음)', () => {
    const of = slotMap({ a: 0, c: 2, f: 5 })
    const before = seatParticipants([{ identity: 'a' }, { identity: 'c' }, { identity: 'f' }], of, N)
    const after = seatParticipants([{ identity: 'a' }, { identity: 'f' }], of, N) // c 퇴장
    expect(before[0]?.identity).toBe('a')
    expect(before[5]?.identity).toBe('f')
    expect(after[0]?.identity).toBe('a') // 자리 유지
    expect(after[5]?.identity).toBe('f') // 자리 유지 (과거 identity 정렬이면 0,1로 압축돼 밀렸음)
    expect(after[2]).toBeNull()          // 퇴장한 슬롯만 빔
  })

  it('2인(slot 0,1) 회귀', () => {
    const seats = seatParticipants([{ identity: 'x' }, { identity: 'y' }], slotMap({ x: 0, y: 1 }), N)
    expect(seats.map((p) => p?.identity ?? null)).toEqual(['x', 'y', null, null, null, null])
  })

  it('slot 미상 참가자는 남은 최저 빈 슬롯에 임시 배치', () => {
    const seats = seatParticipants([{ identity: 'a' }, { identity: 'u' }], slotMap({ a: 2 }), N) // u 는 slot 미상
    expect(seats[2]?.identity).toBe('a')
    expect(seats[0]?.identity).toBe('u') // 최저 빈 슬롯
  })

  it('slot 충돌은 두 번째를 빈 슬롯으로 회피', () => {
    const seats = seatParticipants([{ identity: 'a' }, { identity: 'b' }], slotMap({ a: 0, b: 0 }), N)
    expect(seats[0]?.identity).toBe('a')
    expect(seats[1]?.identity).toBe('b') // 충돌 → 다음 빈 슬롯
  })

  it('정원 초과분은 표시 안 함(6석 상한)', () => {
    const parts: P[] = Array.from({ length: 8 }, (_, i) => ({ identity: `p${i}` }))
    const seats = seatParticipants(parts, slotMap({ p0: 0, p1: 1, p2: 2, p3: 3, p4: 4, p5: 5, p6: 6, p7: 7 }), N)
    expect(seats.filter(Boolean)).toHaveLength(N) // 6석만 채움
  })
})
