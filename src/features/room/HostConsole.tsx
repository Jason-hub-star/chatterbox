import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoomParticipant } from '@/stores/roomStore'
import Modal from '@/components/shared/Modal'
import { toast } from '@/hooks/useToast'

// 연결품질 점(6인 실증 — 참가자별 열화 즉시 파악). UI 최소: 행당 이모지 1개.
const qualityDot = (q?: RoomParticipant['connectionQuality']): string =>
  q === 'excellent' ? '🟢' : q === 'good' ? '🟡' : q === 'poor' ? '🔴' : q === 'lost' ? '❌' : '⚪'

// HostConsole — RightPanel 의 host-only 탭. 방 운영: 비밀번호(HOST-06)·음소거(HOST-08)·강퇴(HOST-01).
// 호스트 판별은 RoomPage(rooms.host_id===내 users.id, 이양 반영)에서 게이트 — 이 탭은 호스트에게만 마운트된다.
// 서버(set-*/kick-*)가 rooms.host_id 로 진짜 권한을 재검증하므로 이 UI 게이트는 표시용.
export default function HostConsole({
  participants,
  myIdentity,
  onKick,
  onSetMute,
  onSetPassword,
  onCreateInvite,
  initialLocked,
  initialMuted,
}: {
  participants: RoomParticipant[]
  myIdentity: string
  onKick: (identity: string) => Promise<void>
  onSetMute: (identity: string, muted: boolean) => Promise<void>
  onSetPassword: (password: string) => Promise<boolean>
  onCreateInvite: () => Promise<string> // 원문 invite_code 반환 — URL 조립·복사는 여기서
  initialLocked: boolean
  initialMuted?: Set<string>
}) {
  const { t } = useTranslation()
  // 강퇴 확인: 2단 토글(계약 위반·오클릭 위험) → Modal 프리미티브(P-4, 포커스트랩·Esc·복귀).
  const [confirming, setConfirming] = useState<{ identity: string; name: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // 음소거 배지 = 서버 진실(initialMuted, muted_by_host)에 이 세션 낙관적 오버라이드(호스트 클릭)를 얹어
  // 렌더 시 파생(A-FUNC-3) — 새로고침 후 배지 desync 제거. prop→state 동기화 effect 불필요(항상 최신 prop 반영).
  const [mutedOverrides, setMutedOverrides] = useState<Map<string, boolean>>(new Map())
  const isMutedNow = (identity: string): boolean =>
    mutedOverrides.has(identity) ? mutedOverrides.get(identity)! : (initialMuted?.has(identity) ?? false)
  const [muting, setMuting] = useState<string | null>(null)

  // 방 비밀번호
  const [locked, setLocked] = useState(initialLocked)
  const [pwInput, setPwInput] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwErr, setPwErr] = useState<string | null>(null)

  // 초대링크 (LOB-05). URL 을 상태로 유지 — 클립보드 API 거부 환경에서도 readonly 입력으로 수동 복사 가능.
  const [invUrl, setInvUrl] = useState<string | null>(null)
  const [invBusy, setInvBusy] = useState(false)
  const [invErr, setInvErr] = useState<string | null>(null)

  const createInvite = async () => {
    setInvErr(null)
    setInvBusy(true)
    try {
      const code = await onCreateInvite()
      const url = `${location.origin}/lobby?invite=${code}`
      setInvUrl(url)
      try {
        await navigator.clipboard.writeText(url)
        toast.success(t('host.inviteCopied'))
      } catch {
        /* 클립보드 거부 — 아래 readonly 입력에서 수동 복사 */
      }
    } catch {
      setInvErr(t('host.inviteFailed'))
    } finally {
      setInvBusy(false)
    }
  }

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
      setMutedOverrides((prev) => new Map(prev).set(identity, next))
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
      {/* 초대링크 — 친구 부르기(LOB-05). 72시간·5회 기본, 원문 코드는 이 세션 응답에만 존재. */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-stage-text-muted">{t('host.inviteTitle')}</h3>
        <button
          onClick={() => void createInvite()}
          disabled={invBusy}
          className="rounded bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40"
        >
          {invBusy ? t('host.creatingInvite') : t('host.createInvite')}
        </button>
        {invUrl && (
          <input
            readOnly
            value={invUrl}
            aria-label={t('host.inviteUrlLabel')}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded border border-stage-border bg-transparent px-3 py-1.5 text-xs text-stage-text-muted"
          />
        )}
        {invErr && <p className="mt-1 text-xs text-fire-hot" role="alert">{invErr}</p>}
      </section>

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
              const isMuted = isMutedNow(p.identity)
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
                  <button
                    onClick={() => setConfirming({ identity: p.identity, name: p.name })}
                    className="rounded border border-fire-hot/50 px-2 py-1 text-xs text-fire-hot hover:bg-fire-hot/10"
                  >
                    {t('host.kick')}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {confirming && (
        <Modal title={t('host.kickConfirmTitle')} onClose={() => setConfirming(null)}>
          <p className="mt-2 text-sm text-stage-text-muted">{t('host.kickConfirmBody', { name: confirming.name })}</p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void doKick(confirming.identity)}
              disabled={busy === confirming.identity}
              className="flex-1 rounded-lg bg-fire-hot px-3 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {busy === confirming.identity ? t('host.kicking') : t('host.kickConfirm')}
            </button>
            <button onClick={() => setConfirming(null)} className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted">
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
