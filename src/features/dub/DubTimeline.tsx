import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useDubStore } from '@/stores/dubStore'
import { useUserStore } from '@/stores/userStore'
import { editDubSegment, type DubSegment } from '@/lib/dub'
import { toast } from '@/hooks/useToast'

// DUB-EDIT: 센터 세그먼트 타임라인 — MainView 더빙 분기 flex 스택의 하단 행.
// E1 읽기(블록·플레이헤드·클릭 시크+선택) + E3 호스트 편집(양끝 핸들 드래그 retime·삭제·편집중 배지).
// 오버레이가 아니라 명시 높이 행이라 자막(bottom-10)·배지·네이티브 컨트롤과 충돌 0(구조 감사 반영).
// 블록 = 시간폭 비례(% 배치 = 자동 fit·360px 안전). 플레이헤드는 rAF 로 DOM 직접 이동(리렌더 0).
// 드래그 낙관 반영은 세그먼트 배열 "정체성"에 귀속 — Realtime 갱신으로 배열이 바뀌면 자동 무효
// (set-state-in-effect 없이 스냅백/충돌 해소, MainView endedFor 패턴 동형). 편집 잠금은 서버(ready 409).

const PALETTE = ['bg-sky-500/70', 'bg-rose-500/70', 'bg-emerald-500/70', 'bg-violet-500/70', 'bg-amber-500/70', 'bg-teal-500/70']
const colorFor = (name: string) =>
  PALETTE[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % PALETTE.length]

const MIN_SEG_MS = 500 // 서버(edit-dub-segment) 검증과 동일

interface DragState { segId: number; startMs: number; endMs: number; forSegments: DubSegment[] }

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  durationMs: number
  isHost: boolean
  onDubEdit?: (segmentId: number) => void
}

export default function DubTimeline({ videoRef, durationMs, isHost, onDubEdit }: Props) {
  const { t } = useTranslation()
  const token = useUserStore((s) => s.session?.access_token)
  const sessionId = useDubStore((s) => s.activeSessionId)
  const segments = useDubStore((s) => s.segments)
  const currentSegmentId = useDubStore((s) => s.currentSegmentId)
  const selectedSegmentId = useDubStore((s) => s.selectedSegmentId)
  const assignees = useDubStore((s) => s.segmentAssignees)
  const segStatus = useDubStore((s) => s.segmentStatus) // U3: 미녹음=반투명 점선 / 제출=채움 / 확정=✓
  const editingBadge = useDubStore((s) => s.editingBadge)
  const playheadRef = useRef<HTMLDivElement | null>(null)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  // v1.1 줌(주인님 실사용 피드백 "너무 촘촘") — 캡컷식: 확대하면 스트립이 뷰포트보다 넓어지고
  // 가로 스크롤 + 재생 중 플레이헤드 자동 추적. 1=전체 fit … 16.
  const [zoom, setZoom] = useState(1)
  const lastCastRef = useRef(0)
  // F7 a11y: 키보드 retime 커밋 디바운스(키 반복 연타 → 서버 호출 1회로 수렴)
  const keyTimerRef = useRef<number | null>(null)
  const keyPendingRef = useRef<{ segId: number; startMs: number; endMs: number } | null>(null)

  // 플레이헤드: rAF 로 left % 직접 갱신 — timeupdate(4Hz)보다 부드럽고 React 리렌더 0.
  // 줌 상태에선 재생 중 플레이헤드가 화면 밖으로 나가면 중앙으로 따라간다(캡컷 follow).
  useEffect(() => {
    if (durationMs <= 0) return
    let raf = requestAnimationFrame(function tick() {
      raf = requestAnimationFrame(tick)
      const v = videoRef.current
      const el = playheadRef.current
      const strip = stripRef.current
      if (!v || !el) return
      const frac = Math.min(1, (v.currentTime * 1000) / durationMs)
      el.style.left = `${frac * 100}%`
      const sc = scrollRef.current
      if (sc && strip && !v.paused) {
        const headPx = frac * strip.clientWidth
        if (headPx < sc.scrollLeft + 40 || headPx > sc.scrollLeft + sc.clientWidth - 40) {
          sc.scrollLeft = headPx - sc.clientWidth / 2
        }
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [videoRef, durationMs])

  // 줌 변경: 플레이헤드 위치를 화면 중앙에 유지(캡컷 동작) — 커밋 직후 rAF 로 스크롤 보정.
  const applyZoom = (next: number) => {
    const z = Math.min(16, Math.max(1, next))
    setZoom(z)
    requestAnimationFrame(() => {
      const sc = scrollRef.current
      const v = videoRef.current
      if (!sc || !v || durationMs <= 0) return
      const frac = Math.min(1, (v.currentTime * 1000) / durationMs)
      sc.scrollLeft = frac * sc.scrollWidth - sc.clientWidth / 2
    })
  }

  if (durationMs <= 0 || segments.length === 0) return null

  // Realtime 갱신(배열 교체) 시 낙관 드래그 자동 무효 — 최신 서버 진실이 이김(LWW).
  const activeDrag = drag && drag.forSegments === segments ? drag : null
  const selectedSeg = segments.find((s) => s.id === selectedSegmentId) ?? null

  const beginDrag = (e: React.PointerEvent, seg: DubSegment, side: 'start' | 'end') => {
    e.preventDefault()
    e.stopPropagation()
    const strip = stripRef.current
    if (!strip || !token || !sessionId) return
    const msPerPx = durationMs / strip.clientWidth
    const originX = e.clientX
    const compute = (clientX: number) => {
      const delta = (clientX - originX) * msPerPx
      return side === 'start'
        ? { startMs: Math.round(Math.min(Math.max(0, seg.start_ms + delta), seg.end_ms - MIN_SEG_MS)), endMs: seg.end_ms }
        : { startMs: seg.start_ms, endMs: Math.round(Math.max(seg.start_ms + MIN_SEG_MS, Math.min(durationMs, seg.end_ms + delta))) }
    }
    const onMove = (ev: PointerEvent) => {
      setDrag({ segId: seg.id, ...compute(ev.clientX), forSegments: segments })
      const now = performance.now()
      if (now - lastCastRef.current > 200) { lastCastRef.current = now; onDubEdit?.(seg.id) } // 편집중 배지(스로틀)
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const fin = compute(ev.clientX)
      if (fin.startMs === seg.start_ms && fin.endMs === seg.end_ms) { setDrag(null); return }
      setDrag({ segId: seg.id, ...fin, forSegments: segments }) // 커밋 표시 유지 → Realtime 갱신이 수렴/무효화
      editDubSegment(token, sessionId, 'retime', seg.id, fin.startMs, fin.endMs)
        .catch(() => { toast.error(t('dub.editFailed')); setDrag(null) })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // F7 DUB-A11Y-M: 키보드 retime — ←/→ = 끝점 ±100ms · Shift+←/→ = 시작점(핸들 드래그의 키보드 대안).
  // 낙관 반영은 drag 정체성 트릭 동형 · 커밋은 300ms 디바운스(키 반복이 요청 폭주가 되지 않게).
  const KEY_STEP_MS = 100
  const retimeBy = (seg: DubSegment, side: 'start' | 'end', delta: number) => {
    if (!token || !sessionId) return
    const base = activeDrag?.segId === seg.id
      ? { start: activeDrag.startMs, end: activeDrag.endMs }
      : { start: seg.start_ms, end: seg.end_ms }
    const startMs = side === 'start'
      ? Math.round(Math.min(Math.max(0, base.start + delta), base.end - MIN_SEG_MS)) : base.start
    const endMs = side === 'end'
      ? Math.round(Math.max(base.start + MIN_SEG_MS, Math.min(durationMs, base.end + delta))) : base.end
    if (startMs === base.start && endMs === base.end) return
    setDrag({ segId: seg.id, startMs, endMs, forSegments: segments })
    keyPendingRef.current = { segId: seg.id, startMs, endMs }
    if (keyTimerRef.current !== null) window.clearTimeout(keyTimerRef.current)
    keyTimerRef.current = window.setTimeout(() => {
      const p = keyPendingRef.current
      keyPendingRef.current = null
      if (!p) return
      editDubSegment(token, sessionId, 'retime', p.segId, p.startMs, p.endMs)
        .catch(() => { toast.error(t('dub.editFailed')); setDrag(null) })
    }, 300)
    const now = performance.now()
    if (now - lastCastRef.current > 200) { lastCastRef.current = now; onDubEdit?.(seg.id) }
  }

  const deleteSelected = () => {
    if (!token || !sessionId || !selectedSeg) return
    editDubSegment(token, sessionId, 'delete', selectedSeg.id)
      .then(() => useDubStore.getState().setSelectedSegment(null))
      .catch(() => toast.error(t('dub.editFailed')))
  }

  const badgeSeg = editingBadge ? segments.find((s) => s.id === editingBadge.segmentId) ?? null : null

  return (
    <div className="relative shrink-0 border-t border-stage-border bg-stage-base/90">
      {/* 줌 스크롤 컨테이너 — 내부 스트립 폭 = zoom×100% (% 배치 그대로 확장, 캡컷식) */}
      <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden">
        <div ref={stripRef} className="relative h-14 sm:h-16" style={{ width: `${zoom * 100}%`, minWidth: '100%' }} aria-label={t('dub.timelineLabel')}>
          {segments.map((seg) => {
            const dragged = activeDrag?.segId === seg.id
            const startMs = dragged ? activeDrag.startMs : seg.start_ms
            const endMs = dragged ? activeDrag.endMs : seg.end_ms
            const left = (startMs / durationMs) * 100
            const width = Math.max(0.4, ((endMs - startMs) / durationMs) * 100)
            const name = assignees[seg.id]
            const st = segStatus[seg.id]
            const recorded = st === 'submitted' || st === 'synced' // U3: 녹음물 존재 = 채움
            const selected = seg.id === selectedSegmentId
            const playing = seg.id === currentSegmentId
            return (
              <button
                key={seg.id}
                data-dub-seg-status={st ?? 'none'}
                onClick={() => {
                  const v = videoRef.current
                  if (v) v.currentTime = seg.start_ms / 1000
                  useDubStore.getState().setSelectedSegment(seg.id)
                }}
                aria-label={`${t('dub.timelineSegLabel')} ${seg.id}${name ? ` · ${name}` : ''}`}
                aria-pressed={selected}
                onKeyDown={(e) => {
                  if (!isHost || !selected) return
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                  e.preventDefault()
                  retimeBy(seg, e.shiftKey ? 'start' : 'end', e.key === 'ArrowLeft' ? -KEY_STEP_MS : KEY_STEP_MS)
                }}
                title={`${(startMs / 1000).toFixed(1)}s · ${seg.translated_text || seg.text}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                className={`absolute inset-y-2 overflow-hidden whitespace-nowrap rounded border px-0.5 text-left text-[9px] leading-none text-white/90
                  ${name ? colorFor(name) : 'bg-stage-border/60'}
                  ${recorded ? '' : 'border-dashed opacity-50'}
                  ${selected ? 'z-10 border-fire-amber ring-1 ring-fire-amber' : recorded ? 'border-black/30' : 'border-white/40'}
                  ${playing ? 'brightness-125' : 'hover:brightness-110'}`}
              >
                {st === 'synced' && <span aria-hidden className="mr-0.5 text-emerald-300">✓</span>}
                {name ? name.slice(0, 2) : ''}
                {/* 확대돼 블록이 넓어지면 대사 미리보기(캡컷 클립 내용 표시) */}
                {width * zoom > 8 && <span className="ml-1 opacity-80">{(seg.translated_text || seg.text).slice(0, 30)}</span>}
                {/* E3: 선택된 블록에만 양끝 트림 핸들(호스트) — 버튼 안 span 이라 클릭(시크)과 분리 */}
                {isHost && selected && (
                  <>
                    <span onPointerDown={(e) => beginDrag(e, seg, 'start')} className="touch-handle absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/60" aria-hidden />
                    <span onPointerDown={(e) => beginDrag(e, seg, 'end')} className="touch-handle absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/60" aria-hidden />
                  </>
                )}
              </button>
            )
          })}
          {/* E3: 편집중 배지(다른 멤버 화면) — 해당 블록 위 닉네임 칩, RoomPage 3s decay */}
          {badgeSeg && (
            <span
              className="pointer-events-none absolute top-0.5 z-20 max-w-24 truncate rounded bg-fire-amber px-1 text-[9px] font-semibold text-stage-base"
              style={{ left: `${(badgeSeg.start_ms / durationMs) * 100}%` }}
              role="status"
            >
              ✎ {editingBadge!.name}
            </span>
          )}
          <div ref={playheadRef} className="pointer-events-none absolute inset-y-0 z-10 w-px bg-fire-amber" style={{ left: '0%' }} aria-hidden />
        </div>
      </div>
      {/* 고정 컨트롤(스크롤 비추종): 줌 −/맞춤/+ · 선택 시 삭제 — aria-label 스트립 밖이라 블록 카운트 불오염 */}
      <div className="absolute right-1 top-0.5 z-20 flex items-center gap-1">
        {isHost && selectedSeg && (
          <button
            onClick={deleteSelected}
            aria-label={t('dub.deleteSegLabel')}
            title={t('dub.deleteSegLabel')}
            className="touch-target rounded bg-stage-base/80 px-1.5 text-[11px] text-fire-hot hover:bg-stage-border/60"
          >
            ✕
          </button>
        )}
        <button onClick={() => applyZoom(zoom / 1.5)} disabled={zoom <= 1} aria-label={t('dub.zoomOut')} title={t('dub.zoomOut')}
          className="touch-target rounded bg-stage-base/80 px-1.5 text-[11px] text-stage-text hover:text-fire-amber disabled:opacity-40">−</button>
        <button onClick={() => applyZoom(1)} disabled={zoom <= 1} aria-label={t('dub.zoomFit')} title={t('dub.zoomFit')}
          className="touch-target rounded bg-stage-base/80 px-1.5 text-[10px] text-stage-text hover:text-fire-amber disabled:opacity-40">{t('dub.zoomFitShort')}</button>
        <button onClick={() => applyZoom(zoom * 1.5)} disabled={zoom >= 16} aria-label={t('dub.zoomIn')} title={t('dub.zoomIn')}
          className="touch-target rounded bg-stage-base/80 px-1.5 text-[11px] text-stage-text hover:text-fire-amber disabled:opacity-40">＋</button>
      </div>
    </div>
  )
}
