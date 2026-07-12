import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import CampfireGlyph from '@/components/shared/CampfireGlyph'

// 입장 게이트 4화면(R-커밋: RoomPage 에서 순수 이동) — joining 로딩 / error / password 입력 / kicked.
// 비밀번호 입력의 로컬 상태(입력·busy·오류)는 이 컴포넌트 소유, 서버 검증은 onSubmitPassword(실패 시 throw).
interface Props {
  phase: 'joining' | 'error' | 'password' | 'kicked'
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

  if (phase === 'joining') {
    return (
      <main className="relative grid min-h-screen place-items-center overflow-hidden bg-stage-base text-stage-text-muted">
        {backdrop && (
          <img src={backdrop} alt="" aria-hidden="true" draggable={false} className="scene-veil select-none" />
        )}
        <div className="scene-veil-in relative flex flex-col items-center gap-4">
          {/* 모닥불 글리프 — scale 은 레이아웃 박스를 안 키우므로 래퍼(h-28)로 겹침 방지 */}
          <div className="grid h-28 w-28 place-items-center">
            <div className="scale-[1.8]">
              <CampfireGlyph />
            </div>
          </div>
          <p role="status" aria-live="polite" className="text-base drop-shadow md:text-lg">{t('room.joining')}</p>
          <button
            onClick={onCancel}
            className="rounded-lg border border-stage-border bg-stage-base/60 px-4 py-2 text-sm text-stage-text-muted backdrop-blur hover:text-stage-text"
          >
            {t('room.joinCancel')}
          </button>
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
