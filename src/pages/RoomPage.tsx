import { Link, useParams } from 'react-router'

export default function RoomPage() {
  const { roomId } = useParams()
  return (
    <main className="min-h-screen bg-stage-base text-stage-text p-8">
      <h1 className="text-3xl font-bold">방 {roomId}</h1>
      <p className="mt-2 text-stage-text-muted">무대 (Phase 1~3에서 구현)</p>
      <Link to="/lobby" className="mt-6 inline-block text-fire-amber">
        ← 로비
      </Link>
    </main>
  )
}
