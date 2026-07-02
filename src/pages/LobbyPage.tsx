import { Link } from 'react-router'

export default function LobbyPage() {
  return (
    <main className="min-h-screen bg-stage-base text-stage-text p-8">
      <h1 className="text-3xl font-bold">로비</h1>
      <p className="mt-2 text-stage-text-muted">방 목록 (Phase 2에서 구현)</p>
      <Link to="/" className="mt-6 inline-block text-fire-amber">
        ← 홈
      </Link>
    </main>
  )
}
