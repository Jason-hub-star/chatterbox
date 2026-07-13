import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { RigAvatar, createExpressionDriver } from '@/lib/pixi/rig'
import { setSelfFrameSink } from '@/features/avatar/selfFrameSink'
import type { RemoteFrameSink } from '@/features/avatar/RemoteAvatar'
import Modal from '@/components/shared/Modal'

// 아바타 크게보기 오버레이 — 배치 무관 재사용(무대 클릭·관전자 뷰·갤러리 등 공용, TeleprompterFocus 와 같은 분리 취지).
// participant 1명을 큰 rig 로 확대. 프레임 소싱이 self/remote 로 갈린다:
//   · self   = selfFrameSink 구독(무대 SelfAvatar 는 그대로 두고 웹캠 프레임을 공유 — 안 끊김).
//   · remote = registry(identity 당 sink 1개)라 확대창이 그 sink 를 잡는다 → 소비처가 원본 슬롯을 비운 전제(무대 placeholder).
// ceiling: 동시 1명(단일 오버레이). 확대창은 WebGL 컨텍스트 +1. 리사이즈 재생성은 defer(마운트 시 size 1회 산정).
export interface AvatarZoomTarget {
  identity: string
  name: string
  isLocal: boolean
  isHost: boolean
  projectUrl: string
}

export default function AvatarZoomOverlay({
  target,
  remoteRegistry,
  onClose,
}: {
  target: AvatarZoomTarget
  remoteRegistry: RefObject<Map<string, RemoteFrameSink>>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const mountRef = useRef<HTMLDivElement>(null)
  // 확대 크기 = min(80vw, 80vh). 마운트 시 1회 고정(리사이즈 재생성은 defer) — useState lazy 로 렌더 중 ref 접근 회피.
  const [size] = useState(() => Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.8))

  useEffect(() => {
    let cancelled = false
    let created: RigAvatar | null = null
    const reg = remoteRegistry.current
    const mount = mountRef.current
    const driver = createExpressionDriver({ mirror: target.isLocal }) // self=셀카 거울(무대 self-view 와 일치), 원격=아님
    if (mount) {
      RigAvatar.create(mount, { projectUrl: target.projectUrl, size })
        .then((av) => {
          if (cancelled) {
            av.destroy()
            return
          }
          created = av
          if (target.isLocal) {
            setSelfFrameSink((bs, headPose) => av.setParams(driver(bs, headPose)))
          } else {
            reg?.set(target.identity, (frame) => av.setParams(driver(frame.blendshapes, null)))
          }
        })
        .catch((e: unknown) => {
          if (import.meta.env.DEV) console.warn('확대 아바타 로드 실패', target.identity, e)
        })
    }
    return () => {
      cancelled = true
      if (target.isLocal) setSelfFrameSink(null)
      else reg?.delete(target.identity)
      created?.destroy()
    }
  }, [target.identity, target.isLocal, target.projectUrl, remoteRegistry, size])

  return (
    <Modal title={target.name} onClose={onClose} widthClass="max-w-[92vw]">
      <div className="mt-3 flex flex-col items-center gap-2">
        <div
          ref={mountRef}
          data-avatar-zoom={target.identity}
          style={{ width: size, height: size }}
          className={`overflow-hidden rounded-full bg-[#f4f0e8] ${target.isHost ? 'ring-2 ring-fire-amber' : ''}`}
        />
        <span className="text-xs text-stage-text-muted">
          {target.isLocal ? t('stage.selfLabel') : target.name}
          {target.isHost ? ` · ${t('stage.directorTag')}` : ''}
        </span>
      </div>
    </Modal>
  )
}
