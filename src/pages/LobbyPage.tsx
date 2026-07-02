import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useUserStore } from '@/stores/userStore'

export default function LobbyPage() {
  const email = useUserStore((s) => s.user?.email)
  const logout = useUserStore((s) => s.logout)
  const navigate = useNavigate()
  // Phase 1B PoC: 방 목록(Phase 2) 전까지 임시 방 입장 폼. 두 탭에 같은 ID 입력 → 오디오 왕복 테스트.
  const [roomId, setRoomId] = useState('poc-room')

  async function onLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  function onJoin(e: React.FormEvent) {
    e.preventDefault()
    const id = roomId.trim()
    if (id) navigate(`/rooms/${encodeURIComponent(id)}`)
  }

  return (
    <main className="min-h-screen bg-stage-base text-stage-text p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">로비</h1>
        <button
          onClick={onLogout}
          className="rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
        >
          로그아웃
        </button>
      </div>
      {email && <p className="mt-2 text-stage-text-muted">{email} 님, 환영합니다</p>}

      <form onSubmit={onJoin} className="mt-6 flex gap-2">
        <input
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          aria-label="방 ID"
          placeholder="방 ID"
          className="rounded-lg border border-stage-border bg-transparent px-4 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base"
        >
          PoC 방 입장
        </button>
      </form>
      <p className="mt-2 text-xs text-stage-text-muted">
        방 목록은 Phase 2에서 구현 — 지금은 두 탭에 같은 방 ID를 넣어 2인 오디오를 테스트해요.
      </p>
    </main>
  )
}
