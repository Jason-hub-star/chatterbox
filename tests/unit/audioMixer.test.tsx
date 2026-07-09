import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'
import AudioMixerPanel from '@/features/room/AudioMixerPanel'
import { useAudioStore, mixedVolume } from '@/stores/audioStore'
import { useRoomStore, type RoomParticipant } from '@/stores/roomStore'

// ROOM-08 음량 믹서: mixedVolume 순수식 + 패널(마스터·참가자 슬라이더 → 스토어 반영, 원격 없음 안내).
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const p = (identity: string, isLocal = false): RoomParticipant => ({
  identity,
  name: identity,
  isLocal,
  isSpeaking: false,
})

// React 가 추적하는 controlled input 값 변경(네이티브 setter + input 이벤트).
const setRange = (input: HTMLInputElement, v: string) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('mixedVolume', () => {
  it('master × 참가자별(기본 1), 0~1 클램프', () => {
    expect(mixedVolume({ masterVolume: 1, participantVolumes: {} }, 'a')).toBe(1)
    expect(mixedVolume({ masterVolume: 0.5, participantVolumes: { a: 0.5 } }, 'a')).toBe(0.25)
    expect(mixedVolume({ masterVolume: 0, participantVolumes: { a: 1 } }, 'a')).toBe(0)
  })
})

describe('AudioMixerPanel', () => {
  let container: HTMLElement
  let root: Root | null = null

  beforeEach(() => {
    useAudioStore.setState({ masterVolume: 1, participantVolumes: {} })
    useRoomStore.setState({ participants: [p('me', true), p('alice'), p('bob')] })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(<AudioMixerPanel />))
    act(() => container.querySelector<HTMLButtonElement>('button[title]')!.click()) // 토글 열기
  })

  afterEach(() => {
    act(() => root?.unmount())
    root = null
    container.remove()
    act(() => useRoomStore.getState().reset())
  })

  it('원격 참가자 수만큼 슬라이더(로컬 제외) + 마스터', () => {
    const sliders = container.querySelectorAll('input[type="range"]')
    expect(sliders.length).toBe(3) // master + alice + bob
  })

  it('참가자 슬라이더 → participantVolumes, 마스터 → masterVolume', () => {
    const sliders = container.querySelectorAll<HTMLInputElement>('input[type="range"]')
    setRange(sliders[1], '0.3') // alice
    expect(useAudioStore.getState().participantVolumes.alice).toBeCloseTo(0.3)
    setRange(sliders[0], '0.5') // master
    expect(useAudioStore.getState().masterVolume).toBeCloseTo(0.5)
  })

  it('원격 없음 → 안내 문구', () => {
    act(() => useRoomStore.setState({ participants: [p('me', true)] }))
    expect(container.querySelectorAll('input[type="range"]').length).toBe(1) // master 만
    expect(container.textContent).toContain('없어요')
  })
})
