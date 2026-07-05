import { describe, it, expect, beforeEach } from 'vitest'
import { useRightPanelStore } from '@/stores/rightPanelStore'

describe('rightPanelStore', () => {
  beforeEach(() => {
    useRightPanelStore.setState({ activeTab: '', isOpen: true })
  })

  it('setActiveTab 이 활성 탭을 바꾼다', () => {
    useRightPanelStore.getState().setActiveTab('dub')
    expect(useRightPanelStore.getState().activeTab).toBe('dub')
  })

  it('toggle 가 isOpen 을 반전한다', () => {
    expect(useRightPanelStore.getState().isOpen).toBe(true)
    useRightPanelStore.getState().toggle()
    expect(useRightPanelStore.getState().isOpen).toBe(false)
    useRightPanelStore.getState().toggle()
    expect(useRightPanelStore.getState().isOpen).toBe(true)
  })

  it('setIsOpen 이 값을 직접 설정한다', () => {
    useRightPanelStore.getState().setIsOpen(false)
    expect(useRightPanelStore.getState().isOpen).toBe(false)
  })
})
