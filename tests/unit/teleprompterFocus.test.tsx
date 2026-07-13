import { afterEach, describe, expect, it } from 'vitest'
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'
import TeleprompterFocus from '@/features/script/TeleprompterFocus'

// ROOM-06 A안 텔레프롬프터 포커스 — 긴 대사 내부 스크롤·내 차례 배지·다음 대사 미리보기.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root | null = null

function render(props: Partial<ComponentProps<typeof TeleprompterFocus>> = {}) {
  const base: ComponentProps<typeof TeleprompterFocus> = {
    cue: { role: '유이', text: '아주 긴 대사 '.repeat(40) },
    cueIndex: 0,
    total: 3,
    myTurn: false,
    nextCue: { role: '하루', text: '다음 대사입니다' },
    fontScale: 'md',
    canAdvance: true,
    atStart: true,
    atEnd: false,
    onAdvance: () => {},
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<TeleprompterFocus {...base} {...props} />))
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
})

describe('TeleprompterFocus', () => {
  it('긴 대사는 내부 스크롤 컨테이너(overflow-y-auto)에 담긴다', () => {
    render()
    const box = container.querySelector('[data-testid="cue-scroll"]')!
    expect(box).toBeTruthy()
    expect(box.classList.contains('overflow-y-auto')).toBe(true)
  })

  it('내 차례면 배지를 표시', () => {
    render({ myTurn: true })
    expect(container.querySelector('[data-testid="current-cue"]')!.textContent).toContain('내 차례')
  })

  it('다음 대사 미리보기를 렌더', () => {
    render({ nextCue: { role: '하루', text: '다음 대사입니다' } })
    expect(container.textContent).toContain('다음 대사입니다')
  })

  it('마지막 cue면 다음 미리보기 대신 대본 끝', () => {
    render({ nextCue: null, atEnd: true })
    expect(container.textContent).toContain('대본 끝')
  })
})
