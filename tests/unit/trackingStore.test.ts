import { beforeEach, describe, expect, it } from 'vitest'
import { useTrackingStore } from '@/stores/trackingStore'

const get = () => useTrackingStore.getState()

describe('trackingStore', () => {
  beforeEach(() => {
    get().reset()
  })

  it('초기 상태는 IDLE·얼굴없음·0fps', () => {
    expect(get().state).toBe('IDLE')
    expect(get().faceDetected).toBe(false)
    expect(get().fps).toBe(0)
    expect(get().error).toBeNull()
  })

  it('FSM 전이: IDLE→INITIALIZING→TRACKING', () => {
    get().setState('INITIALIZING')
    expect(get().state).toBe('INITIALIZING')
    get().setState('TRACKING')
    expect(get().state).toBe('TRACKING')
  })

  it('faceDetected·fps 갱신', () => {
    get().setFaceDetected(true)
    expect(get().faceDetected).toBe(true)
    get().setFps(28)
    expect(get().fps).toBe(28)
  })

  it('error 기록은 상태를 건드리지 않는다 (전이는 setState 책임)', () => {
    get().setState('INITIALIZING')
    get().setError('webcam denied')
    expect(get().error).toBe('webcam denied')
    expect(get().state).toBe('INITIALIZING')
    get().setState('ERROR')
    expect(get().state).toBe('ERROR')
  })

  it('reset은 전 필드를 초기화한다', () => {
    get().setState('TRACKING')
    get().setFaceDetected(true)
    get().setFps(30)
    get().setError('boom')
    get().reset()
    expect(get().state).toBe('IDLE')
    expect(get().faceDetected).toBe(false)
    expect(get().fps).toBe(0)
    expect(get().error).toBeNull()
  })
})
