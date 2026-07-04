import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export default function LandingPage() {
  const { t } = useTranslation()
  return (
    <main className="min-h-screen bg-stage-base text-stage-text flex flex-col items-center justify-center gap-6">
      <h1 className="text-5xl font-bold">ChatterBox</h1>
      <p className="text-stage-text-muted">{t('landing.tagline')}</p>
      <div className="flex gap-3">
        <Link
          to="/login"
          className="rounded-full bg-fire-amber px-6 py-3 font-medium text-stage-base"
        >
          {t('landing.login')}
        </Link>
        <Link
          to="/register"
          className="rounded-full border border-stage-border px-6 py-3 font-medium text-stage-text"
        >
          {t('landing.signup')}
        </Link>
      </div>
    </main>
  )
}
