import { useEffect, useRef, type RefObject } from 'react'
import { RigAvatar, createExpressionDriver } from '@/lib/pixi/rig'
import type { BlendshapeFrame } from '@/lib/blendshapeCodec'

// 원격 참가자 1명의 네이티브 아리아 아바타(경로 B). 생성 시 registry에 **프레임 싱크**를 등록 —
// 수신 blendshape 프레임이 registry.get(identity)(frame)으로 직접 구동한다(React state 우회).
// 각 원격이 자기 드라이버 인스턴스를 가져 눈 개폐 적응 baseline이 서로 안 섞인다.
// 원격은 RT-02(52 blendshape만) → headPose=null(머리 방향 없음). gaze는 blendshape이라 반영됨.
export type RemoteFrameSink = (frame: BlendshapeFrame) => void

interface Props {
  identity: string
  name: string
  projectUrl: string
  registry: RefObject<Map<string, RemoteFrameSink>>
}

export default function RemoteAvatar({ identity, name, projectUrl, registry }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let created: RigAvatar | null = null
    const reg = registry.current // RoomPage에서 1회 생성된 안정적 Map — 캡처해 cleanup에서 사용.
    const mount = mountRef.current
    const driver = createExpressionDriver({ mirror: false }) // 원격은 셀카 거울 아님
    if (mount) {
      RigAvatar.create(mount, { projectUrl, size: 240 })
        .then((av) => {
          if (cancelled) {
            av.destroy()
            return
          }
          created = av
          reg?.set(identity, (frame) => av.setParams(driver(frame.blendshapes, null)))
          // dev 전용: 헤드리스 E2E에서 원격 아바타 렌더 반응을 extract로 검증하기 위한 주입 훅.
          if (import.meta.env.DEV) {
            const w = window as unknown as { __remoteAvatars?: Map<string, RigAvatar> }
            ;(w.__remoteAvatars ??= new Map()).set(identity, av)
          }
        })
        .catch((e: unknown) => {
          // 원격 1명 로드 실패가 룸 전체를 깨지 않게 격리(빈 박스로 남음).
          if (import.meta.env.DEV) console.warn('원격 아바타 로드 실패', identity, e)
        })
    }
    return () => {
      cancelled = true
      reg?.delete(identity)
      if (import.meta.env.DEV) {
        ;(window as unknown as { __remoteAvatars?: Map<string, RigAvatar> }).__remoteAvatars?.delete(identity)
      }
      created?.destroy()
    }
  }, [identity, projectUrl, registry])

  return (
    <figure className="flex flex-col items-center gap-2">
      <div
        ref={mountRef}
        data-remote-avatar={identity}
        className="overflow-hidden rounded-lg border border-stage-border bg-[#f4f0e8]"
        style={{ width: 240, height: 240 }}
      />
      <figcaption className="text-xs text-stage-text-muted">{name}</figcaption>
    </figure>
  )
}
