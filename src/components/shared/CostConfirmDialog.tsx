import { useTranslation } from 'react-i18next'
import Modal from '@/components/shared/Modal'

// 크레딧 소모 액션 확인 다이얼로그(재사용). VGEN 생성 등 과금 전 최종 확인.
// P-4(2026-07-08): Modal 프리미티브 소비로 전환 — 포커스 트랩·Esc·복귀 포커스 획득(props·내용 불변).
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
    <Modal title={t('cost.confirmQuestion')} onClose={onCancel}>
      <dl className="mt-3 space-y-1 text-sm text-stage-text-muted">
        <div className="flex justify-between"><dt>{t('cost.requiredCredits')}</dt><dd className="text-stage-text">{creditCost}</dd></div>
        <div className="flex justify-between"><dt>{t('cost.currentBalance')}</dt><dd className={enough ? 'text-stage-text' : 'text-fire-hot'}>{balance}</dd></div>
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
    </Modal>
  )
}
