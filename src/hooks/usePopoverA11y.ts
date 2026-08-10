import { useEffect, useRef } from 'react'

// A11Y-POPOVER: 포커스 관리 단일 지점.
//
// `Modal.tsx` 는 포커스 트랩·Esc·초기 포커스·이전 포커스 복귀를 갖췄고 11개 화면이 재사용하는데,
// 앵커가 필요해 Modal 을 못 쓴 팝오버들(벨·만들기 메뉴·친구·믹서)은 제각각이었다 — 어떤 건 Esc 만,
// 어떤 건 바깥클릭만, 포커스는 전부 없었다. 키보드 사용자는 열린 팝오버 안으로 들어갈 수 없었고,
// 닫은 뒤 포커스가 문서 처음으로 튀었다.
//
// 그래서 **로직만** 훅으로 빼고 마크업(앵커 위치·크기)은 각자 유지한다. Modal 도 이 훅을 쓴다 —
// 구현이 둘이면 언젠가 갈린다.
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * @param open  팝오버가 열려 있는가. false 면 아무것도 등록하지 않는다.
 * @param onClose Esc 로 닫을 때 호출.
 * @returns 패널 요소에 붙일 ref — 트랩 범위이자 초기 포커스 대상(비어 있으면 패널 자신, `tabIndex={-1}` 필요).
 */
export function usePopoverA11y<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const boxRef = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    const prevFocus = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(boxRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    ;(focusables()[0] ?? boxRef.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key !== 'Tab') return
      const els = focusables()
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prevFocus?.focus() // 닫을 때 열었던 요소(토글 버튼)로 복귀 — 안 하면 포커스가 문서 처음으로 튄다
    }
  }, [open, onClose])
  return boxRef
}
