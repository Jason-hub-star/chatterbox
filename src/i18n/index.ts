// i18n 개통(INFRA-05 / G-17). SSOT: docs/PLATFORM-ARCHITECTURE.md §60·docs/FEATURE-SPEC.md SET-04.
// 스택 = i18next + react-i18next(FRONTEND-MAP 의 content.ts/useContent 는 폐기 레거시 — 이쪽으로 단일화).
// 언어 선택은 localStorage 기반(최소 개통). users.language DB 동기화는 후속(thin).
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { ko } from './locales/ko'
import { ja } from './locales/ja'
import { en } from './locales/en'

export const SUPPORTED_LANGS = ['ko', 'ja', 'en'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]

const STORAGE_KEY = 'cb.lang'
const isLang = (v: unknown): v is Lang => SUPPORTED_LANGS.includes(v as Lang)

function detectInitial(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLang(stored)) return stored
  } catch {
    // localStorage 접근 불가(SSR/프라이버시 모드) — 기본값
  }
  return 'ko'
}

void i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    ja: { translation: ja },
    en: { translation: en },
  },
  lng: detectInitial(),
  fallbackLng: 'ko',
  keySeparator: false, // 점 포함 문자열을 통째로 키로 사용(중첩 아님) — 병렬 병합 단순화
  nsSeparator: false,
  interpolation: { escapeValue: false }, // React 가 XSS 이스케이프 담당
})

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // 저장 실패해도 세션 내 전환은 반영
  }
  void i18n.changeLanguage(lang)
}

export default i18n
