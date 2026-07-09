// 대극장 카드 스켈레톤 — 로딩 중 그리드 골격(무채, 레이아웃 시프트 방지). RoomCard 와 같은 치수.
export default function RoomCardSkeleton() {
  return (
    <div aria-hidden className="motion-safe:animate-pulse">
      <div className="aspect-[16/10] rounded-xl border border-stage-border bg-stage-panel" />
      <div className="mt-2.5 flex gap-2.5">
        <span className="mt-0.5 h-[34px] w-[34px] flex-none rounded-full bg-stage-elevated" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <div className="h-3 w-4/5 rounded bg-stage-elevated" />
          <div className="h-2.5 w-2/5 rounded bg-stage-elevated" />
        </div>
      </div>
    </div>
  )
}
