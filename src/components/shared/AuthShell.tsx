import type { ReactNode } from 'react'
import GlowMotes from '@/components/shared/GlowMotes'

// LoL식 인증 셸 — lg: 좌 패널(400px)과 우 스플래시가 "겹치지 않는" 별도 컬럼(LoL 방식).
//   패널이 그림을 덮으면 16:9 뷰포트에선 가로 크롭 여유가 없어 인물이 패널에 가림 →
//   스플래시를 우측 컬럼에 담아 컬럼 안에서 object-position(30%)으로 인물을 온전히 노출.
// 모바일: 스플래시 전체 배경 + 스크림 위 패널 카드 오버레이.
const SCENE_ACCENT = '#FFD98A' // scenes.accent_color (login-splash)

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="relative h-screen overflow-hidden bg-stage-base text-stage-text lg:flex"
      style={{ '--scene-accent': SCENE_ACCENT } as React.CSSProperties}
    >
      {/* 스플래시 — 모바일: 전체 배경 / lg: 우측 flex 컬럼(패널과 비겹침) */}
      <div className="absolute inset-0 lg:relative lg:order-2 lg:inset-auto lg:h-full lg:flex-1">
        <img
          src="/scenes/login-splash/splash.webp"
          alt=""
          draggable={false}
          className="h-full w-full select-none object-cover"
          style={{ objectPosition: '30% center' }}
        />
        <GlowMotes />
        {/* 모바일 가독 스크림(lg 는 패널이 불투명 컬럼이라 불필요) */}
        <div aria-hidden className="absolute inset-0 bg-black/35 lg:bg-transparent" />
      </div>

      {/* 패널 — 모바일: 중앙 카드 / lg: 좌측 불투명 컬럼 */}
      <div className="relative z-10 flex h-full items-center justify-center p-6 lg:order-1 lg:w-[400px] lg:shrink-0 lg:p-0">
        <div className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-stage-panel/90 p-8 backdrop-blur-md lg:flex lg:h-full lg:w-full lg:max-w-none lg:flex-col lg:justify-center lg:rounded-none lg:border-r lg:border-white/10 lg:bg-stage-base lg:px-12 lg:backdrop-blur-none">
          <div className="mb-8 text-center">
            <span className="text-2xl font-bold tracking-tight">ChatterBox</span>
          </div>
          {children}
        </div>
      </div>
    </main>
  )
}
