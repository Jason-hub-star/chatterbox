import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLiveKitRoom } from '@/hooks/useLiveKitRoom'
import { useRoomStore, type ConnectionState } from '@/stores/roomStore'
import { useReactionStore } from '@/stores/reactionStore'
import { useUserStore } from '@/stores/userStore'
import { joinRoom, joinRoomWithPassword, leaveRoom, kickParticipant, setParticipantMute, setRoomPassword } from '@/lib/rooms'
import { getVgenUrl } from '@/lib/vgen'
import { useStageStore } from '@/stores/stageStore'
import { fetchRoomMembers } from '@/lib/dub'
import { resolveAvatarUrl } from '@/lib/avatars'
import { isNewerSeq, type BlendshapeFrame } from '@/lib/blendshapeCodec'
import Stage from '@/features/stage/Stage'
import ReactionWheel from '@/features/reaction/ReactionWheel'
import ReactionOverlay from '@/features/reaction/ReactionOverlay'
import type { RemoteFrameSink } from '@/features/avatar/RemoteAvatar'
import DubPanel from '@/features/dub/DubPanel'
import VgenStatusTab from '@/features/vgen/VgenStatusTab'
import ScriptPanel from '@/features/script/ScriptPanel'
import ChatPanel from '@/features/chat/ChatPanel'
import RightPanel, { type RightPanelTab } from '@/features/room/RightPanel'
import HostConsole from '@/features/room/HostConsole'
import { SEED_SCRIPTS } from '@/features/script/cues'

// Phase 1B PoC → 우측 패널 셸 도입: 채팅·DUB·VGen 을 RightPanel 탭 블록으로 통합(contracts/RightPanel.md).
// 좌측 컬럼 = 참가자·무대·대본 텔레프롬프터·마이크/나가기. 우측 = RightPanel(탭 콘텐츠 주입식).
// 경로 B: 아바타는 네이티브 아리아 실 rig. 참가자별 avatar URL(users.avatar_url) — 미설정은 기본 아바타(resolveAvatarUrl).

const STATE_COLOR: Record<ConnectionState, string> = {
  DISCONNECTED: 'bg-stage-border',
  CONNECTING: 'bg-fire-amber',
  CONNECTED: 'bg-green-500',
  RECONNECTING: 'bg-fire-amber',
  FAILED: 'bg-fire-hot',
}

export default function RoomPage() {
  const { t } = useTranslation()

  const STATE_LABEL: Record<ConnectionState, string> = {
    DISCONNECTED: t('room.disconnected'),
    CONNECTING: t('room.connecting'),
    CONNECTED: t('room.connected'),
    RECONNECTING: t('room.reconnecting'),
    FAILED: t('room.failed'),
  }

  const { roomId = '' } = useParams()
  const navigate = useNavigate()
  const session = useUserStore((s) => s.session)
  const myAvatarUrl = useUserStore((s) => s.avatarUrl)
  const myIdentity = session?.user?.id ?? '' // LiveKit identity = auth uid

  // 입장 단계: LiveKit 연결 전에 반드시 room_participants 행을 만든다(멱등).
  // livekit-token 게이트가 활성 참가자 행을 요구하므로, join 성공 후에만 연결(enabled).
  const [joinPhase, setJoinPhase] = useState<'joining' | 'ready' | 'error' | 'password'>('joining')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [kicked, setKicked] = useState(false)
  // 잠금방: join-public-room 이 "Room is locked" 로 거부하면 비번 입력 단계로. 입장 성공 시 roomLocked=true.
  const [roomLocked, setRoomLocked] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [pwPhaseBusy, setPwPhaseBusy] = useState(false)
  const [pwPhaseErr, setPwPhaseErr] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !roomId) return
    let cancelled = false
    ;(async () => {
      setJoinPhase('joining')
      try {
        const r = await joinRoom(session.access_token, roomId)
        if (cancelled) return
        useRoomStore.getState().setRoomContext({
          currentRoomId: roomId,
          myParticipantId: r.participant_id,
          mySlotIndex: r.slot_index,
        })
        setJoinPhase('ready')
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : ''
        if (msg === 'Room is locked') { setJoinPhase('password'); return } // 비번 입력 단계로
        setJoinError(msg || t('room.joinError'))
        setJoinPhase('error')
      }
    })()
    return () => {
      cancelled = true
      useStageStore.getState().clearMainVideo() // 방 이탈/전환 시 공유 영상 초기화
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t 는 안정적, 언어 변경 시 재조인 방지 위해 제외
  }, [session, roomId])

  // 원격 아바타 프레임 싱크(participant identity → 구동 함수)와 마지막 seq. 고빈도 구동은 ref로만(리렌더 없음).
  // 싱크는 RemoteAvatar가 자기 RigAvatar+드라이버로 등록 — RoomPage는 아바타 타입을 모른다(디커플).
  const remoteAvatars = useRef<Map<string, RemoteFrameSink>>(new Map())
  const lastSeq = useRef<Map<string, number>>(new Map())
  const handleBlendshapes = useCallback((identity: string, frame: BlendshapeFrame) => {
    if (!isNewerSeq(lastSeq.current.get(identity) ?? 0, frame.seq)) return // 역전·중복 드롭
    lastSeq.current.set(identity, frame.seq)
    // RT-02 프레임엔 head pose 없음 → 싱크가 headPose=null로 구동(gaze는 blendshape이라 반영).
    remoteAvatars.current.get(identity)?.(frame)
  }, [])

  // 대본 텔레프롬프터: 호스트가 진행한 cue_index 를 수신 → 전원이 같은 위치를 본다.
  const [cueIndex, setCueIndex] = useState(0)
  const [myRole, setMyRole] = useState<string | null>(null)
  // 수신 방어: 다른 씬 메시지 무시 + cueIndex 범위 클램프(변조·스테일·멀티씬 대비).
  const handleCue = useCallback((p: { sceneId: string; cueIndex: number }) => {
    const sc = SEED_SCRIPTS[0]
    if (p.sceneId !== sc.id) return
    setCueIndex(Math.max(0, Math.min(sc.cues.length - 1, p.cueIndex)))
  }, [])

  // VGEN 공유재생(VGEN-04): 호스트가 방송한 jobId 로 각자 서명 URL 을 발급받아 센터 MainView 에 재생.
  const playSharedVgen = useCallback(async (jobId: string) => {
    if (!session) return
    try {
      const url = await getVgenUrl(session.access_token, jobId)
      useStageStore.getState().setMainVideo(url, jobId)
    } catch { /* 접근 불가·미완성 → 무시(서버 get-vgen-url 이 멤버십·visibility 게이트) */ }
  }, [session])
  const handleRoomAuthority = useCallback((msg: { type: string; jobId?: string }) => {
    if (msg.type === 'vgen_result' && typeof msg.jobId === 'string') void playSharedVgen(msg.jobId)
    else if (msg.type === 'vgen_stop') useStageStore.getState().clearMainVideo()
  }, [playSharedVgen])

  const { toggleMic, sendChat, sendBlendshapes, sendCue, sendRoomAuthority, sendReaction, leave } = useLiveKitRoom(roomId, {
    onBlendshapes: handleBlendshapes,
    onCue: handleCue,
    onRoomAuthority: handleRoomAuthority,
    enabled: joinPhase === 'ready',
    onKicked: () => setKicked(true),
  })

  const connectionState = useRoomStore((s) => s.connectionState)
  const participants = useRoomStore((s) => s.participants)
  const micEnabled = useRoomStore((s) => s.micEnabled)
  const mutedByHost = useRoomStore((s) => s.mutedByHost)
  const error = useRoomStore((s) => s.error)

  const connected = connectionState === 'CONNECTED'

  // 떠난 참가자의 seq 추적을 정리한다. (안 지우면 같은 identity로 재입장 시 옛 seq가 남아
  // 새 프레임을 전부 stale로 드롭 → 아바타 프리즈.)
  useEffect(() => {
    const present = new Set(participants.map((p) => p.identity))
    for (const id of lastSeq.current.keys()) {
      if (!present.has(id)) lastSeq.current.delete(id)
    }
  }, [participants])

  // 참가자별 아바타: LiveKit identity(=auth uid)로 각 멤버의 avatar_url 을 찾는다.
  // memberKey(정렬된 identity 문자열)로만 재조회 — participants 참조는 발화/메타 이벤트마다 바뀌므로
  // 멤버 집합이 실제로 바뀔 때(입장/퇴장)에만 list-room-members 를 호출한다(불필요 재조회 방지).
  // ponytail: 세션 중 아바타 변경 실시간 전파는 후속(현재는 멤버 변동 시 반영).
  const memberKey = participants.map((p) => p.identity).sort().join(',')
  const [memberAvatars, setMemberAvatars] = useState<Record<string, string | null>>({})
  const [memberSlots, setMemberSlots] = useState<Record<string, number>>({})
  useEffect(() => {
    if (joinPhase !== 'ready' || !session) return
    let cancelled = false
    ;(async () => {
      try {
        const members = await fetchRoomMembers(session.access_token, roomId)
        if (cancelled) return
        const avatars: Record<string, string | null> = {}
        const slots: Record<string, number> = {}
        for (const m of members) {
          avatars[m.authId] = m.avatarUrl
          slots[m.authId] = m.slotIndex // 절대좌석용(identity=auth uid)
        }
        setMemberAvatars(avatars)
        setMemberSlots(slots)
      } catch { /* 명단 조회 실패 → 기본 아바타 fallback + slot 미상은 임시배치 */ }
    })()
    return () => { cancelled = true }
  }, [joinPhase, session, roomId, memberKey])

  const selfProjectUrl = resolveAvatarUrl(myAvatarUrl)
  const remoteProjectUrl = useCallback(
    (identity: string) => resolveAvatarUrl(memberAvatars[identity]),
    [memberAvatars],
  )
  const slotOf = useCallback((identity: string) => memberSlots[identity], [memberSlots])

  // 리액션 휠: 무대 우클릭(button 2)으로 커서 위치에 개화(홀드-드래그-릴리즈). origin=null=닫힘.
  const [reactionOrigin, setReactionOrigin] = useState<{ x: number; y: number } | null>(null)
  const openReactionWheel = useCallback((e: MouseEvent) => {
    if (e.button !== 2) return
    e.preventDefault()
    setReactionOrigin({ x: e.clientX, y: e.clientY })
  }, [])
  const closeReactionWheel = useCallback(() => setReactionOrigin(null), [])

  // dev 전용: 헤드리스 E2E 에서 리액션 DataChannel 왕복을 검증하는 주입 훅(SelfAvatar.__room 패턴과 동형).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __reactionE2E?: { send: (e: string) => void; floats: () => unknown[] } }
    w.__reactionE2E = { send: sendReaction, floats: () => useReactionStore.getState().floats }
    return () => { delete w.__reactionE2E }
  }, [sendReaction])

  // 대본 진행 권한 = 호스트(생성자=slot 0). ponytail: 정확한 host_id 판정(현재 public_rooms 뷰는 host_id 제외).
  const mySlotIndex = useRoomStore((s) => s.mySlotIndex)
  const isHost = mySlotIndex === 0
  const script = SEED_SCRIPTS[0]
  // ponytail: cue 진행 권한은 현재 **클라이언트 게이트만**(호스트에게만 버튼 노출) — 악의적 참가자가
  // 'script' 토픽을 직접 publish 하면 desync 가능. Phase 2 서버 권한(scripts 테이블 host-only UPDATE +
  // Edge Function 검증, contracts/ScriptPanel.md·state-machines/Script.md)으로 승급. MVP(초대 기반 협업방)는 수용.
  const advanceCue = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(script.cues.length - 1, cueIndex + delta))
    if (next === cueIndex) return
    setCueIndex(next)
    void sendCue(script.id, next) // reliable 브로드캐스트 → 전 참가자 동기(자기 echo 없음, 로컬은 위에서 갱신)
  }, [cueIndex, sendCue, script])

  // 호스트: 연결 직후 + 참가자 변동 시 현재 cue 를 재브로드캐스트.
  // reliable DataChannel 은 첫 publishData 로 개설되며 그 메시지가 유실될 수 있어(모든 세션 첫 진행 유실),
  // 연결 시 warm-up 겸 현재 상태를 흘려 채널을 연다. 겸사겸사 늦게 입장한 참가자도 현재 cue 로 동기.
  const cueIndexRef = useRef(cueIndex)
  useEffect(() => { cueIndexRef.current = cueIndex }, [cueIndex])
  useEffect(() => {
    if (!isHost || !connected) return
    void sendCue(script.id, cueIndexRef.current)
  }, [isHost, connected, memberKey, sendCue, script])

  // 우측 패널 탭(주입식 블록): 채팅·DUB·VGen. 각 탭은 자족적 컴포넌트 — 셸은 전환만 담당.
  // ponytail: 대본 미러(script)·디렉터 노트(notes, ROOM-17)·사운드보드 탭은 후속(contracts/RightPanel.md 구현 현황).
  const kick = useCallback(
    async (identity: string) => {
      if (!session) return
      await kickParticipant(session.access_token, roomId, identity)
    },
    [session, roomId],
  )
  const mute = useCallback(
    async (identity: string, muted: boolean) => {
      if (!session) return
      await setParticipantMute(session.access_token, roomId, identity, muted)
    },
    [session, roomId],
  )
  // 방 비밀번호 설정/해제 → 서버가 반환한 is_locked 를 HostConsole 에 반영.
  const changePassword = useCallback(
    async (password: string): Promise<boolean> => {
      if (!session) return roomLocked
      const r = await setRoomPassword(session.access_token, roomId, password)
      setRoomLocked(r.is_locked)
      return r.is_locked
    },
    [session, roomId, roomLocked],
  )
  // VGEN 공유: jobId 방송 + 자기 화면 로컬 반영(publishData self-echo 없음). 중지도 방송+로컬.
  const shareVgen = useCallback(
    async (jobId: string) => {
      await sendRoomAuthority({ type: 'vgen_result', jobId })
      await playSharedVgen(jobId)
    },
    [sendRoomAuthority, playSharedVgen],
  )
  const stopShareVgen = useCallback(async () => {
    await sendRoomAuthority({ type: 'vgen_stop' })
    useStageStore.getState().clearMainVideo()
  }, [sendRoomAuthority])

  const tabs: RightPanelTab[] = [
    { id: 'chat', label: t('room.chat'), render: () => <ChatPanel connected={connected} onSend={sendChat} /> },
    { id: 'dub', label: t('room.tabDub'), render: () => <DubPanel roomId={roomId} /> },
    { id: 'vgen', label: t('room.tabVgen'), render: () => <VgenStatusTab roomId={roomId} isHost={isHost} onShare={shareVgen} /> },
  ]
  if (isHost) {
    tabs.push({
      id: 'host',
      label: t('host.tab'),
      render: () => (
        <HostConsole
          participants={participants}
          myIdentity={myIdentity}
          onKick={kick}
          onSetMute={mute}
          onSetPassword={changePassword}
          initialLocked={roomLocked}
        />
      ),
    })
  }

  // 잠금방 비번 입장(입장 단계 'password'). 성공 시 roomLocked=true(호스트면 콘솔에 잠금 상태 반영).
  async function submitJoinPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return
    setPwPhaseBusy(true)
    setPwPhaseErr(null)
    try {
      const r = await joinRoomWithPassword(session.access_token, roomId, passwordInput)
      useRoomStore.getState().setRoomContext({
        currentRoomId: roomId,
        myParticipantId: r.participant_id,
        mySlotIndex: r.slot_index,
      })
      setRoomLocked(true)
      setJoinPhase('ready')
    } catch {
      setPwPhaseErr(t('room.wrongPassword'))
      setPwPhaseBusy(false)
    }
  }

  async function onLeave() {
    if (session) {
      try {
        await leaveRoom(session.access_token, roomId) // DB soft-leave + 호스트 승계
      } catch {
        /* 네트워크 실패해도 화면 이탈은 진행 */
      }
    }
    await leave()
    useStageStore.getState().clearMainVideo()
    useRoomStore.getState().setRoomContext({
      currentRoomId: null,
      roomStatus: null,
      hostId: null,
      myParticipantId: null,
      mySlotIndex: null,
    })
    navigate('/lobby', { replace: true })
  }

  if (joinPhase === 'joining') {
    return (
      <main className="grid min-h-screen place-items-center bg-stage-base text-stage-text-muted">
        <p role="status" aria-live="polite">{t('room.joining')}</p>
      </main>
    )
  }

  if (joinPhase === 'error') {
    return (
      <main className="grid min-h-screen place-items-center bg-stage-base text-stage-text">
        <div className="text-center">
          <p className="text-fire-hot" role="alert">{joinError}</p>
          <button
            onClick={() => navigate('/lobby', { replace: true })}
            className="mt-4 rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
          >
            {t('room.backToLobby')}
          </button>
        </div>
      </main>
    )
  }

  if (joinPhase === 'password') {
    return (
      <main className="grid min-h-screen place-items-center bg-stage-base text-stage-text">
        <form onSubmit={submitJoinPassword} className="w-full max-w-xs px-6 text-center">
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
          {pwPhaseErr && <p className="mt-2 text-xs text-fire-hot" role="alert">{pwPhaseErr}</p>}
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="submit"
              disabled={pwPhaseBusy || !passwordInput}
              className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {t('room.passwordSubmit')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/lobby', { replace: true })}
              className="rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </main>
    )
  }

  if (kicked) {
    return (
      <main className="grid min-h-screen place-items-center bg-stage-base text-stage-text">
        <div className="text-center">
          <p className="text-fire-hot" role="alert">{t('host.kickedNotice')}</p>
          <button
            onClick={() => navigate('/lobby', { replace: true })}
            className="mt-4 rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
          >
            {t('room.backToLobby')}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-stage-base text-stage-text p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('room.title')}</h1>
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <span className={`h-2.5 w-2.5 rounded-full ${STATE_COLOR[connectionState]}`} />
          <span className="text-sm text-stage-text-muted">
            {STATE_LABEL[connectionState]}
          </span>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-fire-hot/10 px-4 py-2 text-sm text-fire-hot" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* 좌측: 참가자·무대·대본·컨트롤 */}
        <div className="flex-1 space-y-8">
          <section>
            <h2 className="text-sm font-semibold text-stage-text-muted">
              {t('room.participants')} ({participants.length})
            </h2>
            <ul className="mt-2 space-y-2">
              {participants.map((p) => (
                <li
                  key={p.identity}
                  className="flex items-center gap-2 rounded-lg border border-stage-border px-4 py-2"
                >
                  <span className={`h-2 w-2 rounded-full ${p.isSpeaking ? 'bg-green-500' : 'bg-stage-border'}`} />
                  <span>{p.name}</span>
                  {p.isLocal && <span className="text-xs text-stage-text-muted">{t('room.me')}</span>}
                </li>
              ))}
            </ul>
          </section>

          {connected && (
            <section>
              <h2 className="text-sm font-semibold text-stage-text-muted">
                {t('room.stage')} <span className="text-xs font-normal text-stage-text-muted/70">· {t('reaction.hint')}</span>
              </h2>
              <div
                className="relative mt-2 rounded-lg border border-stage-border p-4"
                onContextMenu={(e) => e.preventDefault()}
                onMouseDown={openReactionWheel}
              >
                <Stage
                  participants={participants}
                  selfProjectUrl={selfProjectUrl}
                  remoteProjectUrl={remoteProjectUrl}
                  slotOf={slotOf}
                  sendBlendshapes={sendBlendshapes}
                  remoteAvatars={remoteAvatars}
                  isHost={isHost}
                  onStopShare={stopShareVgen}
                />
                <ReactionOverlay slotOf={slotOf} />
              </div>
              {reactionOrigin && <ReactionWheel origin={reactionOrigin} onFire={sendReaction} onClose={closeReactionWheel} />}
            </section>
          )}

          {connected && (
            <ScriptPanel
              script={script}
              cueIndex={cueIndex}
              isHost={isHost}
              myRole={myRole}
              onPickRole={setMyRole}
              onAdvance={advanceCue}
            />
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={toggleMic}
              disabled={!connected || mutedByHost}
              className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
            >
              {micEnabled ? t('room.micOff') : t('room.micOn')}
            </button>
            {mutedByHost && (
              <span className="text-xs text-fire-hot" role="status">{t('room.mutedByHost')}</span>
            )}
            <button
              onClick={onLeave}
              className="rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
            >
              {t('room.leave')}
            </button>
          </div>
        </div>

        {/* 우측: 탭 셸(채팅·DUB·VGen) */}
        <div className="lg:w-96 lg:shrink-0">
          <RightPanel tabs={tabs} />
        </div>
      </div>
    </main>
  )
}
