import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReactionStore } from '@/stores/reactionStore'
import { slotOffset, nearestSlot } from './reactionSlots'

// 라디얼 리액션 휠. RoomPage 가 무대 우클릭(mousedown button 2)으로 origin 을 세팅해 마운트한다(열 때마다 새 마운트 = 상태 초기화).
// 상호작용: 홀드-드래그-릴리즈(파이메뉴 방식) — 조준 슬롯 위에서 떼면 발사, 중앙서 떼면 sticky(열린 채 → 클릭 선택).
// 슬롯 세트는 reactionStore(커스터마이즈·N 가변)에서 읽는다. SSOT: docs/contracts/ReactionWheel.md
// ponytail: 모바일 롱프레스·키보드 1~N 핫키·화면끝 클램프·2중링(12+)은 후속.

const RADIUS = 92
const CHIP = 52
const DEADZONE = 34

interface Props {
  origin: { x: number; y: number } // RoomPage 가 열릴 때만 렌더 → 항상 유효
  onFire: (emoji: string) => void
  onClose: () => void
}

export default function ReactionWheel({ origin, onFire, onClose }: Props) {
  const { t } = useTranslation()
  const slots = useReactionStore((s) => s.slots)
  const [active, setActive] = useState<number | null>(null)
  const [sticky, setSticky] = useState(false)
  const stickyRef = useRef(false) // 이벤트 핸들러에서만 쓰기 — sticky 진입 후 mouseup 중복 발사 차단

  useEffect(() => {
    const count = slots.length
    const aimAt = (e: MouseEvent) => nearestSlot(e.clientX - origin.x, e.clientY - origin.y, count, DEADZONE)
    const onMove = (e: MouseEvent) => setActive(aimAt(e))
    const onUp = (e: MouseEvent) => {
      if (stickyRef.current) return // sticky = 이미 떼진 상태 → 이후 선택은 클릭으로
      const a = aimAt(e)
      if (a != null && slots[a]) {
        onFire(slots[a].emoji)
        onClose()
      } else {
        stickyRef.current = true
        setSticky(true) // 중앙서 뗌 → 열린 채 유지
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('keydown', onKey)
    }
  }, [origin, slots, onFire, onClose])

  return (
    <div
      className="fixed inset-0 z-50 select-none"
      role="menu"
      aria-label={t('reaction.wheelLabel')}
      onContextMenu={(e) => e.preventDefault()} // 휠이 뷰포트를 덮으므로 우클릭-릴리즈의 네이티브 메뉴를 여기서 억제
    >
      {/* sticky 모드 바깥 클릭 → 닫기(press 모드는 document mouseup 이 처리) */}
      {sticky && <div className="absolute inset-0" onMouseDown={onClose} />}

      <div className="absolute" style={{ left: origin.x, top: origin.y }}>
        {/* 링 배경 + 중앙 허브(현재 조준 라벨) */}
        <div
          className="pointer-events-none absolute grid place-items-center rounded-full bg-stage-base/70 text-[11px] text-stage-text-muted backdrop-blur-sm"
          style={{ left: -RADIUS - CHIP / 2, top: -RADIUS - CHIP / 2, width: (RADIUS + CHIP / 2) * 2, height: (RADIUS + CHIP / 2) * 2 }}
        >
          <span className="translate-y-[1px]">{active != null && slots[active] ? slots[active].label : t('reaction.cancel')}</span>
        </div>

        {slots.map((s, i) => {
          const { x, y } = slotOffset(i, slots.length, RADIUS)
          const on = i === active
          return (
            <button
              key={s.id}
              role="menuitem"
              aria-label={s.label}
              onMouseEnter={() => setActive(i)}
              onClick={() => { onFire(s.emoji); onClose() }}
              className={`absolute grid place-items-center rounded-full border text-2xl transition-transform ${
                on
                  ? 'z-10 scale-125 border-fire-amber bg-fire-amber/25 shadow-lg'
                  : 'border-stage-border bg-stage-panel hover:scale-110'
              }`}
              style={{ left: x - CHIP / 2, top: y - CHIP / 2, width: CHIP, height: CHIP }}
            >
              <span aria-hidden>{s.emoji}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
