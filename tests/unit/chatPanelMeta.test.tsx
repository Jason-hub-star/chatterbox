import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'
import ChatPanel from '@/features/chat/ChatPanel'
import { useRoomStore, type ChatMessage } from '@/stores/roomStore'

// 채팅 UX(트랙 2): 메시지 행 타임스탬프(HH:MM 24h 결정적) + 내 메시지 전송확인 ✓(로컬 에코=publish 완료).
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: crypto.randomUUID(),
  sender: 'X',
  text: 'hi',
  ts: new Date(2026, 6, 9, 9, 5).getTime(),
  isLocal: false,
  ...over,
})

let container: HTMLElement
let root: Root | null = null

function render() {
  root = createRoot(container)
  act(() => {
    root!.render(<ChatPanel connected onSend={() => {}} />)
  })
}

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

describe('ChatPanel 타임스탬프·전송확인', () => {
  it('메시지 행에 HH:MM 타임스탬프를 <time>으로 렌더', () => {
    useRoomStore.setState({ messages: [msg({ ts: new Date(2026, 6, 9, 9, 5).getTime() })] })
    render()
    const time = container.querySelector('time')!
    expect(time.textContent).toBe('09:05')
    expect(time.getAttribute('datetime')).toBeTruthy()
  })

  it('내 메시지(isLocal)에만 전송확인 ✓ 표시', () => {
    useRoomStore.setState({
      messages: [msg({ id: 'a', isLocal: true }), msg({ id: 'b', isLocal: false })],
    })
    render()
    const items = container.querySelectorAll('li')
    expect(items[0].textContent).toContain('✓')
    expect(items[1].textContent).not.toContain('✓')
  })
})
