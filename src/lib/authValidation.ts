// 비밀번호 강도 규칙(AuthPage.md 회원가입 §검증: 8자 + 대문자1 + 숫자1)의 단일 원천.
// RegisterPage(가입)·ResetPasswordPage(재설정)가 공유 — 규칙을 한 곳에서만 정의한다.
export type PasswordIssue = 'tooShort' | 'noUppercase' | 'noNumber'

export function passwordIssue(password: string): PasswordIssue | null {
  if (password.length < 8) return 'tooShort'
  if (!/[A-Z]/.test(password)) return 'noUppercase'
  if (!/[0-9]/.test(password)) return 'noNumber'
  return null
}
