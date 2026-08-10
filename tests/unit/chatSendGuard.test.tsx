import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'
import ChatPanel from '@/features/chat/ChatPanel'
import { useRoomStore } from '@/stores/roomStore'

// FB-CHAT-DUP 회귀 잠금: 전송은 서버 왕복이라 Enter 연타·더블클릭이 같은 문구를 두 번 보낸다.
// 가드가 **동기 ref** 여야 하는 이유가 이 테스트의 핵심 — 두 submit 이벤트가 리렌더 사이에 연달아
// 들어오는 상황을 재현한다. state/disabled 만으로 막으면 여기서 2회로 샌다.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root | null = null

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
  act(() => useRoomStore.getState().reset())
})

const typeDraft = (text: string) => {
  const input = container.querySelector('input') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('ChatPanel 연타 가드', () => {
  it('전송이 끝나기 전 두 번째 submit 은 무시된다', async () => {
    let release: () => void = () => {}
    const pending = new Promise<void>((r) => { release = r })
    const onSend = vi.fn(() => pending)

    root = createRoot(container)
    act(() => { root!.render(<ChatPanel connected onSend={onSend} />) })
    act(() => typeDraft('같은 말 두 번'))

    const form = container.querySelector('form')!
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onSend).toHaveBeenCalledTimes(1)

    await act(async () => { release(); await pending })
    // 전송이 끝나면 가드가 풀리고 입력도 비워진다(다음 메시지를 막지 않는다).
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('')
  })

  it('전송 완료 후에는 다시 보낼 수 있다', async () => {
    const onSend = vi.fn(() => Promise.resolve())
    root = createRoot(container)
    act(() => { root!.render(<ChatPanel connected onSend={onSend} />) })

    for (const text of ['첫 번째', '두 번째']) {
      act(() => typeDraft(text))
      await act(async () => {
        container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })
    }
    expect(onSend).toHaveBeenCalledTimes(2)
    expect(onSend).toHaveBeenNthCalledWith(1, '첫 번째')
    expect(onSend).toHaveBeenNthCalledWith(2, '두 번째')
  })

  it('빈 입력은 전송하지 않는다(기존 계약 유지)', () => {
    const onSend = vi.fn(() => Promise.resolve())
    root = createRoot(container)
    act(() => { root!.render(<ChatPanel connected onSend={onSend} />) })
    act(() => typeDraft('   '))
    act(() => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onSend).not.toHaveBeenCalled()
  })
})
