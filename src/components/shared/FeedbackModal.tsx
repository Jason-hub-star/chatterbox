import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '@/components/shared/Modal'
import { useUserStore } from '@/stores/userStore'
import {
  FEEDBACK_CATEGORIES,
  createFeedback,
  fetchMyFeedback,
  type FeedbackCategory,
  type MyFeedback,
} from '@/lib/feedback'

// 문제 알리기(ISS-04 창구) — 카테고리+설명+진단 동의(opt-in, 수집 항목 그대로 표시) → 접수번호.
// 접수 후 같은 모달에서 내 문의 상태(received→investigating→fixed)를 확인한다.
export default function FeedbackModal({ onClose, avatarJobId }: { onClose: () => void; avatarJobId?: string }) {
  const { t } = useTranslation()
  const session = useUserStore((s) => s.session)
  const avatarUrl = useUserStore((s) => s.avatarUrl)
  const [category, setCategory] = useState<FeedbackCategory>('avatar')
  const [description, setDescription] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [ticket, setTicket] = useState<string | null>(null)
  const [mine, setMine] = useState<MyFeedback[]>([])

  useEffect(() => {
    fetchMyFeedback()
      .then(setMine)
      .catch(() => {
        /* 목록은 부가 정보 — 실패해도 접수 흐름 유지 */
      })
  }, [ticket])

  const submit = async () => {
    if (!session || !description.trim() || busy) return
    setBusy(true)
    setFailed(false)
    try {
      const diag = consent
        ? {
            ...(avatarJobId ? { avatar_job_id: avatarJobId } : {}),
            ...(avatarUrl ? { avatar_url: avatarUrl.slice(0, 300) } : {}),
            user_agent: navigator.userAgent.slice(0, 300),
            app_url: window.location.pathname.slice(0, 300),
          }
        : undefined
      const res = await createFeedback(session.access_token, { category, description: description.trim(), diag })
      setTicket(res.id)
      setDescription('')
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t('feedback.title')} onClose={onClose}>
      {ticket ? (
        <div className="mt-2 space-y-2">
          <p className="rounded-lg bg-fire-amber/10 px-3 py-2 text-sm font-semibold text-fire-amber">
            {t('feedback.ticket', { id: ticket.slice(0, 8).toUpperCase() })}
          </p>
          <p className="text-xs text-stage-text-muted">{t('feedback.successBody')}</p>
        </div>
      ) : (
        <>
          <div className="mt-2 space-y-1.5" role="radiogroup" aria-label={t('feedback.categoryLabel')}>
            {FEEDBACK_CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="feedback-category"
                  value={c}
                  checked={category === c}
                  onChange={() => setCategory(c)}
                />
                {t(`feedback.category.${c}`)}
              </label>
            ))}
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={3}
            aria-label={t('feedback.placeholder')}
            placeholder={t('feedback.placeholder')}
            className="mt-3 w-full rounded-lg border border-stage-border bg-transparent px-3 py-2 text-sm"
          />
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>
              {t('feedback.consent')}
              <span className="mt-0.5 block text-[11px] text-stage-text-muted">{t('feedback.consentItems')}</span>
              <span className="block text-[11px] text-stage-text-muted">{t('feedback.consentNote')}</span>
            </span>
          </label>
          {failed && (
            <p className="mt-2 rounded bg-fire-hot/10 px-2.5 py-1.5 text-xs text-fire-hot" role="alert">
              {t('feedback.error')}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void submit()}
              disabled={busy || !description.trim()}
              className="flex-1 rounded-lg bg-fire-amber px-3 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {busy ? t('feedback.submitting') : t('feedback.submit')}
            </button>
            <button onClick={onClose} className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted">
              {t('common.cancel')}
            </button>
          </div>
        </>
      )}
      {mine.length > 0 && (
        <div className="mt-4 border-t border-stage-border pt-2">
          <p className="text-xs font-semibold text-stage-text-muted">{t('feedback.myList')}</p>
          <ul className="mt-1 space-y-1">
            {mine.map((f) => (
              <li key={f.id} className="flex items-center justify-between text-[11px] text-stage-text-muted">
                <span>
                  {t(`feedback.category.${f.category}`)} · {new Date(f.created_at).toLocaleDateString()}
                </span>
                <span className={f.status === 'fixed' ? 'font-semibold text-fire-amber' : ''}>
                  {t(`feedback.status.${f.status}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
