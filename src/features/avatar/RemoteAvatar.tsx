import { useEffect, useRef, type RefObject } from 'react'
import { ProceduralAvatar } from '@/lib/pixi/proceduralAvatar'

// 원격 참가자 1명의 절차적 아바타. 생성 시 registry에 등록해 두면
// 수신된 blendshape 프레임이 registry.get(identity).update()로 직접 구동한다(React state 우회).
interface Props {
  identity: string
  name: string
  registry: RefObject<Map<string, ProceduralAvatar>>
}

export default function RemoteAvatar({ identity, name, registry }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let created: ProceduralAvatar | null = null
    const reg = registry.current // RoomPage에서 1회 생성된 안정적 Map — 캡처해 cleanup에서 사용.
    const mount = mountRef.current
    if (mount) {
      ProceduralAvatar.create(mount, 240).then((av) => {
        if (cancelled) {
          av.destroy()
          return
        }
        created = av
        reg?.set(identity, av)
      })
    }
    return () => {
      cancelled = true
      reg?.delete(identity)
      created?.destroy()
    }
  }, [identity, registry])

  return (
    <figure className="flex flex-col items-center gap-2">
      <div
        ref={mountRef}
        data-remote-avatar={identity}
        className="overflow-hidden rounded-lg border border-stage-border"
      />
      <figcaption className="text-xs text-stage-text-muted">{name}</figcaption>
    </figure>
  )
}
