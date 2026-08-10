import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePopoverA11y } from '@/hooks/usePopoverA11y'

// A11Y-POPOVER 회귀 잠금. 앵커 팝오버 4종(벨·만들기·친구·믹서)이 공유하는 로직을 훅 단위로 잠근다.
// 컴포넌트별로 다시 테스트하지 않는 이유: 구현이 한 곳이라 여기서 깨지면 넷 다 깨지고,
// 넷을 각각 렌더하려면 store·i18n·라우터 셋업이 붙어 테스트가 로직이 아니라 배선을 검사하게 된다.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root | null = null

function Popover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = usePopoverA11y<HTMLDivElement>(open, onClose)
  if (!open) return null
  return (
    <div ref={ref} role="dialog" tabIndex={-1} data-testid="panel">
      <button data-testid="first">첫 항목</button>
      <button data-testid="last">끝 항목</button>
    </div>
  )
}

const press = (key: string, shiftKey = false) =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
  })

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})
afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
})

describe('usePopoverA11y', () => {
  it('열면 패널 안 첫 요소로 포커스가 들어간다', () => {
    // 이게 없으면 키보드 사용자는 열린 팝오버 안으로 못 들어간다(포커스는 토글 버튼에 남는다).
    root = createRoot(container)
    act(() => root!.render(<Popover open onClose={() => {}} />))
    expect(document.activeElement).toBe(container.querySelector('[data-testid="first"]'))
  })

  it('Esc 로 닫힌다', () => {
    const onClose = vi.fn()
    root = createRoot(container)
    act(() => root!.render(<Popover open onClose={onClose} />))
    press('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('닫으면 열기 전 포커스로 복귀한다', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)

    root = createRoot(container)
    act(() => root!.render(<Popover open onClose={() => {}} />))
    expect(document.activeElement).not.toBe(opener)

    act(() => root!.render(<Popover open={false} onClose={() => {}} />))
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('Tab 이 패널 안에 갇힌다(끝→처음 순환)', () => {
    root = createRoot(container)
    act(() => root!.render(<Popover open onClose={() => {}} />))
    const first = container.querySelector<HTMLElement>('[data-testid="first"]')!
    const last = container.querySelector<HTMLElement>('[data-testid="last"]')!

    act(() => last.focus())
    press('Tab')
    expect(document.activeElement).toBe(first)

    press('Tab', true) // shift+Tab — 처음에서 뒤로
    expect(document.activeElement).toBe(last)
  })

  it('닫혀 있으면 키 리스너를 등록하지 않는다', () => {
    // 상시 등록이면 Esc 가 닫힌 팝오버까지 건드려 부모 모달의 Esc 를 가로챈다.
    const spy = vi.spyOn(document, 'addEventListener')
    root = createRoot(container)
    act(() => root!.render(<Popover open={false} onClose={() => {}} />))
    expect(spy.mock.calls.filter((c: unknown[]) => c[0] === 'keydown')).toHaveLength(0)
    spy.mockRestore()
  })
})
