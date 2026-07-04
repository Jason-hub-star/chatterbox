import { useTranslation } from 'react-i18next'
import { setLang, SUPPORTED_LANGS, type Lang } from '@/i18n'

// 언어 라벨은 각 언어의 자칭(endonym) — 의도적으로 번역하지 않는다(i18n 관례).
const LABELS: Record<Lang, string> = { ko: '한국어', ja: '日本語', en: 'English' }

export default function LanguageToggle() {
  const { i18n } = useTranslation()
  const current = i18n.language as Lang
  return (
    <div role="group" aria-label="Language" className="inline-flex gap-1 text-sm">
      {SUPPORTED_LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLang(lang)}
          aria-pressed={current === lang}
          className={`rounded px-2 py-1 ${
            current === lang ? 'bg-fire-hot text-stage-text font-medium' : 'text-stage-text/60 hover:text-stage-text'
          }`}
        >
          {LABELS[lang]}
        </button>
      ))}
    </div>
  )
}
