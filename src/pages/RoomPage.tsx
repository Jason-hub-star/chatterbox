import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveKitRoom } from '@/hooks/useLiveKitRoom'
import { useRoomStore, type ConnectionState } from '@/stores/roomStore'
import { useUserStore } from '@/stores/userStore'
import { joinRoom, leaveRoom } from '@/lib/rooms'
import { fetchRoomMembers } from '@/lib/dub'
import { resolveAvatarUrl } from '@/lib/avatars'
import { isNewerSeq, type BlendshapeFrame } from '@/lib/blendshapeCodec'
import Stage from '@/features/stage/Stage'
import type { RemoteFrameSink } from '@/features/avatar/RemoteAvatar'
import DubPanel from '@/features/dub/DubPanel'
import VgenStatusTab from '@/features/vgen/VgenStatusTab'
import ScriptPanel from '@/features/script/ScriptPanel'
import { SEED_SCRIPTS } from '@/features/script/cues'

// Phase 1B PoC: 2인 오디오 연결 최소 UI.
// ponytail: 무대(StageLayout)·씬·채팅 패널은 Phase 2~3 (contracts/RoomView.md).
// 경로 B: 아바타는 네이티브 아리아 실 rig. 참가자별 avatar URL(users.avatar_url) — 미설정은 기본 아바타(resolveAvatarUrl).

const STATE_LABEL: Record<ConnectionState, string> = {
  DISCONNECTED: '연결 안 됨',
  CONNECTING: '연결 중…',
  CONNECTED: '연결됨',
  RECONNECTING: '재연결 중…',
  FAILED: '연결 실패',
}

const STATE_COLOR: Record<ConnectionState, string> = {
  DISCONNECTED: 'bg-stage-border',
  CONNECTING: 'bg-fire-amber',
  CONNECTED: 'bg-green-500',
  RECONNECTING: 'bg-fire-amber',
  FAILED: 'bg-fire-hot',
}

export default function RoomPage() {
  const { roomId = '' } = useParams()
  const navigate = useNavigate()
  const session = useUserStore((s) => s.session)
  const myAvatarUrl = useUserStore((s) => s.avatarUrl)

  // 입장 단계: LiveKit 연결 전에 반드시 room_participants 행을 만든다(멱등).
  // livekit-token 게이트가 활성 참가자 행을 요구하므로, join 성공 후에만 연결(enabled).
  const [joinPhase, setJoinPhase] = useState<'joining' | 'ready' | 'error'>('joining')
  const [joinError, setJoinError] = useState<string | null>(null)

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
        setJoinError(e instanceof Error ? e.message : '방 입장에 실패했어요.')
        setJoinPhase('error')
      }
    })()
    return () => {
      cancelled = true
    }
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

  const { toggleMic, sendChat, sendBlendshapes, sendCue, leave } = useLiveKitRoom(roomId, {
    onBlendshapes: handleBlendshapes,
    onCue: handleCue,
    enabled: joinPhase === 'ready',
  })

  const connectionState = useRoomStore((s) => s.connectionState)
  const participants = useRoomStore((s) => s.participants)
  const messages = useRoomStore((s) => s.messages)
  const micEnabled = useRoomStore((s) => s.micEnabled)
  const error = useRoomStore((s) => s.error)

  const [draft, setDraft] = useState('')
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
  useEffect(() => {
    if (joinPhase !== 'ready' || !session) return
    let cancelled = false
    ;(async () => {
      try {
        const members = await fetchRoomMembers(session.access_token, roomId)
        if (cancelled) return
        const map: Record<string, string | null> = {}
        for (const m of members) map[m.authId] = m.avatarUrl
        setMemberAvatars(map)
      } catch { /* 명단 조회 실패 → 기본 아바타 fallback */ }
    })()
    return () => { cancelled = true }
  }, [joinPhase, session, roomId, memberKey])

  const selfProjectUrl = resolveAvatarUrl(myAvatarUrl)
  const remoteProjectUrl = useCallback(
    (identity: string) => resolveAvatarUrl(memberAvatars[identity]),
    [memberAvatars],
  )

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

  // 새 메시지 도착 시 목록 하단으로 자동 스크롤.
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  async function onLeave() {
    if (session) {
      try {
        await leaveRoom(session.access_token, roomId) // DB soft-leave + 호스트 승계
      } catch {
        /* 네트워크 실패해도 화면 이탈은 진행 */
      }
    }
    await leave()
    useRoomStore.getState().setRoomContext({
      currentRoomId: null,
      roomStatus: null,
      hostId: null,
      myParticipantId: null,
      mySlotIndex: null,
    })
    navigate('/lobby', { replace: true })
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    await sendChat(draft)
    setDraft('')
  }

  if (joinPhase === 'joining') {
    return (
      <main className="grid min-h-screen place-items-center bg-stage-base text-stage-text-muted">
        <p role="status" aria-live="polite">방에 입장하는 중…</p>
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
            로비로 돌아가기
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-stage-base text-stage-text p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">방</h1>
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

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-stage-text-muted">
          참가자 ({participants.length})
        </h2>
        <ul className="mt-2 space-y-2">
          {participants.map((p) => (
            <li
              key={p.identity}
              className="flex items-center gap-2 rounded-lg border border-stage-border px-4 py-2"
            >
              <span className={`h-2 w-2 rounded-full ${p.isSpeaking ? 'bg-green-500' : 'bg-stage-border'}`} />
              <span>{p.name}</span>
              {p.isLocal && <span className="text-xs text-stage-text-muted">(나)</span>}
            </li>
          ))}
        </ul>
      </section>

      {connected && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-stage-text-muted">무대</h2>
          <div className="mt-2 rounded-lg border border-stage-border p-4">
            <Stage
              participants={participants}
              selfProjectUrl={selfProjectUrl}
              remoteProjectUrl={remoteProjectUrl}
              sendBlendshapes={sendBlendshapes}
              remoteAvatars={remoteAvatars}
            />
          </div>
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

      <DubPanel roomId={roomId} />

      <VgenStatusTab roomId={roomId} isHost={isHost} />

      <div className="mt-8 flex gap-3">
        <button
          onClick={toggleMic}
          disabled={!connected}
          className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
        >
          {micEnabled ? '🎙 마이크 끄기' : '🔇 마이크 켜기'}
        </button>
        <button
          onClick={onLeave}
          className="rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
        >
          나가기
        </button>
      </div>

      <section className="mt-8 max-w-xl">
        <h2 className="text-sm font-semibold text-stage-text-muted">채팅</h2>
        <ul
          ref={listRef}
          className="mt-2 h-64 space-y-1 overflow-y-auto rounded-lg border border-stage-border p-3 text-sm"
          aria-label="채팅 메시지"
        >
          {messages.length === 0 && (
            <li className="text-stage-text-muted">아직 메시지가 없어요.</li>
          )}
          {messages.map((m) => (
            <li key={m.id}>
              <span className={m.isLocal ? 'text-fire-amber' : 'text-stage-text-muted'}>
                {m.sender}
              </span>
              <span className="text-stage-text-muted">: </span>
              <span>{m.text}</span>
            </li>
          ))}
        </ul>
        <form onSubmit={onSend} className="mt-2 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!connected}
            aria-label="메시지 입력"
            placeholder={connected ? '메시지를 입력하세요' : '연결되면 입력할 수 있어요'}
            className="flex-1 rounded-lg border border-stage-border bg-transparent px-3 py-2 text-sm disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!connected || !draft.trim()}
            className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
          >
            보내기
          </button>
        </form>
      </section>
    </main>
  )
}
