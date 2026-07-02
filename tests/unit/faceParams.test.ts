import { describe, expect, it } from 'vitest'
import { toFaceParams } from '@/hooks/useFaceTracking'

describe('toFaceParams (blendshape → 아바타 파라미터)', () => {
  it('중립(빈 맵)은 눈 뜸·입 닫힘', () => {
    const p = toFaceParams({}, 0)
    expect(p.eyeOpenLeft).toBe(1)
    expect(p.eyeOpenRight).toBe(1)
    expect(p.mouthOpen).toBe(0)
    expect(p.smile).toBe(0)
    expect(p.browRaise).toBe(0)
    expect(p.headRoll).toBe(0)
  })

  it('eyeBlink은 openness를 반전', () => {
    const p = toFaceParams({ eyeBlinkLeft: 1, eyeBlinkRight: 0.3 }, 0)
    expect(p.eyeOpenLeft).toBe(0)
    expect(p.eyeOpenRight).toBeCloseTo(0.7)
  })

  it('jawOpen→mouthOpen, 좌우 smile 평균', () => {
    const p = toFaceParams({ jawOpen: 0.8, mouthSmileLeft: 0.6, mouthSmileRight: 0.4 }, 0)
    expect(p.mouthOpen).toBeCloseTo(0.8)
    expect(p.smile).toBeCloseTo(0.5)
  })

  it('brow는 3채널 평균이며 1로 클램프', () => {
    expect(toFaceParams({ browInnerUp: 0.6 }, 0).browRaise).toBeCloseTo(0.3)
    expect(
      toFaceParams({ browInnerUp: 1, browOuterUpLeft: 1, browOuterUpRight: 1 }, 0).browRaise,
    ).toBe(1)
  })

  it('headRoll은 그대로 전달', () => {
    expect(toFaceParams({}, 0.42).headRoll).toBe(0.42)
  })
})
