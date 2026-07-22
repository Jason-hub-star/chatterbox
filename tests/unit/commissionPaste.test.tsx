import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'
import CommissionCorner from '@/features/avatar/CommissionCorner'

// 의상실 붙여넣기(Ctrl/Cmd+V) 배선 회귀 테스트: 클립보드 이미지 → 기존 accept() → 프리뷰+주문 활성.
// jsdom 은 이미지 디코드/blob URL 미구현이라 validatePng(new Image + createObjectURL)만 결정론 스텁.
// 디코드 자체는 검증 대상이 아님(파일선택·드롭 경로와 공유) — 여기 관심은 '붙여넣기가 accept 에 도달하는가'.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class MockImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 1024
  naturalHeight = 1024
  set src(_v: string) {
    setTimeout(() => this.onload?.(), 0) // 즉시 성공 디코드(512px 이상)
  }
}

let container: HTMLElement
let root: Root | null = null
let origCreate: typeof URL.createObjectURL
let origRevoke: typeof URL.revokeObjectURL

const pngFile = () => new File([new Uint8Array([137, 80, 78, 71])], 'pasted.png', { type: 'image/png' })
// 다포맷 네이티브 통과(재인코딩 없음): WebP/JPEG 는 허용 셋(AVATAR_UPLOAD_MIME)이라 그대로 수락,
// SVG 는 image/* 지만 허용 셋 밖이라 거절. MockImage 가 크기를 통과시키므로 관심은 '포맷 게이트'.
const webpFile = () => new File([new Uint8Array([82, 73, 70, 70])], 'pasted.webp', { type: 'image/webp' })
const svgFile = () => new File(['<svg/>'], 'pasted.svg', { type: 'image/svg+xml' })

// clipboardData 를 붙인 합성 paste 이벤트(jsdom ClipboardEvent 미완 → Event + defineProperty).
const pasteEvent = (items: Array<{ type: string; getAsFile: () => File | null }>) => {
  const evt = new Event('paste')
  Object.defineProperty(evt, 'clipboardData', { value: { items } })
  return evt
}

const flush = () => act(async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)) })

const dialog = () => container.querySelector('[role="dialog"]')!
const confirmBtn = () =>
  [...dialog().querySelectorAll('button')].find((b) => b.className.includes('bg-fire-amber/15')) as HTMLButtonElement

beforeEach(() => {
  vi.stubGlobal('Image', MockImage)
  origCreate = URL.createObjectURL
  origRevoke = URL.revokeObjectURL
  URL.createObjectURL = () => 'blob:mock'
  URL.revokeObjectURL = () => {}
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root!.render(
      <CommissionCorner
        jobs={[]}
        onSubmit={async () => {}}
        wizardOpen
        onWizardToggle={() => {}}
        reused={false}
        onDismissReused={() => {}}
        awayDone={0}
        onDismissAwayDone={() => {}}
      />,
    ),
  )
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
  URL.createObjectURL = origCreate
  URL.revokeObjectURL = origRevoke
  vi.unstubAllGlobals()
})

describe('CommissionCorner 붙여넣기(Ctrl/Cmd+V)', () => {
  it('클립보드 이미지 붙여넣기 → 프리뷰 노출 + 주문 버튼 활성화', async () => {
    expect(dialog().querySelector('img')).toBeNull()
    expect(confirmBtn().disabled).toBe(true)

    act(() => void window.dispatchEvent(pasteEvent([{ type: 'image/png', getAsFile: pngFile }])))
    await flush()

    expect(dialog().querySelector('img')).not.toBeNull()
    expect(confirmBtn().disabled).toBe(false)
  })

  it('WebP 붙여넣기 → 네이티브 통과(재인코딩 없이 수락) → 프리뷰+주문 활성', async () => {
    act(() => void window.dispatchEvent(pasteEvent([{ type: 'image/webp', getAsFile: webpFile }])))
    await flush()

    expect(dialog().querySelector('img')).not.toBeNull()
    expect(confirmBtn().disabled).toBe(false)
  })

  it('허용 외 이미지(SVG) 붙여넣기 → 거절(주문 버튼 계속 비활성)', async () => {
    act(() => void window.dispatchEvent(pasteEvent([{ type: 'image/svg+xml', getAsFile: svgFile }])))
    await flush()

    expect(dialog().querySelector('img')).toBeNull()
    expect(confirmBtn().disabled).toBe(true)
  })

  it('비이미지 붙여넣기 → no-op(주문 버튼 계속 비활성)', async () => {
    act(() => void window.dispatchEvent(pasteEvent([{ type: 'text/plain', getAsFile: () => null }])))
    await flush()

    expect(dialog().querySelector('img')).toBeNull()
    expect(confirmBtn().disabled).toBe(true)
  })

  it('위저드 닫히면 window paste 리스너 해제(전역 하이재킹 없음)', async () => {
    act(() =>
      root!.render(
        <CommissionCorner
          jobs={[]}
          onSubmit={async () => {}}
          wizardOpen={false}
          onWizardToggle={() => {}}
          reused={false}
          onDismissReused={() => {}}
          awayDone={0}
          onDismissAwayDone={() => {}}
        />,
      ),
    )
    // 위저드 미마운트 상태에서 붙여넣기해도 예외/상태변화 없음(리스너 cleanup 확인).
    act(() => void window.dispatchEvent(pasteEvent([{ type: 'image/png', getAsFile: pngFile }])))
    await flush()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})
