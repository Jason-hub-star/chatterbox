import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '@/stores/toastStore'

// A-SEAM-1 피드백 채널의 그라운드 트루스: 큐 적재·자동 소멸·개별 dismiss.
// 자동 소멸을 store 가 소유함을 못박아, 트랙 B(<ToastHost/>)가 타이밍 로직 없이 렌더만 하면 되게 한다.
describe('toastStore (피드백 채널 seam)', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('push 는 kind·message 로 큐에 적재하고 고유 id 를 반환한다', () => {
    const { push } = useToastStore.getState()
    const id1 = push('success', '방을 만들었어요')
    const id2 = push('error', '실패했어요')
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(2)
    expect(toasts[0]).toMatchObject({ id: id1, kind: 'success', message: '방을 만들었어요' })
    expect(toasts[1]).toMatchObject({ id: id2, kind: 'error', message: '실패했어요' })
    expect(id1).not.toBe(id2)
  })

  it('자동 소멸: 4초 후 큐에서 스스로 제거된다', () => {
    useToastStore.getState().push('info', 'hi')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(4000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('dismiss 는 해당 id 만 제거하고 나머지는 유지한다', () => {
    const { push, dismiss } = useToastStore.getState()
    const id1 = push('info', 'a')
    const id2 = push('info', 'b')
    dismiss(id1)
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].id).toBe(id2)
  })
})
