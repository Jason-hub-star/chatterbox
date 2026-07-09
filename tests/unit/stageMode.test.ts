import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStageStore } from '@/stores/stageStore'

// G-261 모드 상태: announceMode(broadcast 수신)=값+배너 2.4s / setMode(입장 복원·이탈)=조용.
describe('stageStore mode (G-261)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useStageStore.setState({ mode: 'normal', bannerMode: null })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('setMode 는 배너 없이 값만 바꾼다(입장 복원 경로)', () => {
    useStageStore.getState().setMode('vgen')
    expect(useStageStore.getState().mode).toBe('vgen')
    expect(useStageStore.getState().bannerMode).toBeNull()
  })

  it('announceMode 는 값 + 배너 표출, 2.4s 후 배너만 소멸', () => {
    useStageStore.getState().announceMode('dub')
    expect(useStageStore.getState().mode).toBe('dub')
    expect(useStageStore.getState().bannerMode).toBe('dub')
    vi.advanceTimersByTime(2400)
    expect(useStageStore.getState().bannerMode).toBeNull()
    expect(useStageStore.getState().mode).toBe('dub')
  })

  it('연속 announce 는 타이머를 리셋한다(마지막 모드로 2.4s)', () => {
    useStageStore.getState().announceMode('vgen')
    vi.advanceTimersByTime(2000)
    useStageStore.getState().announceMode('normal')
    vi.advanceTimersByTime(2000)
    expect(useStageStore.getState().bannerMode).toBe('normal') // 아직 400ms 남음
    vi.advanceTimersByTime(400)
    expect(useStageStore.getState().bannerMode).toBeNull()
  })
})
