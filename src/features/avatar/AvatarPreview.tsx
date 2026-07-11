import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RigAvatar } from '@/lib/pixi/rig'

// 얼굴추적 없이 rig 를 중립 포즈로 보여주는 미리보기(설정 아바타 선택 등). features/stage/SelfAvatar self-mount 패턴 재사용.
// rig 로드 동안 스켈레톤 펄스 + 완화 카피(빈 흰 화면 방지 — 다운로드가 수 초 걸릴 수 있다).
// 사용처는 key={projectUrl} 리마운트 전제 — ready 를 effect 안에서 동기 리셋하지 않기 위함(set-state-in-effect 룰).
export default function AvatarPreview({ projectUrl, size = 200 }: { projectUrl: string; size?: number }) {
  const { t } = useTranslation()
  const mountRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let created: RigAvatar | null = null
    const mount = mountRef.current
    if (mount) {
      RigAvatar.create(mount, { projectUrl, size })
        .then((av) => {
          if (cancelled) { av.destroy(); return }
          created = av
          setReady(true)
        })
        .catch((e: unknown) => {
          if (import.meta.env.DEV) console.warn('아바타 미리보기 로드 실패', e)
        })
    }
    return () => {
      cancelled = true
      created?.destroy()
    }
  }, [projectUrl, size])

  return (
    <div
      ref={mountRef}
      data-avatar-preview
      className="relative overflow-hidden rounded-lg border border-stage-border bg-[#f4f0e8]"
      style={{ width: size, height: size }}
    >
      {!ready && (
        <div className="absolute inset-0 grid place-items-center" role="status">
          <div className="absolute inset-0 animate-pulse bg-stage-border/50" aria-hidden />
          <span className="relative rounded bg-stage-base/70 px-2.5 py-1 text-xs text-stage-text-muted backdrop-blur">
            {t('avatar.previewLoading')}
          </span>
        </div>
      )}
    </div>
  )
}
