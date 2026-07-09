import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import GlowMotes from '@/components/shared/GlowMotes'
import WorldGallery from '@/components/shared/WorldGallery'
import { resolveWorld } from '@/scenes/manifest'
import { useEffectiveWorld } from '@/stores/worldStore'

// LoL식 인증 셸 — lg: 좌 패널(400px)과 우 스플래시가 "겹치지 않는" 별도 컬럼(LoL 방식).
//   패널이 그림을 덮으면 16:9 뷰포트에선 가로 크롭 여유가 없어 인물이 패널에 가림 →
//   스플래시를 우측 컬럼에 담아 컬럼 안에서 object-position(30%)으로 인물을 온전히 노출.
// 모바일: 스플래시 전체 배경 + 스크림 위 패널 카드 오버레이.
// 스플래시·액센트는 현재 세계관(worldStore) — 로그인 스플래시의 월드 어피던스로 갤러리를 열어 전환.

export default function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  // 세계관 단일 상태(worldStore)를 읽어 스플래시·액센트를 그 월드로 — 로그인부터 세계관이 이어짐.
  const worldId = useEffectiveWorld()
  const scene = useMemo(() => resolveWorld(worldId), [worldId])
  const [galleryOpen, setGalleryOpen] = useState(false)
  return (
    <main
      className="relative h-screen overflow-hidden bg-stage-base text-stage-text lg:flex"
      style={{ '--scene-accent': scene.accent } as React.CSSProperties}
    >
      {/* 스플래시 — 모바일: 전체 배경 / lg: 우측 flex 컬럼(패널과 비겹침) */}
      <div className="absolute inset-0 lg:relative lg:order-2 lg:inset-auto lg:h-full lg:flex-1">
        <img
          src={scene.loginSplash.hero}
          alt=""
          draggable={false}
          className="h-full w-full select-none object-cover"
          style={{ objectPosition: '30% center' }}
        />
        <GlowMotes />
        {/* 모바일 가독 스크림(lg 는 패널이 불투명 컬럼이라 불필요) */}
        <div aria-hidden className="absolute inset-0 bg-black/35 lg:bg-transparent" />

        {/* 월드 어피던스 — 현재 세계관 썸네일+이름, 탭하면 월드 갤러리(스케일 대비 선택 UI) */}
        <button
          type="button"
          onClick={() => setGalleryOpen(true)}
          aria-label={t('worldGallery.change')}
          className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-full border border-white/25 bg-black/40 py-1.5 pl-1.5 pr-3 text-xs text-white shadow-lg backdrop-blur transition hover:bg-black/60"
        >
          <img src={scene.thumb} alt="" className="h-6 w-9 rounded-sm object-cover" />
          <span className="font-medium">{t(scene.label)}</span>
          <span className="text-white/55">· {t('worldGallery.change')}</span>
        </button>
      </div>

      {/* 패널 — 모바일: 중앙 카드 / lg: 좌측 불투명 컬럼 */}
      <div className="relative z-10 flex h-full items-center justify-center p-6 lg:order-1 lg:w-[400px] lg:shrink-0 lg:p-0">
        <div className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-stage-panel/60 p-8 shadow-2xl backdrop-blur-xl lg:flex lg:h-full lg:w-full lg:max-w-none lg:flex-col lg:justify-center lg:rounded-none lg:border-0 lg:border-r lg:border-white/10 lg:bg-stage-base lg:px-12 lg:shadow-none lg:backdrop-blur-none">
          <div className="mb-8 text-center">
            <span className="text-2xl font-bold tracking-tight">ChatterBox</span>
          </div>
          {children}
        </div>
      </div>

      {galleryOpen && <WorldGallery onClose={() => setGalleryOpen(false)} />}
    </main>
  )
}
