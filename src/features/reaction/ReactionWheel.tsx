import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReactionStore } from '@/stores/reactionStore'
import { slotOffset, nearestSlot } from './reactionSlots'
import EmoteGlyph from './EmoteGlyph'

// 라디얼 리액션 휠. RoomPage 가 무대 우클릭(mousedown button 2)으로 origin 을 세팅해 마운트한다(열 때마다 새 마운트 = 상태 초기화).
// 상호작용: 홀드-드래그-릴리즈(파이메뉴 방식) — 조준 슬롯 위에서 떼면 발사, 중앙서 뗌/터치 롱프레스는 sticky(열린 채 → 탭·클릭 선택).
// 슬롯 세트는 reactionStore(커스터마이즈·N 가변)에서 읽는다. SSOT: docs/contracts/ReactionWheel.md
// P-5(2026-07-08): 터치 롱프레스(initialSticky)·숫자키 1~N 핫키는 RoomPage 쪽 배선. ponytail 잔여: 화면끝 클램프·2중링(12+).

const RADIUS = 92
const CHIP = 52
const DEADZONE = 34

interface Props {
  origin: { x: number; y: number } // RoomPage 가 열릴 때만 렌더 → 항상 유효
  initialSticky?: boolean // 터치 롱프레스 개화 — 릴리즈 발사 없이 처음부터 탭 선택 모드
  onFire: (emoji: string) => void
  onClose: () => void
  onEdit?: () => void // 슬롯 편집(로드아웃) — 우측패널 이모트카드 제거 후 편집 진입점을 휠로 이관(sticky 모드서 노출)
}

export default function ReactionWheel({ origin, initialSticky, onFire, onClose, onEdit }: Props) {
  const { t } = useTranslation()
  const slots = useReactionStore((s) => s.slots)
  const [active, setActive] = useState<number | null>(null)
  const activeRef = useRef<number | null>(null)
  useEffect(() => { activeRef.current = active }, [active]) // 키보드 Enter 가 최신 active 를 읽도록(렌더 중 ref 쓰기 금지)
  const [sticky, setSticky] = useState(initialSticky ?? false)
  const stickyRef = useRef(initialSticky ?? false) // 이벤트 핸들러에서만 쓰기 — sticky 진입 후 mouseup 중복 발사 차단

  // 화면끝 클램프(ReactionWheel.md ponytail 해소): 가장자리에서 열어도 휠 전체가 뷰포트 안에 들도록 중심을 안쪽으로 민다.
  // 조준 계산도 같은 중심을 쓰므로 시각·입력이 어긋나지 않는다.
  const M = RADIUS + CHIP
  const clampAxis = (v: number, max: number) => (max < 2 * M ? max / 2 : Math.min(Math.max(v, M), max - M))
  const cx = clampAxis(origin.x, window.innerWidth)
  const cy = clampAxis(origin.y, window.innerHeight)

  useEffect(() => {
    const count = slots.length
    const aimAt = (e: MouseEvent) => nearestSlot(e.clientX - cx, e.clientY - cy, count, DEADZONE)
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      const n = slots.length
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault(); setActive((a) => ((a ?? -1) + 1 + n) % n)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault(); setActive((a) => ((a ?? 0) - 1 + n) % n)
      } else if (e.key === 'Enter' || e.key === ' ') {
        const a = activeRef.current
        if (a != null && slots[a]) { e.preventDefault(); onFire(slots[a].emoji); onClose() }
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('keydown', onKey)
    }
  }, [cx, cy, slots, onFire, onClose])

  return (
    <div
      className="fixed inset-0 z-50 select-none"
      role="menu"
      aria-label={t('reaction.wheelLabel')}
      onContextMenu={(e) => e.preventDefault()} // 휠이 뷰포트를 덮으므로 우클릭-릴리즈의 네이티브 메뉴를 여기서 억제
    >
      {/* sticky 모드 바깥 클릭 → 닫기(press 모드는 document mouseup 이 처리) */}
      {sticky && <div className="absolute inset-0" onMouseDown={onClose} />}

      <div className="absolute" style={{ left: cx, top: cy }}>
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
              <EmoteGlyph id={s.id} emoji={s.emoji} size={30} />
            </button>
          )
        })}

        {/* 편집 진입점(로드아웃) — 우측패널 이모트카드 삭제 후 휠로 이관. sticky(중앙서 뗌·터치 롱프레스) 시 노출. */}
        {onEdit && sticky && (
          <button
            onClick={() => { onClose(); onEdit() }}
            aria-label={t('reaction.editLoadout')}
            title={t('reaction.editLoadout')}
            className="absolute grid place-items-center rounded-full border border-stage-border bg-stage-panel text-sm hover:border-fire-amber"
            style={{ left: -16, top: RADIUS + 10, width: 32, height: 32 }}
          >
            ✏️
          </button>
        )}
      </div>
    </div>
  )
}
