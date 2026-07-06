import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoomParticipant } from '@/stores/roomStore'

// 연결품질 점(6인 실증 — 참가자별 열화 즉시 파악). UI 최소: 행당 이모지 1개.
const qualityDot = (q?: RoomParticipant['connectionQuality']): string =>
  q === 'excellent' ? '🟢' : q === 'good' ? '🟡' : q === 'poor' ? '🔴' : q === 'lost' ? '❌' : '⚪'

// HostConsole — RightPanel 의 host-only 탭. 방 운영: 비밀번호(HOST-06)·음소거(HOST-08)·강퇴(HOST-01).
// 호스트 판별은 RoomPage(mySlotIndex===0)에서 게이트 — 이 탭은 호스트에게만 마운트된다.
// 서버(set-*/kick-*)가 rooms.host_id 로 진짜 권한을 재검증하므로 이 UI 게이트는 표시용.
export default function HostConsole({
  participants,
  myIdentity,
  onKick,
  onSetMute,
  onSetPassword,
  initialLocked,
}: {
  participants: RoomParticipant[]
  myIdentity: string
  onKick: (identity: string) => Promise<void>
  onSetMute: (identity: string, muted: boolean) => Promise<void>
  onSetPassword: (password: string) => Promise<boolean>
  initialLocked: boolean
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // 음소거 상태는 낙관적 로컬 집합(호스트가 유일한 음소거 주체). ponytail: 호스트 새로고침 시
  // 배지 표시는 초기화되지만 실제 음소거는 DB(muted_by_host)+LiveKit 로 유지되고 재음소거는 멱등.
  const [muted, setMuted] = useState<Set<string>>(new Set())
  const [muting, setMuting] = useState<string | null>(null)

  // 방 비밀번호
  const [locked, setLocked] = useState(initialLocked)
  const [pwInput, setPwInput] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwErr, setPwErr] = useState<string | null>(null)

  const others = participants.filter((p) => p.identity !== myIdentity)

  const doKick = async (identity: string) => {
    setErr(null)
    setBusy(identity)
    try {
      await onKick(identity)
    } catch {
      setErr(t('host.kickFailed'))
    } finally {
      setBusy(null)
      setConfirming(null)
    }
  }

  const doMute = async (identity: string, next: boolean) => {
    setErr(null)
    setMuting(identity)
    try {
      await onSetMute(identity, next)
      setMuted((prev) => {
        const s = new Set(prev)
        if (next) s.add(identity)
        else s.delete(identity)
        return s
      })
    } catch {
      setErr(t('host.muteFailed'))
    } finally {
      setMuting(null)
    }
  }

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwErr(null)
    setPwBusy(true)
    try {
      const isLocked = await onSetPassword(pwInput)
      setLocked(isLocked)
      setPwInput('')
    } catch {
      setPwErr(t('host.passwordFailed'))
    } finally {
      setPwBusy(false)
    }
  }

  const removePassword = async () => {
    setPwErr(null)
    setPwBusy(true)
    try {
      setLocked(await onSetPassword(''))
    } catch {
      setPwErr(t('host.passwordFailed'))
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 방 비밀번호 */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-stage-text-muted">{t('host.roomPassword')}</h3>
        <p className="mb-2 text-xs text-stage-text-muted">
          {locked ? t('host.passwordSet') : t('host.passwordNone')}
        </p>
        <form onSubmit={submitPassword} className="flex gap-2">
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            placeholder={t('host.passwordPlaceholder')}
            aria-label={t('host.roomPassword')}
            maxLength={64}
            className="min-w-0 flex-1 rounded border border-stage-border bg-transparent px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={pwBusy || pwInput.trim().length < 4}
            className="shrink-0 rounded bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40"
          >
            {t('host.setPassword')}
          </button>
          {locked && (
            <button
              type="button"
              onClick={() => void removePassword()}
              disabled={pwBusy}
              className="shrink-0 rounded border border-stage-border px-3 py-1.5 text-xs text-stage-text-muted disabled:opacity-40"
            >
              {t('host.removePassword')}
            </button>
          )}
        </form>
        {pwErr && <p className="mt-1 text-xs text-fire-hot" role="alert">{pwErr}</p>}
      </section>

      {/* 참가자 관리 */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-stage-text-muted">{t('host.consoleTitle')}</h3>
        {err && <p className="mb-2 rounded bg-fire-hot/10 px-3 py-2 text-xs text-fire-hot" role="alert">{err}</p>}
        {others.length === 0 ? (
          <p className="text-sm text-stage-text-muted">{t('host.noOthers')}</p>
        ) : (
          <ul className="space-y-2">
            {others.map((p) => {
              const isMuted = muted.has(p.identity)
              return (
                <li
                  key={p.identity}
                  className="flex items-center gap-2 rounded-lg border border-stage-border px-3 py-2 text-sm"
                >
                  <span title={p.connectionQuality ?? 'unknown'} aria-label={`connection ${p.connectionQuality ?? 'unknown'}`}>
                    {qualityDot(p.connectionQuality)}
                  </span>
                  <span className="flex-1 truncate">{p.name}</span>
                  <button
                    onClick={() => void doMute(p.identity, !isMuted)}
                    disabled={muting === p.identity}
                    className="rounded border border-stage-border px-2 py-1 text-xs text-stage-text-muted hover:text-stage-text disabled:opacity-40"
                  >
                    {muting === p.identity ? t('host.muting') : isMuted ? t('host.unmute') : t('host.mute')}
                  </button>
                  {confirming === p.identity ? (
                    <>
                      <button
                        onClick={() => void doKick(p.identity)}
                        disabled={busy === p.identity}
                        className="rounded bg-fire-hot px-2 py-1 text-xs font-semibold text-stage-base disabled:opacity-40"
                      >
                        {busy === p.identity ? t('host.kicking') : t('host.kickConfirm')}
                      </button>
                      <button onClick={() => setConfirming(null)} className="text-xs text-stage-text-muted">
                        {t('common.cancel')}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirming(p.identity)}
                      className="rounded border border-fire-hot/50 px-2 py-1 text-xs text-fire-hot hover:bg-fire-hot/10"
                    >
                      {t('host.kick')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
