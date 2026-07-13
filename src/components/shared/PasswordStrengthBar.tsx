import { useTranslation } from 'react-i18next'
import { passwordStrength, type PasswordStrength } from '@/lib/authValidation'

// 비번 강도 미터(표시용 · uiux #21 입력 중 1초 피드백). 제출 게이트는 passwordIssue 단독 —
// 이 바는 안내만 한다. 가입·재설정 공유. 빈 입력이면 렌더 안 함(노이즈 방지).
const LEVEL: Record<PasswordStrength, { fill: number; color: string; key: string }> = {
  weak: { fill: 1, color: 'bg-fire-hot', key: 'auth.strength.weak' },
  fair: { fill: 2, color: 'bg-fire-amber', key: 'auth.strength.fair' },
  good: { fill: 3, color: 'bg-fire-amber', key: 'auth.strength.good' },
  strong: { fill: 4, color: 'bg-spring-green', key: 'auth.strength.strong' },
}

export default function PasswordStrengthBar({ password }: { password: string }) {
  const { t } = useTranslation()
  if (!password) return null
  const level = passwordStrength(password)
  const { fill, color, key } = LEVEL[level]
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < fill ? color : 'bg-stage-border'}`} />
        ))}
      </div>
      <span className="text-xs text-stage-text-muted">
        {t('auth.strength.label')}: {t(key)}
      </span>
    </div>
  )
}
