import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import NeonOnAir from '@/components/shared/NeonOnAir'

// 입장 게이트(R-커밋: RoomPage 에서 순수 이동) — joining/entering 로딩·입장 / error / password 입력 / kicked.
// 비밀번호 입력의 로컬 상태(입력·busy·오류)는 이 컴포넌트 소유, 서버 검증은 onSubmitPassword(실패 시 throw).
interface Props {
  phase: 'choose' | 'joining' | 'entering' | 'error' | 'password' | 'kicked'
  backdrop?: string // 조인 대기 백드롭(분장실과 같은 대극장 원화 — 시각 연속)
  joinError: string | null
  kickReason: string | null
  onCancel: () => void // 로비 복귀(joining 중엔 진행 중 join fetch abort 포함 — RoomPage 소유)
  onSubmitPassword: (password: string) => Promise<void>
  onRetry?: () => void // error 단계 재시도(RM-JOIN-RETRY) — 이탈 없이 재조인. kicked 엔 없음(재입장은 자연 재kick).
  onChooseRole?: (role: 'actor' | 'viewer') => void // RM-JOIN-ROLE: 입장 전 배우/관전 선택
}

export default function RoomJoinGate({ phase, backdrop, joinError, kickReason, onCancel, onSubmitPassword, onRetry, onChooseRole }: Props) {
  const { t } = useTranslation()
  const [passwordInput, setPasswordInput] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwErr, setPwErr] = useState<string | null>(null)

  // RM-JOIN-ROLE: 배우/관전 선택 — 카메라로 아바타를 움직이는 앱이라 진입 시 의도 확정(Zoom join-with-video 패턴).
  if (phase === 'choose') {
    return (
      <main className="relative grid min-h-screen place-items-center overflow-hidden bg-stage-base text-stage-text">
        {backdrop && (
          <img src={backdrop} alt="" aria-hidden="true" draggable={false} className="scene-veil select-none" />
        )}
        <div className="scene-veil-in relative flex w-full max-w-sm flex-col items-center gap-4 px-6 text-center">
          <p className="text-base drop-shadow md:text-lg">{t('room.chooseRolePrompt')}</p>
          <div className="flex w-full flex-col gap-2">
            <button
              onClick={() => onChooseRole?.('actor')}
              className="w-full rounded-lg bg-fire-amber px-4 py-3 text-sm font-semibold text-stage-base hover:opacity-90"
            >
              {t('room.joinAsActor')}
            </button>
            <button
              onClick={() => onChooseRole?.('viewer')}
              className="w-full rounded-lg border border-stage-border bg-stage-base/60 px-4 py-3 text-sm text-stage-text-muted backdrop-blur hover:text-stage-text"
            >
              {t('room.joinAsViewer')}
            </button>
          </div>
          <button onClick={onCancel} className="text-xs text-stage-text-muted underline-offset-2 hover:underline">
            {t('room.backToLobby')}
          </button>
        </div>
      </main>
    )
  }

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
        <div className="mt-4 flex justify-center gap-2">
          {phase === 'error' && onRetry && (
            <button
              onClick={onRetry}
              className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base hover:opacity-90"
            >
              {t('common.retry')}
            </button>
          )}
          <button
            onClick={onCancel}
            className="rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
          >
            {t('room.backToLobby')}
          </button>
        </div>
      </div>
    </main>
  )
}
