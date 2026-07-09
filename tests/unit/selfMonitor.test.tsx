import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'

// G-64 Self-PiP: 토글 → 인스턴스 생성 + 싱크 등록 → 프레임 구동 → 닫기 → destroy + 싱크 해제.
// PixiJS 는 jsdom 에서 못 돌므로 rig 만 목 — 검증 대상은 PiP 의 수명주기·싱크 배선 로직.
const created: { setParams: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[] = []
vi.mock('@/lib/pixi/rig', () => ({
  RigAvatar: {
    create: vi.fn(async () => {
      const av = { setParams: vi.fn(), destroy: vi.fn() }
      created.push(av)
      return av
    }),
  },
  createExpressionDriver: () => (bs: Record<string, number>) => bs,
}))

import FloatingSelfMonitor from '@/features/room/FloatingSelfMonitor'
import { emitSelfFrame } from '@/features/avatar/selfFrameSink'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root | null = null

beforeEach(() => {
  created.length = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<FloatingSelfMonitor projectUrl="https://example.com/project.json" />))
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
})

const toggleBtn = () => container.querySelector<HTMLButtonElement>('button[title]')!

describe('FloatingSelfMonitor (G-64)', () => {
  it('기본 off: 토글 버튼만, PiP 패널 없음', () => {
    expect(toggleBtn()).not.toBeNull()
    expect(container.querySelector('[data-self-monitor]')).toBeNull()
    expect(created.length).toBe(0)
  })

  it('열기 → 인스턴스 생성 + 싱크로 프레임 구동, 닫기 → destroy + 싱크 해제', async () => {
    await act(async () => toggleBtn().click())
    expect(container.querySelector('[data-self-monitor]')).not.toBeNull()
    expect(created.length).toBe(1)

    emitSelfFrame({ jawOpen: 1 }, null)
    expect(created[0].setParams).toHaveBeenCalledWith({ jawOpen: 1 })

    const close = container.querySelector<HTMLButtonElement>('[data-self-monitor] button')!
    await act(async () => close.click())
    expect(container.querySelector('[data-self-monitor]')).toBeNull()
    expect(created[0].destroy).toHaveBeenCalled()

    const calls = created[0].setParams.mock.calls.length
    emitSelfFrame({ jawOpen: 0 }, null) // 해제 후 no-op
    expect(created[0].setParams.mock.calls.length).toBe(calls)
  })
})
