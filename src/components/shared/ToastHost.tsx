import { useTranslation } from 'react-i18next'
import { useToastStore } from '@/stores/toastStore'

// 피드백 채널(toastStore, A-SEAM-1)의 표현부(트랙 B P-1). 큐·4s 자동소멸은 store 소유 — 여기는 렌더만.
// 하단 중앙 고정: 상단(배너·헤더)·우측(패널)과 안 겹치고 무대 아바타를 가리지 않는 자리.
// 의미색은 씬 액센트와 무관하게 전역 고정(성공/실패 의미가 색의 주인).
// 아이콘·모션은 이 파일이 유일 결정 지점 — spritegen 교체 지점(내부만 바꾸면 전 화면 교체).
const KIND_CLASS: Record<string, string> = {
  success: 'text-spring-green border-spring-green/40',
  error: 'toast-wobble text-fire-hot border-fire-hot/40',
  info: 'text-stage-text border-stage-border',
}

export default function ToastHost() {
  const { t } = useTranslation()
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2">
      {toasts.map((item) => (
        <div
          key={item.id}
          role={item.kind === 'error' ? 'alert' : 'status'}
          className={`toast-in pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border bg-stage-elevated py-2 pl-4 pr-2 text-sm shadow-lg ${KIND_CLASS[item.kind]}`}
        >
          {item.kind === 'success' && (
            <svg className="toast-check h-4 w-4 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <span>{item.message}</span>
          <button
            onClick={() => dismiss(item.id)}
            aria-label={t('common.close')}
            className="rounded p-1 text-stage-text-muted hover:text-stage-text focus-visible:outline focus-visible:outline-stage-border"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
