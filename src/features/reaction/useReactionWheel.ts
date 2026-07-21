import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { useReactionStore } from '@/stores/reactionStore'

// 리액션 휠 상호작용(R-커밋 허브에서 분리, 2026-07-21 NR) — 우클릭·롱프레스(≥500ms) 개화 +
// 숫자키 1~N 즉발(P-5) + DEV E2E 주입 훅. sendReaction/connected 만 주입받아 자족한다.
export function useReactionWheel({ sendReaction, connected }: { sendReaction: (emoji: string) => void; connected: boolean }) {
  const [reactionOrigin, setReactionOrigin] = useState<{ x: number; y: number } | null>(null)
  const [reactionSticky, setReactionSticky] = useState(false) // 터치 개화는 sticky(탭 선택) 모드로 시작
  const openReactionWheel = useCallback((e: MouseEvent) => {
    if (e.button !== 2) return
    e.preventDefault()
    setReactionSticky(false)
    setReactionOrigin({ x: e.clientX, y: e.clientY })
  }, [])
  const closeReactionWheel = useCallback(() => setReactionOrigin(null), [])

  // 터치 롱프레스(≥500ms) → 휠 sticky 개화(P-5 — 우클릭의 모바일 등가). 10px 이동 = 스크롤 의도 → 취소.
  const touchTimer = useRef<number | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const touchFired = useRef(false)
  const cancelStageTouch = useCallback(() => {
    if (touchTimer.current != null) { clearTimeout(touchTimer.current); touchTimer.current = null }
  }, [])
  const onStageTouchStart = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length !== 1) return
    const t0 = e.touches[0]
    touchStart.current = { x: t0.clientX, y: t0.clientY }
    touchFired.current = false
    touchTimer.current = window.setTimeout(() => {
      touchTimer.current = null
      touchFired.current = true
      setReactionSticky(true)
      setReactionOrigin(touchStart.current)
    }, 500)
  }, [])
  const onStageTouchMove = useCallback((e: ReactTouchEvent) => {
    const s = touchStart.current
    if (!s || touchTimer.current == null) return
    const t0 = e.touches[0]
    if (Math.hypot(t0.clientX - s.x, t0.clientY - s.y) > 10) cancelStageTouch()
  }, [cancelStageTouch])
  const onStageTouchEnd = useCallback((e: ReactTouchEvent) => {
    cancelStageTouch()
    // 개화 직후의 합성 마우스 이벤트 억제 — 없으면 mousedown 이 sticky 백드롭을 즉시 닫는다.
    if (touchFired.current) e.preventDefault()
  }, [cancelStageTouch])

  // 숫자키 1~N 핫키(P-5): 입력 필드 밖에서 숫자키 → 해당 슬롯 리액션 즉발(휠 안 거침).
  useEffect(() => {
    if (!connected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return
      const n = Number(e.key)
      if (!Number.isInteger(n) || n < 1 || n > 9) return
      const slots = useReactionStore.getState().slots
      if (n <= slots.length) sendReaction(slots[n - 1].emoji)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [connected, sendReaction])

  // dev 전용: 헤드리스 E2E 에서 리액션 DataChannel 왕복을 검증하는 주입 훅(SelfAvatar.__room 패턴과 동형).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __reactionE2E?: { send: (e: string) => void; floats: () => unknown[] } }
    w.__reactionE2E = { send: sendReaction, floats: () => useReactionStore.getState().floats }
    return () => { delete w.__reactionE2E }
  }, [sendReaction])

  return {
    reactionOrigin,
    reactionSticky,
    openReactionWheel,
    closeReactionWheel,
    onStageTouchStart,
    onStageTouchMove,
    onStageTouchEnd,
    cancelStageTouch,
  }
}
