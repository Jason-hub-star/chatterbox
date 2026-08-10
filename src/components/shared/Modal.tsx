import { type ReactNode } from 'react'
import { usePopoverA11y } from '@/hooks/usePopoverA11y'

// 모달 프리미티브(트랙 B P-4): role=dialog·aria-modal·포커스 트랩·Esc 닫기·이전 포커스 복귀·백드롭 닫기.
// 위험/확인 액션은 이걸 경유한다 — 소비처: 강퇴 확인(HostConsole)·비용 확인(CostConfirmDialog).
// A11Y-POPOVER: 포커스 로직은 `usePopoverA11y` 로 이관 — 앵커가 필요해 Modal 을 못 쓰는 팝오버들과
//   같은 구현을 공유한다(구현이 둘이면 언젠가 갈린다). 마운트 = 열림이라 open 은 항상 true.
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
  const boxRef = usePopoverA11y<HTMLDivElement>(true, onClose)
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
