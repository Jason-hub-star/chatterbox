import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoomParticipant } from '@/stores/roomStore'
import { ROOM_GENRES, type RecentPerson, type RoomRecordingItem } from '@/lib/rooms'
import type { RecordingPhase } from './useRoomRecording'
import { REC_LABEL } from './recordingLabels'
import Modal from '@/components/shared/Modal'
import { toast } from '@/hooks/useToast'
import { STAGE_BACKGROUNDS } from '@/lib/stageBackgrounds'
import { usePollStore } from '@/stores/pollStore'

// 연결품질 점(6인 실증 — 참가자별 열화 즉시 파악). UI 최소: 행당 이모지 1개.
const qualityDot = (q?: RoomParticipant['connectionQuality']): string =>
  q === 'excellent' ? '🟢' : q === 'good' ? '🟡' : q === 'poor' ? '🔴' : q === 'lost' ? '❌' : '⚪'

// HostConsole — RightPanel 의 host-only 탭. 방 운영: 비밀번호(HOST-06)·음소거(HOST-08)·강퇴(HOST-01).
// 호스트 판별은 RoomPage(rooms.host_id===내 users.id, 이양 반영)에서 게이트 — 이 탭은 호스트에게만 마운트된다.
// 서버(set-*/kick-*)가 rooms.host_id 로 진짜 권한을 재검증하므로 이 UI 게이트는 표시용.
export default function HostConsole({
  participants,
  myIdentity,
  actorIds,
  onKick,
  onSetMute,
  mutedUntil,
  onTransferHost,
  onSetPassword,
  onSetBackground,
  loadRoomSettings,
  onUpdateRoomSettings,
  onCreateInvite,
  loadRecentPeople,
  onDirectInvite,
  raisedHands,
  onInviteToStage,
  loadChatPolicy,
  onSetChatPolicy,
  onClearChat,
  initialLocked,
  initialMuted,
  loadRecordings,
  onPlayRecording,
  recordingsNonce,
  onCreatePoll,
  onSetPollStatus,
  connected,
  recordPhase,
  onToggleRecord,
}: {
  participants: RoomParticipant[]
  myIdentity: string
  actorIds: Set<string> // 배우 authId 집합 — 이양 버튼은 배우에게만(뷰어 이양은 서버도 409)
  onKick: (identity: string, reason?: string) => Promise<void> // reason(선택, ≤200자) — 서버가 대상에게 통지
  onSetMute: (identity: string, muted: boolean, durationSec?: number) => Promise<void> // R4: durationSec=시간제(무기한은 미전달)
  mutedUntil?: Record<string, string> // R4 시간제 만료 시각(authId→ISO) — 잔여 표시용
  onTransferHost: (identity: string) => Promise<void> // R1 명시 이양 — 서버가 host·대상 배우 재검증
  onSetPassword: (password: string) => Promise<boolean>
  onSetBackground: (backgroundUrl: string) => Promise<void> // 무대 배경 교체/해제(HOST-04·05)
  loadRoomSettings: () => Promise<{ title: string; genre: string }> // R2 초기값(loadChatPolicy 패턴)
  onUpdateRoomSettings: (settings: { title: string; genre: string }) => Promise<void> // R2 — 서버 host 재검증·화이트리스트
  onCreateInvite: (role: 'actor' | 'viewer') => Promise<string> // 원문 invite_code 반환 — URL 조립·복사는 여기서
  loadRecentPeople: () => Promise<RecentPerson[]> // 최근 함께한 사람(LOB-08, 현재 방 참가자 제외)
  onDirectInvite: (userId: string) => Promise<void> // 지명 초대 = 1회권 + 상대 인앱 알림
  raisedHands: { authId: string; userId: string; name: string | null }[] // ROOM-20 손든 관객 큐(호스트 승인 대기)
  onInviteToStage: (targetUserId: string) => Promise<void> // ROOM-21 무대 초대(대상 수락 후 승격)
  loadChatPolicy: () => Promise<{ slowSec: number; bannedWords: string[] }> // HOST-09·10 초기값(rooms RLS)
  onSetChatPolicy: (policy: { slow_mode_sec: number; banned_words: string[] }) => Promise<void>
  onClearChat: () => Promise<void> // HOST-11 — 서버 'chat-mod' broadcast 가 전원 스토어 클리어
  initialLocked: boolean
  initialMuted?: Set<string>
  loadRecordings: () => Promise<RoomRecordingItem[]> // V-3 다시보기 목록(ready, RLS 멤버)
  onPlayRecording: (id: string) => Promise<string> // presigned GET(서버 visibility 게이트)
  recordingsNonce: number // 녹화 완료 시 ++ → 목록 갱신
  onCreatePoll: (question: string, options: string[]) => Promise<void> // ROOM-22 — 서버가 host 재검증·활성 1개 강제
  onSetPollStatus: (pollId: string, status: 'revealed' | 'closed') => Promise<void> // reveal 시에만 percent 공개
  connected: boolean
  recordPhase?: RecordingPhase // V-3 녹화 phase — 하단바에서 이관(idle 시작 진입은 콘솔, 하단바는 진행 상태만)
  onToggleRecord?: () => void
}) {
  const { t } = useTranslation()
  // 강퇴 확인: 2단 토글(계약 위반·오클릭 위험) → Modal 프리미티브(P-4, 포커스트랩·Esc·복귀).
  const [confirming, setConfirming] = useState<{ identity: string; name: string } | null>(null)
  const [kickReasonInput, setKickReasonInput] = useState('') // 강퇴 사유(선택) — 확정 시 서버로 전달
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // 음소거 배지 = 서버 진실(initialMuted, muted_by_host)에 이 세션 낙관적 오버라이드(호스트 클릭)를 얹어
  // 렌더 시 파생(A-FUNC-3) — 새로고침 후 배지 desync 제거. prop→state 동기화 effect 불필요(항상 최신 prop 반영).
  const [mutedOverrides, setMutedOverrides] = useState<Map<string, boolean>>(new Map())
  const isMutedNow = (identity: string): boolean =>
    mutedOverrides.has(identity) ? mutedOverrides.get(identity)! : (initialMuted?.has(identity) ?? false)
  const [muting, setMuting] = useState<string | null>(null)
  // R4 시간제 음소거 길이(초) — 0=무기한. 이후 음소거 클릭에 적용(참가자 관리 섹션 공용 셀렉트).
  const [muteDurationSec, setMuteDurationSec] = useState(0)

  // 방 비밀번호
  const [locked, setLocked] = useState(initialLocked)
  const [pwInput, setPwInput] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwErr, setPwErr] = useState<string | null>(null)

  // 채팅 관리(HOST-09·10·11) — 정책 강제는 send-chat 서버측, 여긴 설정 UI + 클리어.
  const [slowSec, setSlowSec] = useState(0)
  const [bannedInput, setBannedInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [chatErr, setChatErr] = useState<string | null>(null)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [clearBusy, setClearBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const p = await loadChatPolicy()
        if (!cancelled) {
          setSlowSec(p.slowSec)
          setBannedInput(p.bannedWords.join(', '))
        }
      } catch {
        /* 초기값 로드 실패 — 0/빈값으로 강등 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadChatPolicy])
  const saveChatPolicy = async () => {
    setChatErr(null)
    setChatBusy(true)
    try {
      const words = bannedInput.split(',').map((w) => w.trim()).filter(Boolean).slice(0, 50)
      await onSetChatPolicy({ slow_mode_sec: slowSec, banned_words: words })
      setBannedInput(words.join(', '))
      toast.success(t('host.chatPolicySaved'))
    } catch {
      setChatErr(t('host.chatPolicyFailed'))
    } finally {
      setChatBusy(false)
    }
  }
  const doClearChat = async () => {
    setClearBusy(true)
    try {
      await onClearChat()
      setClearConfirm(false)
    } catch {
      toast.error(t('host.clearChatFailed'))
    } finally {
      setClearBusy(false)
    }
  }

  // 녹화 다시보기(V-3) — ready 목록 + 인라인 재생(presign 15분).
  const [recs, setRecs] = useState<RoomRecordingItem[]>([])
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null)
  const [recBusy, setRecBusy] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    loadRecordings()
      .then((list) => { if (!cancelled) setRecs(list) })
      .catch(() => { /* 목록 실패 — 섹션 비표시로 강등 */ })
    return () => { cancelled = true }
  }, [loadRecordings, recordingsNonce])
  const playRec = async (id: string) => {
    setRecBusy(id)
    try {
      setPlaying({ id, url: await onPlayRecording(id) })
    } catch {
      toast.error(t('host.recordingsPlayFailed'))
    } finally {
      setRecBusy(null)
    }
  }
  const fmtDuration = (ms: number | null): string => {
    const s = Math.round((ms ?? 0) / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  // 관객 투표(ROOM-22) — 활성 폴 상태는 pollStore(릴레이+fetch 미러), 생성/전이는 서버 재검증.
  const activePoll = usePollStore((s) => s.poll)
  const [pollQ, setPollQ] = useState('')
  const [pollOpts, setPollOpts] = useState(['', '', '', ''])
  const [pollBusy, setPollBusy] = useState(false)
  const [pollErr, setPollErr] = useState<string | null>(null)
  const filledOpts = pollOpts.map((o) => o.trim()).filter(Boolean)
  const doCreatePoll = async () => {
    setPollErr(null)
    setPollBusy(true)
    try {
      await onCreatePoll(pollQ.trim(), filledOpts)
      setPollQ('')
      setPollOpts(['', '', '', ''])
    } catch {
      setPollErr(t('host.pollCreateFailed'))
    } finally {
      setPollBusy(false)
    }
  }
  const doPollStatus = async (status: 'revealed' | 'closed') => {
    if (!activePoll) return
    setPollErr(null)
    setPollBusy(true)
    try {
      await onSetPollStatus(activePoll.id, status)
    } catch {
      setPollErr(t('host.pollActionFailed'))
    } finally {
      setPollBusy(false)
    }
  }

  // 방 설정 편집(R2) — 초기값은 로더(현재 상단바 상태), 저장은 서버 재검증 후 broadcast 로 전원 반영.
  const [settingsTitle, setSettingsTitle] = useState('')
  const [settingsGenre, setSettingsGenre] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsErr, setSettingsErr] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    loadRoomSettings()
      .then((s) => {
        if (!cancelled) {
          setSettingsTitle(s.title)
          setSettingsGenre(s.genre)
        }
      })
      .catch(() => { /* 초기값 실패 — 빈 폼으로 강등(저장 시 서버가 재검증) */ })
    return () => { cancelled = true }
  }, [loadRoomSettings])
  const saveSettings = async () => {
    setSettingsErr(null)
    setSettingsBusy(true)
    try {
      await onUpdateRoomSettings({ title: settingsTitle.trim(), genre: settingsGenre })
      toast.success(t('host.settingsSaved'))
    } catch {
      setSettingsErr(t('host.settingsFailed'))
    } finally {
      setSettingsBusy(false)
    }
  }

  // 무대 배경(HOST-04·05)
  const [bgBusy, setBgBusy] = useState(false)
  const [bgErr, setBgErr] = useState<string | null>(null)
  const applyBackground = async (url: string) => {
    setBgErr(null)
    setBgBusy(true)
    try {
      await onSetBackground(url)
    } catch {
      setBgErr(t('host.backgroundFailed'))
    } finally {
      setBgBusy(false)
    }
  }

  // 초대링크 (LOB-05). URL 을 상태로 유지 — 클립보드 API 거부 환경에서도 readonly 입력으로 수동 복사 가능.
  const [invUrl, setInvUrl] = useState<string | null>(null)
  const [invBusy, setInvBusy] = useState(false)
  const [invErr, setInvErr] = useState<string | null>(null)

  // 최근 함께한 사람(LOB-08) — 지명 초대 후보. 보낸 사람은 목록에서 제거(중복 발송 방지).
  const [people, setPeople] = useState<RecentPerson[]>([])
  const [sending, setSending] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await loadRecentPeople()
        if (!cancelled) setPeople(list)
      } catch {
        /* 목록 없음으로 강등 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadRecentPeople])

  const sendDirectInvite = async (userId: string) => {
    setSending(userId)
    try {
      await onDirectInvite(userId)
      toast.success(t('host.inviteSent'))
      setPeople((prev) => prev.filter((p) => p.user_id !== userId))
    } catch {
      toast.error(t('host.inviteFailed'))
    } finally {
      setSending(null)
    }
  }

  const createInvite = async (role: 'actor' | 'viewer') => {
    setInvErr(null)
    setInvBusy(true)
    try {
      const code = await onCreateInvite(role)
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
      await onKick(identity, kickReasonInput.trim() || undefined)
    } catch {
      setErr(t('host.kickFailed'))
    } finally {
      setBusy(null)
      setConfirming(null)
    }
  }

  // 호스트 이양(R1) — 강퇴와 동형 확인 모달. 성공하면 이 탭 자체가 사라지므로(isHost 재파생) 모달 정리만.
  const [transferTarget, setTransferTarget] = useState<{ identity: string; name: string } | null>(null)
  const [transferBusy, setTransferBusy] = useState(false)
  const doTransfer = async (identity: string) => {
    setErr(null)
    setTransferBusy(true)
    try {
      await onTransferHost(identity)
      toast.success(t('host.transferDone'))
    } catch {
      setErr(t('host.transferFailed'))
    } finally {
      setTransferBusy(false)
      setTransferTarget(null)
    }
  }

  const doMute = async (identity: string, next: boolean) => {
    setErr(null)
    setMuting(identity)
    try {
      await onSetMute(identity, next, next && muteDurationSec > 0 ? muteDurationSec : undefined)
      setMutedOverrides((prev) => new Map(prev).set(identity, next))
    } catch {
      setErr(t('host.muteFailed'))
    } finally {
      setMuting(null)
    }
  }
  // R4 잔여 표시: 시간제 음소거된 참가자의 만료 시각(HH:MM) — 서버 진실(mutedUntil) 파생.
  const mutedUntilLabel = (identity: string): string | null => {
    const iso = mutedUntil?.[identity]
    if (!iso || !isMutedNow(identity)) return null
    const d = new Date(iso)
    return t('host.mutedUntil', { time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` })
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
      {/* 손들기 큐(ROOM-20·G-154) — 손든 관객 목록. 초대(viewer→actor 승격)는 슬라이스 2. */}
      {raisedHands.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-stage-text-muted">
            {t('host.raiseHandQueue')} ({raisedHands.length})
          </h3>
          <ul className="space-y-1.5">
            {raisedHands.map((h) => (
              <li key={h.authId} className="flex items-center gap-2 rounded-lg border border-stage-border px-3 py-2 text-sm">
                <span aria-hidden>✋</span>
                <span className="flex-1 truncate">{h.name ?? '?'}</span>
                <button
                  onClick={() => void onInviteToStage(h.userId)}
                  className="flex min-h-[44px] shrink-0 items-center rounded border border-fire-amber px-3 py-1 text-xs text-fire-amber hover:bg-fire-amber/10"
                >
                  {t('host.inviteToStage')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 방 설정(R2) — 제목/장르 편집. 서버(update-room-settings)가 host 재검증·화이트리스트 후 전원 broadcast. */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-stage-text-muted">{t('host.settingsTitle')}</h3>
        <input
          value={settingsTitle}
          onChange={(e) => setSettingsTitle(e.target.value)}
          maxLength={80}
          aria-label={t('host.settingsTitleLabel')}
          placeholder={t('host.settingsTitleLabel')}
          className="w-full rounded border border-stage-border bg-transparent px-3 py-1.5 text-sm"
        />
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor="room-genre" className="text-xs text-stage-text-muted">{t('lobby.genreLabel')}</label>
          <select
            id="room-genre"
            value={settingsGenre}
            onChange={(e) => setSettingsGenre(e.target.value)}
            className="rounded border border-stage-border bg-transparent px-2 py-1 text-xs"
          >
            <option value="">{t('lobby.genreNone')}</option>
            {ROOM_GENRES.map((g) => (
              <option key={g} value={g}>{t(`lobby.genre.${g}`)}</option>
            ))}
          </select>
          <button
            onClick={() => void saveSettings()}
            disabled={settingsBusy || settingsTitle.trim().length === 0}
            className="ml-auto rounded bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40"
          >
            {t('host.settingsSave')}
          </button>
        </div>
        {settingsErr && <p className="mt-1 text-xs text-fire-hot" role="alert">{settingsErr}</p>}
      </section>

      {/* 무대 배경(HOST-04·05) — 기존 씬 에셋 재사용. 썸네일 그리드·전환 fade 폴리시는 트랙 B. */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-stage-text-muted">{t('host.background')}</h3>
        <div className="flex flex-wrap gap-2">
          {STAGE_BACKGROUNDS.map((bg) => (
            <button
              key={bg.id}
              onClick={() => void applyBackground(bg.url)}
              disabled={bgBusy}
              className="rounded border border-stage-border px-2 py-1 text-xs text-stage-text-muted hover:text-stage-text disabled:opacity-40"
            >
              {t(bg.labelKey)}
            </button>
          ))}
        </div>
        {bgErr && <p className="mt-1 text-xs text-fire-hot" role="alert">{bgErr}</p>}
      </section>

      {/* 초대링크 — 친구 부르기(LOB-05). 72시간·5회 기본, 원문 코드는 이 세션 응답에만 존재. */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-stage-text-muted">{t('host.inviteTitle')}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => void createInvite('actor')}
            disabled={invBusy}
            className="rounded bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40"
          >
            {invBusy ? t('host.creatingInvite') : t('host.createInvite')}
          </button>
          {/* 관전 초대(Phase 4): 좌석 비점유·발행권 없음 — 잠금방도 이 링크로만 관전 가능. */}
          <button
            onClick={() => void createInvite('viewer')}
            disabled={invBusy}
            className="rounded border border-stage-border px-3 py-1.5 text-xs text-stage-text-muted hover:text-stage-text disabled:opacity-40"
          >
            {t('host.createViewerInvite')}
          </button>
        </div>
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
        {people.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-stage-text-muted">{t('host.recentPeople')}</p>
            <ul className="space-y-1.5">
              {people.map((p) => (
                <li key={p.user_id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{p.display_name ?? '?'}</span>
                  <button
                    onClick={() => void sendDirectInvite(p.user_id)}
                    disabled={sending === p.user_id}
                    className="shrink-0 rounded border border-stage-border px-2 py-1 text-xs text-stage-text-muted hover:text-stage-text disabled:opacity-40"
                  >
                    {sending === p.user_id ? t('host.sendingInvite') : t('host.sendInvite')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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

      {/* 채팅 관리(HOST-09 슬로우모드·HOST-10 금칙어·HOST-11 클리어) — 서버(set-chat-policy/moderate-chat)가 host 재검증. */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-stage-text-muted">{t('host.chatTitle')}</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="chat-slow-mode" className="text-xs text-stage-text-muted">{t('host.slowMode')}</label>
          <select
            id="chat-slow-mode"
            value={slowSec}
            onChange={(e) => setSlowSec(Number(e.target.value))}
            className="rounded border border-stage-border bg-transparent px-2 py-1 text-xs"
          >
            <option value={0}>{t('host.slowModeOff')}</option>
            {[5, 10, 30].map((s) => (
              <option key={s} value={s}>{s}s</option>
            ))}
          </select>
        </div>
        <input
          value={bannedInput}
          onChange={(e) => setBannedInput(e.target.value)}
          aria-label={t('host.bannedWords')}
          placeholder={t('host.bannedWordsPlaceholder')}
          className="mt-2 w-full rounded border border-stage-border bg-transparent px-3 py-1.5 text-sm"
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => void saveChatPolicy()}
            disabled={chatBusy}
            className="rounded bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40"
          >
            {t('host.chatPolicySave')}
          </button>
          <button
            onClick={() => setClearConfirm(true)}
            className="rounded border border-fire-hot/50 px-3 py-1.5 text-xs text-fire-hot hover:bg-fire-hot/10"
          >
            {t('host.clearChat')}
          </button>
        </div>
        {chatErr && <p className="mt-1 text-xs text-fire-hot" role="alert">{chatErr}</p>}
      </section>

      {/* 관객 투표(ROOM-22) — 활성 폴 없으면 생성 폼, 있으면 진행 상태 + 공개/종료. 투표 자체는 무대 PollBar. */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-stage-text-muted">{t('host.pollTitle')}</h3>
        {activePoll ? (
          <div className="rounded-lg border border-stage-border px-3 py-2">
            <p className="text-sm">{activePoll.question}</p>
            <p className="mt-1 text-xs text-stage-text-muted">
              {t('poll.totalVotes', { count: activePoll.totalVotes })}
              {activePoll.status === 'revealed' && ` · ${t('host.pollRevealed')}`}
            </p>
            <div className="mt-2 flex gap-2">
              {activePoll.status === 'open' && (
                <button
                  onClick={() => void doPollStatus('revealed')}
                  disabled={pollBusy}
                  className="rounded bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40"
                >
                  {t('host.pollReveal')}
                </button>
              )}
              <button
                onClick={() => void doPollStatus('closed')}
                disabled={pollBusy}
                className="rounded border border-stage-border px-3 py-1.5 text-xs text-stage-text-muted hover:text-stage-text disabled:opacity-40"
              >
                {t('host.pollClose')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              value={pollQ}
              onChange={(e) => setPollQ(e.target.value)}
              maxLength={200}
              aria-label={t('host.pollQuestionLabel')}
              placeholder={t('host.pollQuestionPlaceholder')}
              className="w-full rounded border border-stage-border bg-transparent px-3 py-1.5 text-sm"
            />
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {pollOpts.map((opt, i) => (
                <input
                  key={i}
                  value={opt}
                  onChange={(e) => setPollOpts((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
                  maxLength={24}
                  aria-label={t('host.pollOptionLabel', { n: i + 1 })}
                  placeholder={t('host.pollOptionLabel', { n: i + 1 })}
                  className="min-w-0 rounded border border-stage-border bg-transparent px-2 py-1 text-xs"
                />
              ))}
            </div>
            <button
              onClick={() => void doCreatePoll()}
              disabled={pollBusy || pollQ.trim().length === 0 || filledOpts.length < 2}
              className="mt-2 rounded bg-fire-amber px-3 py-1.5 text-xs font-semibold text-stage-base disabled:opacity-40"
            >
              {t('host.pollCreate')}
            </button>
          </>
        )}
        {pollErr && <p className="mt-1 text-xs text-fire-hot" role="alert">{pollErr}</p>}
      </section>

      {/* 무대 녹화 시작/중지(V-3) — 하단바에서 이관. idle 진입은 콘솔, 하단바는 진행 상태만. */}
      {onToggleRecord && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-stage-text-muted">{t('host.recordTitle')}</h3>
          <button
            data-record-button={recordPhase}
            onClick={onToggleRecord}
            disabled={!connected || recordPhase === 'uploading'}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${REC_LABEL[recordPhase ?? 'idle'].cls}`}
            title={t(REC_LABEL[recordPhase ?? 'idle'].key)}
          >
            <span className={recordPhase === 'recording' ? 'animate-pulse' : undefined}>{REC_LABEL[recordPhase ?? 'idle'].icon}</span>
            <span>{t(REC_LABEL[recordPhase ?? 'idle'].key)}</span>
          </button>
        </section>
      )}

      {/* 녹화 다시보기(V-3) — ready 녹화 목록 + 인라인 재생. 목록이 비면 섹션 자체를 숨긴다. */}
      {recs.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-stage-text-muted">{t('host.recordingsTitle')}</h3>
          <ul className="space-y-1.5">
            {recs.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border border-stage-border px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-xs text-stage-text-muted">
                  {new Date(r.created_at).toLocaleString()} · {fmtDuration(r.duration_ms)}
                </span>
                <button
                  onClick={() => void playRec(r.id)}
                  disabled={recBusy === r.id}
                  className="shrink-0 rounded border border-stage-border px-2 py-1 text-xs text-stage-text-muted hover:text-stage-text disabled:opacity-40"
                >
                  {t('host.recordingsPlay')}
                </button>
              </li>
            ))}
          </ul>
          {playing && (
            <video key={playing.id} src={playing.url} controls autoPlay className="mt-2 w-full rounded-lg border border-stage-border">
              <track kind="captions" />
            </video>
          )}
        </section>
      )}

      {/* 참가자 관리 */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-stage-text-muted">{t('host.consoleTitle')}</h3>
        {/* R4 시간제 음소거 길이 — 이후 [음소거] 클릭에 적용(해제·기존 음소거엔 무영향). */}
        <div className="mb-2 flex items-center gap-2">
          <label htmlFor="mute-duration" className="text-xs text-stage-text-muted">{t('host.muteDuration')}</label>
          <select
            id="mute-duration"
            value={muteDurationSec}
            onChange={(e) => setMuteDurationSec(Number(e.target.value))}
            className="rounded border border-stage-border bg-transparent px-2 py-1 text-xs"
          >
            <option value={0}>{t('host.muteDurationForever')}</option>
            {[60, 300, 600, 1800].map((s) => (
              <option key={s} value={s}>{t('host.muteDurationMin', { m: s / 60 })}</option>
            ))}
          </select>
        </div>
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
                  <span className="min-w-0 flex-1 truncate">
                    {p.name}
                    {mutedUntilLabel(p.identity) && (
                      <span className="ml-1 text-[10px] text-stage-text-muted">{mutedUntilLabel(p.identity)}</span>
                    )}
                  </span>
                  <button
                    onClick={() => void doMute(p.identity, !isMuted)}
                    disabled={muting === p.identity}
                    className="rounded border border-stage-border px-2 py-1 text-xs text-stage-text-muted hover:text-stage-text disabled:opacity-40"
                  >
                    {muting === p.identity ? t('host.muting') : isMuted ? t('host.unmute') : t('host.mute')}
                  </button>
                  {actorIds.has(p.identity) && (
                    <button
                      onClick={() => setTransferTarget({ identity: p.identity, name: p.name })}
                      className="rounded border border-fire-amber/50 px-2 py-1 text-xs text-fire-amber hover:bg-fire-amber/10"
                    >
                      {t('host.transfer')}
                    </button>
                  )}
                  <button
                    onClick={() => { setKickReasonInput(''); setConfirming({ identity: p.identity, name: p.name }) }}
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
          <input
            value={kickReasonInput}
            onChange={(e) => setKickReasonInput(e.target.value)}
            maxLength={200}
            aria-label={t('host.kickReasonLabel')}
            placeholder={t('host.kickReasonPlaceholder')}
            className="mt-3 w-full rounded-lg border border-stage-border bg-transparent px-3 py-2 text-sm"
          />
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

      {transferTarget && (
        <Modal title={t('host.transferConfirmTitle')} onClose={() => setTransferTarget(null)}>
          <p className="mt-2 text-sm text-stage-text-muted">{t('host.transferConfirmBody', { name: transferTarget.name })}</p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void doTransfer(transferTarget.identity)}
              disabled={transferBusy}
              className="flex-1 rounded-lg bg-fire-amber px-3 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {transferBusy ? t('host.transferring') : t('host.transferConfirm')}
            </button>
            <button onClick={() => setTransferTarget(null)} className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted">
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}

      {clearConfirm && (
        <Modal title={t('host.clearChatConfirmTitle')} onClose={() => setClearConfirm(false)}>
          <p className="mt-2 text-sm text-stage-text-muted">{t('host.clearChatConfirmBody')}</p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void doClearChat()}
              disabled={clearBusy}
              className="flex-1 rounded-lg bg-fire-hot px-3 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {t('host.clearChat')}
            </button>
            <button onClick={() => setClearConfirm(false)} className="rounded-lg border border-stage-border px-3 py-2 text-sm text-stage-text-muted">
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
