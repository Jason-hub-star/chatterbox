import { useEffect, useRef, type ReactNode } from 'react'

// 모달 프리미티브(트랙 B P-4): role=dialog·aria-modal·포커스 트랩·Esc 닫기·이전 포커스 복귀·백드롭 닫기.
// 위험/확인 액션은 이걸 경유한다 — 소비처: 강퇴 확인(HostConsole)·비용 확인(CostConfirmDialog).
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export default function Modal({
  title,
  onClose,
  children,
  widthClass = 'max-w-sm',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  widthClass?: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const prevFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    prevFocus.current = document.activeElement as HTMLElement | null
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
      prevFocus.current?.focus() // 닫힐 때 열었던 요소로 복귀
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div aria-hidden className="absolute inset-0 bg-black/60" onMouseDown={onClose} />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`toast-in relative w-full ${widthClass} rounded-lg border border-stage-border bg-stage-elevated p-5 shadow-lg`}
      >
        <h3 className="text-sm font-semibold text-stage-text">{title}</h3>
        {children}
      </div>
    </div>
  )
}
