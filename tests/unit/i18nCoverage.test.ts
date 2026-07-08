import { describe, expect, it } from 'vitest'
import { ko } from '@/i18n/locales/ko'
import { ja } from '@/i18n/locales/ja'
import { en } from '@/i18n/locales/en'
import { missingKeys, orphanKeys } from '@/i18n/coverage'

// A-SEAM-5 키 구조 가드: ko=SSOT. en/ja 는 부분집합이어야 하고(오펀=오타→렌더 실패), 빠진 키는 B worklist.
describe('i18n 키 구조(A-SEAM-5)', () => {
  it('en 은 ko 의 부분집합(오펀 키 0 — ko 없는 키는 오타)', () => {
    expect(orphanKeys(ko, en)).toEqual([])
  })
  it('ja 는 ko 의 부분집합(오펀 키 0)', () => {
    expect(orphanKeys(ko, ja)).toEqual([])
  })
  it('번역 대기 목록(빠진 키)을 산출한다 — 트랙 B가 채울 slot', () => {
    // 현재 미완은 정상(fallback:ko). 목록이 계산되는 구조만 확정한다.
    expect(Array.isArray(missingKeys(ko, en))).toBe(true)
    expect(Array.isArray(missingKeys(ko, ja))).toBe(true)
  })
})
