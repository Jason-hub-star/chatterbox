import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LABELS, type LegalContent } from '@/pages/legal/content'

// 법률 문서 표시(공개) — 개인정보처리방침·서비스 이용약관 공용 레이아웃.
// 본문 한글은 전부 데이터(props)에서 {} 로 렌더 → JSXText 한글 lint 게이트에 걸리지 않음.
export default function LegalDoc({ doc }: { doc: LegalContent }) {
  const { t } = useTranslation()
  return (
    <main className="min-h-screen bg-stage-base text-stage-text">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link to="/" className="text-sm text-stage-text-muted transition hover:text-stage-text">
          ← {t('common.back')}
        </Link>

        <h1 className="mt-6 text-2xl font-bold">{doc.title}</h1>
        <p className="mt-1 text-sm text-stage-text-muted">{doc.updated}</p>
        <p className="mt-6 text-sm leading-relaxed text-stage-text-muted">{doc.intro}</p>

        <div className="mt-8 space-y-6">
          {doc.sections.map((s) => (
            <section key={s.h} className="space-y-2">
              <h2 className="text-base font-semibold text-stage-text">{s.h}</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-stage-text-muted">{s.p}</p>
            </section>
          ))}
        </div>

        <footer className="mt-12 flex gap-5 border-t border-stage-border pt-6 text-sm text-fire-amber">
          <Link to="/privacy" className="hover:underline">
            {LABELS.privacy}
          </Link>
          <Link to="/terms" className="hover:underline">
            {LABELS.terms}
          </Link>
        </footer>
      </div>
    </main>
  )
}
