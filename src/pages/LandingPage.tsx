import { Link } from 'react-router'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-stage-base text-stage-text flex flex-col items-center justify-center gap-6">
      <h1 className="text-5xl font-bold">ChatterBox</h1>
      <p className="text-stage-text-muted">PNG→VTuber · 실시간 연기 플랫폼</p>
      <Link
        to="/lobby"
        className="rounded-full bg-fire-amber px-6 py-3 font-medium text-stage-base"
      >
        로비로 입장
      </Link>
    </main>
  )
}
