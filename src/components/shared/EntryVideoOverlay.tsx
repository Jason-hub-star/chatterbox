import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  // 포털: AuthShell 모바일 패널의 backdrop-blur 가 fixed 의 기준점을 카드로 바꿔
  // 오버레이가 카드 크기로 갇히는 함정 → body 직결로 뷰포트 전체를 확보.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-stage-base" onClick={finish} role="presentation" data-entry-overlay>
      {/* 크롭 정렬: AuthShell 모바일 배경과 동일한 30% — 세로 화면에서 열리는 순간 그림 조각이 튀지 않고
          인물이 보이는 슬라이스에서 시작(16:9→세로 커버 크롭의 이음새). */}
      <img
        src={hero}
        alt=""
        draggable={false}
        className="entry-zoom h-full w-full select-none object-cover"
        style={{ objectPosition: '30% center' }}
      />
      <video
        src={video}
        autoPlay
        muted
        playsInline
        onCanPlay={() => setVideoReady(true)}
        onEnded={finish}
        onError={finish}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
        style={{ objectPosition: '30% center' }}
      />
      <p className="absolute bottom-4 right-5 text-xs text-stage-text-muted/80">{t('entry.skipHint')}</p>
    </div>,
    document.body,
  )
}
