import { describe, expect, it } from 'vitest'
import { createExpressionDriver } from '@/lib/pixi/rig/expressionDriver'

// ROOM-11 트래킹 실패 폴백: 얼굴 미인식 시 useFaceTracking 이 drive({}, null) 을 흘린다.
// 이 입력이 "중립 idle"을 내는지 고정 — 입닫힘·정면·눈뜸 수렴. NaN 이 나오면 rig 파라미터가 오염된다.
describe('expressionDriver idle fallback (ROOM-11)', () => {
  it('빈 blendshape + headPose null → 중립 idle 파라미터', () => {
    const drive = createExpressionDriver()
    // 표정이 실려 있던 상태에서 얼굴이 사라진 시나리오: 입 벌림·머리 회전 프레임 후 빈 프레임 반복.
    drive({ jawOpen: 0.9, mouthSmileLeft: 1, mouthSmileRight: 1 }, { yaw: 20, pitch: 15, roll: 10 })
    let p = drive({}, null)
    for (let i = 0; i < 20; i++) p = drive({}, null)

    // toBeCloseTo: 미러 계수(−1)×0 = −0 이라 Object.is 기반 toBe(0) 은 실패한다(렌더엔 무해).
    expect(p.ParamMouthOpenY).toBeCloseTo(0, 5)
    expect(p.ParamMouthForm).toBeCloseTo(0, 5)
    expect(p.ParamAngleX).toBeCloseTo(0, 5)
    expect(p.ParamAngleY).toBeCloseTo(0, 5)
    expect(p.ParamAngleZ).toBeCloseTo(0, 5)
    expect(p.ParamEyeBallX).toBeCloseTo(0, 5)
    expect(p.ParamEyeBallY).toBeCloseTo(0, 5)
    // 눈은 EMA 수렴 — 20프레임이면 사실상 뜬 상태(>0.95).
    expect(p.ParamEyeLOpen).toBeGreaterThan(0.95)
    expect(p.ParamEyeROpen).toBeGreaterThan(0.95)
    // breath 는 시간 기반으로 계속 살아있어야 idle 이 "정지"로 안 보인다.
    expect(p.ParamBreath).toBeGreaterThanOrEqual(0)
    expect(p.ParamBreath).toBeLessThanOrEqual(1)
    for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true)
  })
})
