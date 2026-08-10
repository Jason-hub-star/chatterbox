import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '@/stores/toastStore'
import { toast } from '@/hooks/useToast'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'

// U4 회귀 잠금 — 피드백 채널(FB-TOAST)과 이탈 보호(LEAVE-GUARD).

describe('toastStore — FB-TOAST', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToastStore.setState({ toasts: [] })
  })
  afterEach(() => vi.useRealTimers())

  it('에러 토스트는 4초가 지나도 사라지지 않는다', () => {
    // 실패가 저절로 사라지면 눈을 뗀 사이의 실패는 없었던 일이 된다 — 재시도 버튼도 함께 증발한다.
    toast.error('업로드 실패')
    vi.advanceTimersByTime(10_000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('성공·정보 토스트는 기존대로 4초에 자동 소멸한다(회귀 방지)', () => {
    toast.success('저장했어요')
    toast.info('안내')
    expect(useToastStore.getState().toasts).toHaveLength(2)
    vi.advanceTimersByTime(4_000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('에러도 수동 닫기로는 사라진다(영구 잔류 아님)', () => {
    const id = toast.error('업로드 실패')
    act(() => useToastStore.getState().dismiss(id))
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('액션 슬롯이 토스트에 실린다', () => {
    const onClick = vi.fn()
    toast.error('업로드 실패', { label: '다시 시도', onClick })
    const [t] = useToastStore.getState().toasts
    expect(t.action?.label).toBe('다시 시도')
    t.action?.onClick()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('useLeaveGuard — LEAVE-GUARD', () => {
  let container: HTMLDivElement
  let addSpy: ReturnType<typeof vi.spyOn>
  let removeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    addSpy = vi.spyOn(window, 'addEventListener')
    removeSpy = vi.spyOn(window, 'removeEventListener')
  })
  afterEach(() => {
    addSpy.mockRestore()
    removeSpy.mockRestore()
    container.remove()
  })

  const Probe = ({ active }: { active: boolean }) => {
    useLeaveGuard(active)
    return null
  }
  const beforeUnloadCalls = (spy: typeof addSpy) =>
    spy.mock.calls.filter((call: unknown[]) => call[0] === 'beforeunload')

  it('작업 중이 아닐 땐 아예 등록하지 않는다', () => {
    // 상시 등록하면 아무 일도 안 하는 사용자에게까지 "나가시겠습니까"가 뜬다.
    const root = createRoot(container)
    act(() => root.render(<Probe active={false} />))
    expect(beforeUnloadCalls(addSpy)).toHaveLength(0)
    act(() => root.unmount())
  })

  it('작업이 시작되면 등록하고, 끝나면 해제한다', () => {
    const root = createRoot(container)
    act(() => root.render(<Probe active={true} />))
    expect(beforeUnloadCalls(addSpy)).toHaveLength(1)

    act(() => root.render(<Probe active={false} />))
    expect(beforeUnloadCalls(removeSpy)).toHaveLength(1)
    act(() => root.unmount())
  })

  it('핸들러가 실제로 이탈을 막는다(preventDefault)', () => {
    // 현대 브라우저가 확인창을 띄우는 조건은 defaultPrevented 다. 코드의 `returnValue = ''` 는
    // 레거시 경로용인데, jsdom 에선 returnValue 가 `!defaultPrevented` 의 별칭이라 값 비교가
    // 성립하지 않는다(설정한 ''를 되읽으면 false) — 그래서 여기선 단언하지 않는다.
    const root = createRoot(container)
    act(() => root.render(<Probe active={true} />))
    const handler = beforeUnloadCalls(addSpy)[0][1] as (e: Event) => void
    const evt = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    handler(evt)
    expect(evt.defaultPrevented).toBe(true)
    act(() => root.unmount())
  })
})
