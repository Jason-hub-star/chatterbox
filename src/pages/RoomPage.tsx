import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveKitRoom } from '@/hooks/useLiveKitRoom'
import { useRoomStore, type ConnectionState } from '@/stores/roomStore'
import { useUserStore } from '@/stores/userStore'
import { joinRoom, leaveRoom } from '@/lib/rooms'
import { isNewerSeq, type BlendshapeFrame } from '@/lib/blendshapeCodec'
import AvatarLayer from '@/features/avatar/AvatarLayer'
import type { RemoteFrameSink } from '@/features/avatar/RemoteAvatar'
import DubPanel from '@/features/dub/DubPanel'

// Phase 1B PoC: 2인 오디오 연결 최소 UI.
// ponytail: 무대(StageLayout)·씬·채팅 패널은 Phase 2~3 (contracts/RoomView.md).
// 경로 B: 아바타는 네이티브 아리아 실 rig. PoC는 전원 아리아(같은 URL) — 프로덕션은 참가자별 avatar URL.
const ARIA_PROJECT = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/aria/project.json`

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
  // 싱크는 RemoteAvatar가 자기 AriaAvatar+드라이버로 등록 — RoomPage는 아바타 타입을 모른다(디커플).
  const remoteAvatars = useRef<Map<string, RemoteFrameSink>>(new Map())
  const lastSeq = useRef<Map<string, number>>(new Map())
  const handleBlendshapes = useCallback((identity: string, frame: BlendshapeFrame) => {
    if (!isNewerSeq(lastSeq.current.get(identity) ?? 0, frame.seq)) return // 역전·중복 드롭
    lastSeq.current.set(identity, frame.seq)
    // RT-02 프레임엔 head pose 없음 → 싱크가 headPose=null로 구동(gaze는 blendshape이라 반영).
    remoteAvatars.current.get(identity)?.(frame)
  }, [])

  const { toggleMic, sendChat, sendBlendshapes, leave } = useLiveKitRoom(roomId, {
    onBlendshapes: handleBlendshapes,
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
          <h2 className="text-sm font-semibold text-stage-text-muted">아바타</h2>
          <div className="mt-2 rounded-lg border border-stage-border p-4">
            <AvatarLayer
              participants={participants}
              projectUrl={ARIA_PROJECT}
              sendBlendshapes={sendBlendshapes}
              remoteAvatars={remoteAvatars}
            />
          </div>
        </section>
      )}

      <DubPanel roomId={roomId} />

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
