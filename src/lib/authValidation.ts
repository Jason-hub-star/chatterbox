// 비밀번호 강도 규칙(AuthPage.md 회원가입 §검증: 8자 + 대문자1 + 숫자1)의 단일 원천.
// RegisterPage(가입)·ResetPasswordPage(재설정)가 공유 — 규칙을 한 곳에서만 정의한다.
export type PasswordIssue = 'tooShort' | 'noUppercase' | 'noNumber'

export function passwordIssue(password: string): PasswordIssue | null {
  if (password.length < 8) return 'tooShort'
  if (!/[A-Z]/.test(password)) return 'noUppercase'
  if (!/[0-9]/.test(password)) return 'noNumber'
  return null
}

// 강도 미터(표시용 — 제출 게이트는 passwordIssue 가 단독 판정). 규칙과 정합: passwordIssue==null(유효)
// 이면 대문자+숫자+8자를 이미 만족하므로 최소 'fair' 이상(유효 비번은 절대 'weak' 아님).
export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong'

export function passwordStrength(password: string): PasswordStrength {
  if (password.length < 8) return 'weak'
  let score = 0
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1 // 기호
  if (password.length >= 12) score += 1
  if (password.length >= 16) score += 1
  if (score <= 1) return 'weak'
  if (score === 2) return 'fair'
  if (score === 3) return 'good'
  return 'strong'
}
