// 호스트 좌석 배지(§6.4) — 원형 아바타 상단 중앙에 얹는 앰버 크라운. 장식(aria-hidden) — 좌석 이름이 실라벨.
// Self/Remote 두 아바타가 공유(중복 SVG 방지). fire-amber = 액센트 전용 토큰.
export default function HostCrown() {
  return (
    <span
      className="absolute -top-1.5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-stage-elevated p-0.5 shadow"
      aria-hidden
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="#FF8C2A" aria-hidden>
        <path d="M4 9l4 3 4-6 4 6 4-3-1.5 8h-13L4 9z" />
      </svg>
    </span>
  )
}
