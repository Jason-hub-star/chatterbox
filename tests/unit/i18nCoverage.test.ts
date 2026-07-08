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
  // 2026-07-08 전량 완역 후 게이트 승격: 이제 미번역 키는 "대기 목록"이 아니라 test FAIL.
  // 새 ko 키를 추가하면 en/ja 도 같은 PR 에서 채워야 통과 — "나중에 다국어" 부채를 구조적으로 차단(DoD).
  it('en 완역 유지 — ko 신규 키는 en 동시 번역 필수', () => {
    expect(missingKeys(ko, en)).toEqual([])
  })
  it('ja 완역 유지 — ko 신규 키는 ja 동시 번역 필수', () => {
    expect(missingKeys(ko, ja)).toEqual([])
  })
})
