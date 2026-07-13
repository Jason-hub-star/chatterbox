import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'
import ScriptPanel from '@/features/script/ScriptPanel'
import type { Script } from '@/features/script/cues'

// MILESTONES Phase 3 AC "개인 글자 크기 조절" — 3단계 스텝·경계 비활성·localStorage 복원(새로고침 유지).
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const script: Script = {
  id: 's1',
  title: 'T',
  roles: ['A'],
  cues: [{ role: 'A', text: 'hello' }],
}

let container: HTMLElement
let root: Root | null = null

function render() {
  root = createRoot(container)
  act(() => {
    root!.render(
      <ScriptPanel
        script={script}
        cueIndex={0}
        canAdvance={false}
        isHost={false}
        isViewer={false}
        scriptMode="performance"
        roleMap={{}}
        myAuthId="u1"
        actors={[]}
        onClaim={() => {}}
        onRelease={() => {}}
        onAssign={() => {}}
        onToggleMode={() => {}}
        onAdvance={() => {}}
      />,
    )
  })
}

const cueText = () => container.querySelector('[data-testid="current-cue"] p')!
const fontButtons = () => container.querySelectorAll<HTMLButtonElement>('[role="group"] button')
// A안: 글자 크기 컨트롤은 ⚙ 설정 드로어(기본 접힘) 안 — 클릭 검증 전 열어야 한다. 현재 대사 반영은 상시.
const settingsToggle = () => container.querySelector<HTMLButtonElement>('button[aria-expanded]')!
const click = (btn: HTMLButtonElement) => act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })))

// vitest 워커의 globalThis.localStorage 가 Node 내장 스텁(clear 부재)에 가려질 수 있어 인메모리로 고정.
let mem: Map<string, string>

beforeEach(() => {
  mem = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  })
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
  vi.unstubAllGlobals()
})

describe('ScriptPanel 개인 글자 크기', () => {
  it('기본 md — 현재 대사 text-lg', () => {
    render()
    expect(cueText().classList.contains('text-lg')).toBe(true)
  })

  it('A+ → lg(text-2xl) 확대 + localStorage 저장 + 상한에서 A+ 비활성', () => {
    render()
    click(settingsToggle())
    const [smaller, larger] = fontButtons()
    click(larger)
    expect(cueText().classList.contains('text-2xl')).toBe(true)
    expect(localStorage.getItem('cb.scriptFontScale')).toBe('lg')
    expect(larger.disabled).toBe(true)
    expect(smaller.disabled).toBe(false)
  })

  it('A− → sm(text-base) 축소 + 하한에서 A− 비활성', () => {
    render()
    click(settingsToggle())
    const [smaller] = fontButtons()
    click(smaller)
    expect(cueText().classList.contains('text-base')).toBe(true)
    expect(localStorage.getItem('cb.scriptFontScale')).toBe('sm')
    expect(smaller.disabled).toBe(true)
  })

  it('저장된 스케일을 재마운트(새로고침)에서 복원', () => {
    localStorage.setItem('cb.scriptFontScale', 'lg')
    render()
    expect(cueText().classList.contains('text-2xl')).toBe(true)
  })

  it('이상한 저장값은 md 로 폴백', () => {
    localStorage.setItem('cb.scriptFontScale', 'zz')
    render()
    expect(cueText().classList.contains('text-lg')).toBe(true)
  })
})
