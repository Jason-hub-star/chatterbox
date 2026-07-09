import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'
import RightPanel, { type RightPanelTab } from '@/features/room/RightPanel'
import { useRightPanelStore } from '@/stores/rightPanelStore'
import { useStageStore } from '@/stores/stageStore'

// G-261 자동 탭 전환: stageStore.mode 가 vgen/dub 으로 바뀌면 해당 탭 활성, normal 은 현재 탭 유지.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const tabs: RightPanelTab[] = [
  { id: 'chat', label: 'chat', render: () => null },
  { id: 'vgen', label: 'vgen', render: () => null },
  { id: 'dub', label: 'dub', render: () => null },
]

let container: HTMLElement
let root: Root | null = null

const selectedTab = () =>
  container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.textContent

beforeEach(() => {
  useRightPanelStore.setState({ activeTab: 'chat' })
  useStageStore.setState({ mode: 'normal', bannerMode: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<RightPanel tabs={tabs} />))
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
})

describe('RightPanel 자동 탭 전환 (G-261)', () => {
  it('mode=vgen 브로드캐스트 → vgen 탭 자동 활성', () => {
    expect(selectedTab()).toBe('chat')
    act(() => useStageStore.getState().announceMode('vgen'))
    expect(selectedTab()).toBe('vgen')
  })

  it('mode=dub → dub 탭, 이후 normal 복귀는 탭 유지(강제 회귀 없음)', () => {
    act(() => useStageStore.getState().announceMode('dub'))
    expect(selectedTab()).toBe('dub')
    act(() => useStageStore.getState().announceMode('normal'))
    expect(selectedTab()).toBe('dub')
  })
})
