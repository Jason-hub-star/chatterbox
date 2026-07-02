import { Link } from 'react-router'

// Phase 1 PoC: 실 rig(아리아) 표정 트래킹.
// 런타임(mini_cubism_app, PixiJS v8)만 public/aria-player/에 임베드(레포 고정 1.5MB).
// 캐릭터 에셋(character.json+parts)은 Supabase Storage(avatars/aria/)에서 URL 로드 → 아바타 수 늘어도 레포 불변.
// drive.html(panel 모드) = 웹캠 + MediaPipe + 검증된 blendshape→Cubism 매핑. ?project=<url>로 캐릭터 지정(캐릭터 무관).
// ponytail: iframe 임베드(단일 로컬 아바타). LiveKit 멀티플레이어(원격 파라미터 구동)는 네이티브 이식(B) 단계.
// 보안: project URL은 신뢰된 env(VITE_SUPABASE_URL)로 구성. 런타임 main.js도 ?project= origin을
// *.supabase.co/동일오리진으로 화이트리스트(임의 외부 URL 로드 차단) — 페이블 보안리뷰 반영.
const ARIA_PROJECT = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/aria/project.json`
const DRIVE_SRC = `/aria-player/drive.html?panel=1&project=${encodeURIComponent(ARIA_PROJECT)}`

export default function AriaPocPage() {
  return (
    <main className="flex h-screen flex-col bg-stage-base text-stage-text">
      <header className="flex items-center justify-between border-b border-stage-border px-6 py-3">
        <div>
          <h1 className="text-lg font-bold">아리아 — 실 rig 표정 트래킹</h1>
          <p className="text-xs text-stage-text-muted">
            “시작할게요”를 눌러 웹캠을 허용하면 아리아가 얼굴을 따라 움직여요.
          </p>
        </div>
        <nav className="flex gap-4 text-sm text-stage-text-muted">
          <Link to="/avatar-poc" className="hover:text-stage-text">
            절차적 PoC
          </Link>
          <Link to="/" className="hover:text-stage-text">
            홈
          </Link>
        </nav>
      </header>
      <iframe
        src={DRIVE_SRC}
        title="아리아 웹캠 트래킹"
        allow="camera"
        className="w-full flex-1 border-0"
      />
    </main>
  )
}
