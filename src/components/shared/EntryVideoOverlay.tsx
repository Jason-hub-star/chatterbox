import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

// 입장 영상 오버레이(아트 피벗 Phase 3 = ONBOARDING-01 시네마틱 인트로).
// 이음새 4중 설계(scene-prompts.md): 자체 스틸(스플래시)에 슬로우 줌(entry-zoom)을 걸고
// 그 위로 영상을 크로스페이드 — 영상 0번 프레임이 같은 그림이라 픽셀·모션이 연속된다.
// 스킵 = 클릭/Esc. 영상 로드 실패는 즉시 onDone(연출은 장식 — 흐름을 막지 않는다).
export default function EntryVideoOverlay({ hero, video, onDone }: { hero: string; video: string; onDone: () => void }) {
  const { t } = useTranslation()
  const doneRef = useRef(false)
  const [videoReady, setVideoReady] = useState(false)
  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish 는 ref 가드로 멱등
  }, [])
  return (
    <div className="fixed inset-0 z-50 bg-stage-base" onClick={finish} role="presentation" data-entry-overlay>
      <img src={hero} alt="" draggable={false} className="entry-zoom h-full w-full select-none object-cover" />
      <video
        src={video}
        autoPlay
        muted
        playsInline
        onCanPlay={() => setVideoReady(true)}
        onEnded={finish}
        onError={finish}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
      />
      <p className="absolute bottom-4 right-5 text-xs text-stage-text-muted/80">{t('entry.skipHint')}</p>
    </div>
  )
}
