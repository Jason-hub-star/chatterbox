import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'
import RoomBottomBar from '@/features/room/RoomBottomBar'

// ISS-04 방 안 문제 알리기 진입점 회귀 잠금.
//  - 관전자(viewer)도 보여야 한다: '소리·마이크가 이상해요'는 관전자가 더 자주 겪는다.
//  - **연결이 끊겨도 눌려야 한다**: 형제 버튼(마이크·🎧·리액션)은 전부 !connected 로 disabled 지만,
//    연결 실패 자체가 신고 사유이므로 이 버튼만 예외다. 무심코 disabled 를 맞추면 결함이 된다.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root | null = null
let reported = 0

const props = {
  isViewer: false,
  micEnabled: true,
  mutedByHost: false,
  handRaised: false,
  connected: true,
  mixerOpen: false,
  onToggleMic: () => {},
  onToggleHand: () => {},
  onToggleMixer: () => {},
  onOpenReactions: () => {},
  onReportProblem: () => { reported += 1 },
  onLeave: () => {},
}

const render = (over: Partial<typeof props> = {}) =>
  act(() => root!.render(<RoomBottomBar {...props} {...over} />))

const reportBtn = () =>
  [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === i18n.t('feedback.button'))

beforeEach(() => {
  reported = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
  vi.clearAllMocks()
})

describe('RoomBottomBar 문제 알리기', () => {
  it('배우·관전자 모두에게 보인다', () => {
    render()
    expect(reportBtn()).toBeTruthy()
    render({ isViewer: true })
    expect(reportBtn()).toBeTruthy()
  })

  it('연결이 끊겨도 눌린다(연결 실패가 곧 신고 사유)', () => {
    render({ connected: false })
    const b = reportBtn()!
    expect(b.disabled).toBe(false)
    // 대조: 같은 바의 리액션 버튼은 끊기면 잠긴다 — 예외가 의도된 것임을 고정.
    const reactions = [...container.querySelectorAll('button')]
      .find((x) => x.getAttribute('aria-label') === i18n.t('room.openReactions'))!
    expect(reactions.disabled).toBe(true)
    act(() => b.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(reported).toBe(1)
  })
})
