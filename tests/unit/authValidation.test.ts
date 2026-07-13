import { describe, expect, it } from 'vitest'
import { passwordIssue, passwordStrength } from '@/lib/authValidation'

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

// 강도 미터(표시용) — passwordIssue 규칙과 정합. 유효 비번은 절대 weak 아님.
describe('passwordStrength (미터)', () => {
  it('빈값·7자 미만은 weak', () => {
    expect(passwordStrength('')).toBe('weak')
    expect(passwordStrength('Aa1')).toBe('weak')
    expect(passwordStrength('Aa1!')).toBe('weak') // 조건 만족해도 8자 미만
  })
  it('유효 비번(passwordIssue==null)은 절대 weak 아님(최소 fair)', () => {
    for (const pw of ['Abcdefg1', 'Password1', 'Xy9zzzzz']) {
      expect(passwordIssue(pw)).toBeNull()
      expect(passwordStrength(pw)).not.toBe('weak')
    }
  })
  it('겨우 충족(대문자+숫자+8자)은 fair', () => {
    expect(passwordStrength('Abcdefg1')).toBe('fair')
  })
  it('길이/기호로 good→strong 승급', () => {
    expect(passwordStrength('Abcdefghijk1')).toBe('good') // 12자+대문자+숫자 = 3
    expect(passwordStrength('Abcdefgh1!xyz')).toBe('strong') // +기호+12자 = 4
    expect(passwordStrength('Abcdefghijklmnop1!')).toBe('strong') // 16자+ = 5
  })
})
