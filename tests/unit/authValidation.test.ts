import { describe, expect, it } from 'vitest'
import { passwordIssue } from '@/lib/authValidation'

// A-FUNC-2 공유 비번 강도 규칙의 그라운드 트루스(가입·재설정이 같은 규칙을 쓰게).
describe('passwordIssue (비번 강도 공유 규칙)', () => {
  it('8자 미만은 tooShort', () => {
    expect(passwordIssue('Ab1')).toBe('tooShort')
  })
  it('대문자 없으면 noUppercase', () => {
    expect(passwordIssue('abcdefg1')).toBe('noUppercase')
  })
  it('숫자 없으면 noNumber', () => {
    expect(passwordIssue('Abcdefgh')).toBe('noNumber')
  })
  it('8자+대문자+숫자면 통과(null)', () => {
    expect(passwordIssue('Abcdefg1')).toBeNull()
  })
})
