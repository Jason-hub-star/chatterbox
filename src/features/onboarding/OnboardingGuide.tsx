import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import Modal from '@/components/shared/Modal'
import { useUserStore } from '@/stores/userStore'
import { ROOM_GENRES } from '@/lib/rooms'

// G-ONB 신규 유저 가이드: onboarding_step ∈ {'intro','genre'} 일 때만 로비에서 뜬다(LobbyPage 가 게이트).
// 기존 유저(step=null)·완료 유저('done'/'lobby')는 절대 안 뜬다. 3단: 환영 → 장르 선택 → 아바타 CTA → 완료.
// 완료/건너뛰기 모두 onboarding_step='done' 로 영속(completeOnboarding). 새 Edge 없음.
// 아바타 CTA(UX-ONB-1)는 온보딩 자체가 1회성이라 별도 영속 불필요 — [의상실로 가기]=이동+완료.
export default function OnboardingGuide() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const preferred = useUserStore((s) => s.preferredGenres)
  const complete = useUserStore((s) => s.completeOnboarding)
  const [step, setStep] = useState<'intro' | 'genre' | 'avatar'>('intro')
  const [picked, setPicked] = useState<string[]>(preferred)
  const [busy, setBusy] = useState(false)

  const toggle = (g: string) =>
    setPicked((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))

  const finish = async (genres?: string[]) => {
    if (busy) return
    setBusy(true)
    await complete(genres) // 실패해도 이번 세션 닫힘(store 낙관적)
  }

  const goAtelier = async () => {
    await finish(picked)
    navigate('/lobby/atelier')
  }

  return (
    <Modal title={t('onboarding.title')} onClose={() => void finish()}>
      {step === 'intro' ? (
        <div className="space-y-4">
          <p className="text-sm text-stage-text-muted">{t('onboarding.introBody')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setStep('genre')}
              className="flex-1 rounded-lg bg-fire-amber px-3 py-2 text-sm font-semibold text-stage-base"
            >
              {t('onboarding.next')}
            </button>
            <button
              onClick={() => void finish()}
              disabled={busy}
              className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted disabled:opacity-50"
            >
              {t('onboarding.skip')}
            </button>
          </div>
        </div>
      ) : step === 'genre' ? (
        <div className="space-y-4">
          <p className="text-sm text-stage-text-muted">{t('onboarding.genreBody')}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('onboarding.genreBody')}>
            {ROOM_GENRES.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={picked.includes(g)}
                onClick={() => toggle(g)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  picked.includes(g)
                    ? 'border-fire-amber bg-fire-amber/15 text-fire-amber'
                    : 'border-stage-border text-stage-text-muted hover:text-stage-text'
                }`}
              >
                {t(`lobby.genre.${g}`)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep('avatar')}
              className="flex-1 rounded-lg bg-fire-amber px-3 py-2 text-sm font-semibold text-stage-base"
            >
              {t('onboarding.next')}
            </button>
            <button
              onClick={() => void finish(picked)}
              disabled={busy}
              className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted disabled:opacity-50"
            >
              {t('onboarding.skip')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-stage-text-muted">{t('onboarding.avatarBody')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => void goAtelier()}
              disabled={busy}
              className="flex-1 rounded-lg bg-fire-amber px-3 py-2 text-sm font-semibold text-stage-base disabled:opacity-50"
            >
              {busy ? t('onboarding.finishing') : t('onboarding.goAtelier')}
            </button>
            <button
              onClick={() => void finish(picked)}
              disabled={busy}
              className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted disabled:opacity-50"
            >
              {t('onboarding.skip')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
