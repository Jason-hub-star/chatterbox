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
})

// 제어형: 부모가 open 을 준다. 렌더 헬퍼로 open 토글 재현.
const el = (open: boolean) => (
  <FloatingSelfMonitor projectUrl="https://example.com/project.json" open={open} onClose={() => {}} />
)

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
})

describe('FloatingSelfMonitor (G-64)', () => {
  it('닫힘(open=false): PiP 패널 없음 · 인스턴스 미생성', () => {
    act(() => root!.render(el(false)))
    expect(container.querySelector('[data-self-monitor]')).toBeNull()
    expect(created.length).toBe(0)
  })

  it('열기 → 인스턴스 생성 + 싱크로 프레임 구동, 닫기 → destroy + 싱크 해제', async () => {
    await act(async () => {
      root!.render(el(true))
    })
    expect(container.querySelector('[data-self-monitor]')).not.toBeNull()
    expect(created.length).toBe(1)

    emitSelfFrame({ jawOpen: 1 }, null)
    expect(created[0].setParams).toHaveBeenCalledWith({ jawOpen: 1 })

    await act(async () => {
      root!.render(el(false))
    })
    expect(container.querySelector('[data-self-monitor]')).toBeNull()
    expect(created[0].destroy).toHaveBeenCalled()

    const calls = created[0].setParams.mock.calls.length
    emitSelfFrame({ jawOpen: 0 }, null) // 해제 후 no-op
    expect(created[0].setParams.mock.calls.length).toBe(calls)
  })
})
