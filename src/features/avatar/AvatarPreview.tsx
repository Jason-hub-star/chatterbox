import { useEffect, useRef } from 'react'
import { RigAvatar } from '@/lib/pixi/rig'

// 얼굴추적 없이 rig 를 중립 포즈로 보여주는 미리보기(설정 아바타 선택 등). features/stage/SelfAvatar self-mount 패턴 재사용.
export default function AvatarPreview({ projectUrl, size = 200 }: { projectUrl: string; size?: number }) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let created: RigAvatar | null = null
    const mount = mountRef.current
    if (mount) {
      RigAvatar.create(mount, { projectUrl, size })
        .then((av) => {
          if (cancelled) { av.destroy(); return }
          created = av
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
      className="overflow-hidden rounded-lg border border-stage-border bg-[#f4f0e8]"
      style={{ width: size, height: size }}
    />
  )
}
