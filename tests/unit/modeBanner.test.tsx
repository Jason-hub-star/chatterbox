import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'
import ModeBanner from '@/features/room/ModeBanner'
import { useStageStore } from '@/stores/stageStore'

// G-261 배너: announceMode 시 2.4s 표출 후 자동 소멸, setMode(입장 복원)는 무표출.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root | null = null

beforeEach(() => {
  vi.useFakeTimers()
  useStageStore.setState({ mode: 'normal', bannerMode: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<ModeBanner />))
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
  vi.useRealTimers()
})

describe('ModeBanner (G-261)', () => {
  it('announceMode → role=status 배너 표출, 2.4s 후 소멸', () => {
    expect(container.querySelector('[role="status"]')).toBeNull()
    act(() => useStageStore.getState().announceMode('vgen'))
    const el = container.querySelector('[role="status"]')!
    expect(el).not.toBeNull()
    expect(el.textContent).toContain('VGEN')
    act(() => vi.advanceTimersByTime(2400))
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('setMode(입장 복원)는 배너를 띄우지 않는다', () => {
    act(() => useStageStore.getState().setMode('dub'))
    expect(container.querySelector('[role="status"]')).toBeNull()
  })
})
