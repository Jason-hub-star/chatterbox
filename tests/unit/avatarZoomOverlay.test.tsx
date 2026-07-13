import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'

// 아바타 크게보기(무대 클릭): self=selfFrameSink 구독, remote=registry sink. PixiJS 는 jsdom 불가 → rig 만 목.
// 검증 대상 = 확대창의 수명주기·프레임 배선(생성→구동→destroy + 싱크 해제).
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

import AvatarZoomOverlay, { type AvatarZoomTarget } from '@/features/stage/AvatarZoomOverlay'
import { emitSelfFrame } from '@/features/avatar/selfFrameSink'
import type { RemoteFrameSink } from '@/features/avatar/RemoteAvatar'
import type { BlendshapeFrame } from '@/lib/blendshapeCodec'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root | null = null
const reg: RefObject<Map<string, RemoteFrameSink>> = { current: new Map() }

beforeEach(() => {
  created.length = 0
  reg.current = new Map()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
})

const selfTarget: AvatarZoomTarget = { identity: 'me', name: '나', isLocal: true, isHost: false, projectUrl: 'x' }
const remoteTarget: AvatarZoomTarget = { identity: 'r1', name: 'R1', isLocal: false, isHost: false, projectUrl: 'y' }

describe('AvatarZoomOverlay', () => {
  it('self: selfFrameSink 구독으로 확대 아바타 구동, 언마운트 → destroy + 싱크 해제', async () => {
    await act(async () => {
      root!.render(<AvatarZoomOverlay target={selfTarget} remoteRegistry={reg} onClose={() => {}} />)
    })
    expect(created.length).toBe(1)
    emitSelfFrame({ jawOpen: 1 }, null)
    expect(created[0].setParams).toHaveBeenCalledWith({ jawOpen: 1 })

    await act(async () => {
      root!.render(null)
    })
    expect(created[0].destroy).toHaveBeenCalled()
    const calls = created[0].setParams.mock.calls.length
    emitSelfFrame({ jawOpen: 0 }, null) // 해제 후 no-op
    expect(created[0].setParams.mock.calls.length).toBe(calls)
  })

  it('remote: registry 에 sink 등록/구동, 언마운트 → registry 해제', async () => {
    await act(async () => {
      root!.render(<AvatarZoomOverlay target={remoteTarget} remoteRegistry={reg} onClose={() => {}} />)
    })
    expect(reg.current!.has('r1')).toBe(true)
    reg.current!.get('r1')!({ blendshapes: { jawOpen: 1 } } as unknown as BlendshapeFrame)
    expect(created[0].setParams).toHaveBeenCalledWith({ jawOpen: 1 })

    await act(async () => {
      root!.render(null)
    })
    expect(reg.current!.has('r1')).toBe(false)
    expect(created[0].destroy).toHaveBeenCalled()
  })
})
