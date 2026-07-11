import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { HubDest } from '@/scenes/manifest'
import { useInterior } from '@/pages/lobby/useInterior'

// 내부 씬 공통 셸(로비 v3): 원화 무대 프레임(aspect 3/2 고정 — 앵커 % 좌표가 크롭 없이 정합)
// + ←/Esc 복귀 + 페이드 인. 모바일(<md)은 배너+세로 흐름 폴백(앵커는 정적 카드로 쌓임 — .interior-anchor).
// workbench(의상실 v6): 데스크탑에서 씬을 0.9초 온전히 보여준 뒤 디밍+블러 백드롭으로 전환하고
// children 이 전폭 작업공간을 채운다(룸 문법). 모바일·reduced-motion 은 연출 없이 즉시 본 상태.

export default function InteriorShell({
  dest,
  title,
  workbench = false,
  children,
}: {
  dest: HubDest
  title: string
  workbench?: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const interior = useInterior(dest)
  const [ready, setReady] = useState(
    () => !workbench || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    if (ready) return
    const id = setTimeout(() => setReady(true), 900)
    return () => clearTimeout(id)
  }, [ready])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/lobby')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <main className="interior min-h-screen bg-stage-base text-stage-text">
      <header className="flex items-center gap-3 px-4 py-3 md:absolute md:inset-x-0 md:top-0 md:z-20 md:px-6">
        <button
          onClick={() => navigate('/lobby')}
          className="rounded-lg border border-stage-border bg-stage-base/70 px-3 py-1.5 text-sm text-stage-text-muted backdrop-blur hover:text-stage-text"
        >
          ← {t('hub.backToPlaza')}
        </button>
        <h1 className="text-lg font-bold drop-shadow">{title}</h1>
      </header>

      <div
        className={`interior-stage relative mx-auto${workbench ? ' interior-stage--workbench' : ''}${ready ? ' is-ready' : ''}`}
      >
        {interior && (
          <img src={interior.hero} alt="" draggable={false} className="interior-bg select-none" />
        )}
        <div className="interior-body">{children}</div>
      </div>
    </main>
  )
}
