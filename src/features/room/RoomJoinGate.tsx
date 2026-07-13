import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import NeonOnAir from '@/components/shared/NeonOnAir'

// 입장 게이트(R-커밋: RoomPage 에서 순수 이동) — joining/entering 로딩·입장 / error / password 입력 / kicked.
// 비밀번호 입력의 로컬 상태(입력·busy·오류)는 이 컴포넌트 소유, 서버 검증은 onSubmitPassword(실패 시 throw).
interface Props {
  phase: 'joining' | 'entering' | 'error' | 'password' | 'kicked'
  backdrop?: string // 조인 대기 백드롭(분장실과 같은 대극장 원화 — 시각 연속)
  joinError: string | null
  kickReason: string | null
  onCancel: () => void // 로비 복귀(joining 중엔 진행 중 join fetch abort 포함 — RoomPage 소유)
  onSubmitPassword: (password: string) => Promise<void>
}

export default function RoomJoinGate({ phase, backdrop, joinError, kickReason, onCancel, onSubmitPassword }: Props) {
  const { t } = useTranslation()
  const [passwordInput, setPasswordInput] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwErr, setPwErr] = useState<string | null>(null)

  if (phase === 'joining' || phase === 'entering') {
    const entering = phase === 'entering'
    return (
      <main className="relative grid min-h-screen place-items-center overflow-hidden bg-stage-base text-stage-text-muted">
        {backdrop && (
          <img src={backdrop} alt="" aria-hidden="true" draggable={false} className="scene-veil select-none" />
        )}
        <div className="scene-veil-in relative flex flex-col items-center gap-4">
          <NeonOnAir entering={entering} />
          <p role="status" aria-live="polite" className="text-base drop-shadow md:text-lg">
            {t(entering ? 'room.entering' : 'room.joining')}
          </p>
          {/* 입장 확정 뒤(entering) 취소는 무의미 — 죽은 클릭 방지로 숨김 */}
          {!entering && (
            <button
              onClick={onCancel}
              className="rounded-lg border border-stage-border bg-stage-base/60 px-4 py-2 text-sm text-stage-text-muted backdrop-blur hover:text-stage-text"
            >
              {t('room.joinCancel')}
            </button>
          )}
        </div>
      </main>
    )
  }

  if (phase === 'password') {
    const submit = async (e: React.FormEvent) => {
      e.preventDefault()
      setPwBusy(true)
      setPwErr(null)
      try {
        await onSubmitPassword(passwordInput)
      } catch {
        setPwErr(t('room.wrongPassword'))
        setPwBusy(false)
      }
    }
    return (
      <main className="grid min-h-screen place-items-center bg-stage-base text-stage-text">
        <form onSubmit={submit} className="w-full max-w-xs px-6 text-center">
          <p className="mb-4 text-sm text-stage-text-muted">{t('room.passwordPrompt')}</p>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            aria-label={t('room.passwordLabel')}
            placeholder={t('room.passwordLabel')}
            maxLength={64}
            autoFocus
            className="w-full rounded-lg border border-stage-border bg-transparent px-4 py-2 text-sm"
          />
          {pwErr && <p className="mt-2 text-xs text-fire-hot" role="alert">{pwErr}</p>}
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="submit"
              disabled={pwBusy || !passwordInput}
              className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {t('room.passwordSubmit')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </main>
    )
  }

  // error / kicked — 메시지만 다른 동일 골격
  return (
    <main className="grid min-h-screen place-items-center bg-stage-base text-stage-text">
      <div className="text-center">
        <p className="text-fire-hot" role="alert">{phase === 'kicked' ? t('host.kickedNotice') : joinError}</p>
        {phase === 'kicked' && kickReason && (
          <p className="mt-2 text-sm text-stage-text-muted">{t('host.kickReasonShown', { reason: kickReason })}</p>
        )}
        <button
          onClick={onCancel}
          className="mt-4 rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
        >
          {t('room.backToLobby')}
        </button>
      </div>
    </main>
  )
}
