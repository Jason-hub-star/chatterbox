import { useNavigate, useParams } from 'react-router'
import { useLiveKitRoom } from '@/hooks/useLiveKitRoom'
import { useRoomStore, type ConnectionState } from '@/stores/roomStore'

// Phase 1B PoC: 2인 오디오 연결 최소 UI.
// ponytail: 무대(StageLayout)·아바타·씬·채팅 패널은 Phase 2~3 (contracts/RoomView.md).

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
  const { toggleMic, leave } = useLiveKitRoom(roomId)

  const connectionState = useRoomStore((s) => s.connectionState)
  const participants = useRoomStore((s) => s.participants)
  const micEnabled = useRoomStore((s) => s.micEnabled)
  const error = useRoomStore((s) => s.error)

  async function onLeave() {
    await leave()
    navigate('/lobby', { replace: true })
  }

  return (
    <main className="min-h-screen bg-stage-base text-stage-text p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">방 {roomId}</h1>
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

      <div className="mt-8 flex gap-3">
        <button
          onClick={toggleMic}
          disabled={connectionState !== 'CONNECTED'}
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
    </main>
  )
}
