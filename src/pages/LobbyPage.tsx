import { useNavigate } from 'react-router'
import { useUserStore } from '@/stores/userStore'

export default function LobbyPage() {
  const email = useUserStore((s) => s.user?.email)
  const logout = useUserStore((s) => s.logout)
  const navigate = useNavigate()

  async function onLogout() {
    await logout()
    navigate('/', { replace: true })
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
      <p className="mt-4 text-stage-text-muted">방 목록 (Phase 2에서 구현)</p>
    </main>
  )
}
