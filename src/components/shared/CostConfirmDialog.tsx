import { useTranslation } from 'react-i18next'

// 크레딧 소모 액션 확인 다이얼로그(재사용). VGEN 생성 등 과금 전 최종 확인.
// SSOT: docs/contracts/VgenPanel.md §CostActionConfirmDialog

interface Props {
  open: boolean
  creditCost: number
  balance: number
  onConfirm: () => void
  onCancel: () => void
}

export default function CostConfirmDialog({ open, creditCost, balance, onConfirm, onCancel }: Props) {
  const { t } = useTranslation()
  if (!open) return null
  const enough = balance >= creditCost
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="w-80 rounded-lg border border-stage-border bg-stage-base p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-stage-text">{t('cost.confirmQuestion')}</h3>
        <dl className="mt-3 space-y-1 text-sm text-stage-text-muted">
          <div className="flex justify-between"><dt>{t('cost.requiredCredits')}</dt><dd className="text-stage-text">{creditCost}</dd></div>
          <div className="flex justify-between"><dt>{t('cost.currentBalance')}</dt><dd className={enough ? 'text-stage-text' : 'text-red-400'}>{balance}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-stage-text-muted">{t('cost.disclaimer')}</p>
        <div className="mt-4 flex gap-2">
          <button onClick={onConfirm} disabled={!enough}
            className="flex-1 rounded-lg bg-fire-amber px-3 py-2 text-sm font-semibold text-stage-base disabled:opacity-40">
            {t('cost.startButton')}
          </button>
          <button onClick={onCancel} className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted">
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
