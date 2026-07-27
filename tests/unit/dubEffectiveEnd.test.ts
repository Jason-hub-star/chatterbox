import { describe, it, expect } from 'vitest'
import { dubEffectiveEndMs } from '@/lib/dub'

// Z2 핸들(DUB-TAIL-HARDCUT): 말꼬리 grace 를 다음 세그 시작까지로 클램프 —
// 녹음 경계·리허설·프리뷰/레이어/합성 트림이 전부 이 함수 하나를 규칙원으로 쓴다.
describe('dubEffectiveEndMs', () => {
  const segs = [{ start_ms: 1000 }, { start_ms: 5000 }, { start_ms: 9000 }]

  it('갭이 grace 보다 크면 +600ms 핸들', () => {
    expect(dubEffectiveEndMs(3000, segs)).toBe(3600)
  })

  it('갭이 grace 보다 작으면 다음 세그 시작으로 클램프', () => {
    expect(dubEffectiveEndMs(4700, segs)).toBe(5000)
  })

  it('붙은 세그(갭 0)는 연장 0 — 다음 파트 더빙과 무겹침', () => {
    expect(dubEffectiveEndMs(5000, segs)).toBe(5000)
  })

  it('마지막 세그는 +600ms 전부', () => {
    expect(dubEffectiveEndMs(11000, segs)).toBe(11600)
  })

  it('grace 커스텀 값 존중', () => {
    expect(dubEffectiveEndMs(3000, segs, 300)).toBe(3300)
  })
})
