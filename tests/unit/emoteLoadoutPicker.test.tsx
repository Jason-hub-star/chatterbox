import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'
import EmoteLoadoutPicker from '@/features/reaction/EmoteLoadoutPicker'
import { useReactionStore, DEFAULT_SLOTS, MAX_SLOTS, STORAGE_KEY } from '@/stores/reactionStore'
import { EMOTE_CATALOG } from '@/features/reaction/reactionCatalog'

// ROOM-12 기능화: 로드아웃 피커 — 추가/제거/순서/저장, 빈 로드아웃 방지, MAX_SLOTS 상한.
// 언어 독립 선택자(Tailwind 클래스·구조)로 질의 — i18n 텍스트에 의존하지 않음.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root | null = null
let closed = false
// Node 내장 localStorage 스텁(clear 부재)을 인메모리로 고정(scriptPanelFontScale 테스트와 동일 패턴).
let mem: Map<string, string>

beforeEach(() => {
  mem = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  })
  useReactionStore.setState({ slots: DEFAULT_SLOTS })
  closed = false
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<EmoteLoadoutPicker onClose={() => { closed = true }} />))
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
  vi.unstubAllGlobals()
})

const loadoutItems = () => container.querySelectorAll('[role="dialog"] ul > li')
const paletteBtns = () => container.querySelectorAll<HTMLButtonElement>('.flex-wrap button')
const saveBtn = () => container.querySelector<HTMLButtonElement>('[role="dialog"] button.bg-fire-amber')!
const resetBtn = () => container.querySelector<HTMLButtonElement>('[role="dialog"] button.underline')!

describe('EmoteLoadoutPicker', () => {
  it('초기 draft = 현재 slots(기본 8), 팔레트=카탈로그−로드아웃', () => {
    expect(loadoutItems().length).toBe(DEFAULT_SLOTS.length)
    expect(paletteBtns().length).toBe(EMOTE_CATALOG.length - DEFAULT_SLOTS.length)
  })

  it('팔레트 추가 → 로드아웃 증가, 저장 → setSlots 영속(localStorage)', () => {
    act(() => paletteBtns()[0].click())
    expect(loadoutItems().length).toBe(DEFAULT_SLOTS.length + 1)
    act(() => saveBtn().click())
    expect(closed).toBe(true)
    expect(useReactionStore.getState().slots.length).toBe(DEFAULT_SLOTS.length + 1)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).length).toBe(DEFAULT_SLOTS.length + 1)
  })

  it('MAX_SLOTS 상한 — 12 도달 시 팔레트 전부 비활성', () => {
    for (let k = 0; k < MAX_SLOTS - DEFAULT_SLOTS.length; k++) act(() => paletteBtns()[0].click())
    expect(loadoutItems().length).toBe(MAX_SLOTS)
    expect([...paletteBtns()].every((b) => b.disabled)).toBe(true)
  })

  it('빈 로드아웃 방지 — 마지막 1개는 제거 버튼 disabled', () => {
    for (let k = 0; k < DEFAULT_SLOTS.length - 1; k++) {
      const li = container.querySelector('[role="dialog"] ul > li')!
      const btns = li.querySelectorAll('button')
      act(() => (btns[btns.length - 1] as HTMLButtonElement).click()) // ✕ = 마지막 버튼
    }
    expect(loadoutItems().length).toBe(1)
    const last = container.querySelectorAll('[role="dialog"] ul > li button')
    expect((last[last.length - 1] as HTMLButtonElement).disabled).toBe(true)
  })

  it('기본값 복원', () => {
    act(() => paletteBtns()[0].click())
    act(() => paletteBtns()[0].click())
    act(() => resetBtn().click())
    expect(loadoutItems().length).toBe(DEFAULT_SLOTS.length)
  })
})
