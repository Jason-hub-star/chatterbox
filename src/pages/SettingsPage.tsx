import { Link } from 'react-router'

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-stage-base text-stage-text p-8">
      <h1 className="text-3xl font-bold">설정</h1>
      <p className="mt-2 text-stage-text-muted">오디오·성능·크레딧 (Phase 4에서 구현)</p>
      <Link to="/" className="mt-6 inline-block text-fire-amber">
        ← 홈
      </Link>
    </main>
  )
}
