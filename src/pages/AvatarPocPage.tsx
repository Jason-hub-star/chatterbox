import { Link } from 'react-router'
import AvatarStage from '@/features/avatar/AvatarStage'

// Phase 1B PoC: 웹캠 → MediaPipe 52 blendshape → PixiJS 아바타 표정 (로컬 전용).
// ponytail: LiveKit DataChannel 전송·DB·캘리브레이션은 다음 스텝.
export default function AvatarPocPage() {
  return (
    <main className="min-h-screen bg-stage-base p-8 text-stage-text">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">표정 트래킹 PoC (절차적)</h1>
          <nav className="flex gap-4 text-sm text-stage-text-muted">
            <Link to="/avatar-aria" className="text-fire-amber hover:brightness-110">
              아리아 실 rig →
            </Link>
            <Link to="/" className="hover:text-stage-text">
              홈
            </Link>
          </nav>
        </div>
        <p className="mt-2 text-sm text-stage-text-muted">
          웹캠 권한을 허용하세요. 눈을 깜박이거나 입을 벌리거나 웃으면 오른쪽 아바타가 따라 합니다.
        </p>

        <section className="mt-8">
          <AvatarStage />
        </section>
      </div>
    </main>
  )
}
