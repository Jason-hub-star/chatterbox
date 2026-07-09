import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RigAvatar, createExpressionDriver } from '@/lib/pixi/rig'
import { setSelfFrameSink } from '@/features/avatar/selfFrameSink'

// G-64 Self-모니터 PiP — 공연 중 내 아바타가 남들에게 어떻게 보이는지 확인하는 부동 미리보기.
// 계약(RoomView.md §G-64) 대비 편차: ①토글=자체 부동 버튼(Option1 SettingsPage 미존재·Option2 하단바는
//   병행 리디자인 소유 파일이라 자체 내장) ②리사이즈 defer(120px 고정, ponytail) ③전용 store 대신
//   로컬 상태(YAGNI — 단일 마운트) ④모바일(coarse pointer/<480px)은 토글 자체 미노출(WebGL 컨텍스트 예산).
// 기본 off — 켤 때만 WebGL 컨텍스트 +1, 끄면 즉시 destroy + 싱크 해제.
const SIZE = 120

export default function FloatingSelfMonitor({ projectUrl }: { projectUrl: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null) // null = 기본 우상단
  const [mobile] = useState(
    () => (window.matchMedia?.('(pointer: coarse)').matches ?? false) || window.innerWidth < 480,
  )
  const mountRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let created: RigAvatar | null = null
    const mount = mountRef.current
    const driver = createExpressionDriver({ mirror: true }) // self 와 같은 거울 방향(무대 self-view 와 일치)
    if (mount) {
      RigAvatar.create(mount, { projectUrl, size: SIZE })
        .then((av) => {
          if (cancelled) {
            av.destroy()
            return
          }
          created = av
          setSelfFrameSink((bs, headPose) => av.setParams(driver(bs, headPose)))
        })
        .catch((e: unknown) => {
          if (import.meta.env.DEV) console.warn('PiP 아바타 로드 실패', e)
        })
    }
    return () => {
      cancelled = true
      setSelfFrameSink(null)
      created?.destroy()
    }
  }, [open, projectUrl])

  if (mobile) return null

  // 무대 컨테이너(relative) 안 absolute — fixed 는 우측 도크를 상시 가려서 배제(계약 "우상단"=무대 우상단으로 해석).
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('stage.selfMonitorShow')}
        title={t('stage.selfMonitorShow')}
        className="absolute right-2 top-2 z-30 grid h-9 w-9 place-items-center rounded-full border border-stage-border bg-stage-panel/80 text-sm hover:border-fire-amber"
      >
        📷
      </button>
    )
  }

  return (
    <div
      data-self-monitor
      className="absolute z-30 cursor-grab touch-none select-none rounded-lg border border-stage-border bg-stage-panel/90 p-1 active:cursor-grabbing"
      style={pos ? { left: pos.x, top: pos.y } : { right: 8, top: 8 }}
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = dragRef.current
        if (!d) return
        // 부모(무대 컨테이너) 기준 좌표로 이동 — 컨테이너 밖 음수만 클램프(가벼운 경계).
        const parent = e.currentTarget.offsetParent?.getBoundingClientRect()
        const baseX = parent?.left ?? 0
        const baseY = parent?.top ?? 0
        setPos({ x: Math.max(0, e.clientX - d.dx - baseX), y: Math.max(0, e.clientY - d.dy - baseY) })
      }}
      onPointerUp={() => {
        dragRef.current = null
      }}
    >
      <div ref={mountRef} style={{ width: SIZE, height: SIZE }} className="overflow-hidden rounded-full bg-[#f4f0e8]" />
      <button
        type="button"
        onClick={() => setOpen(false)}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={t('stage.selfMonitorHide')}
        className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-stage-border bg-stage-elevated text-[11px] text-stage-text-muted hover:text-stage-text"
      >
        ✕
      </button>
    </div>
  )
}
