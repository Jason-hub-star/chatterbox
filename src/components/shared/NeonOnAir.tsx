// 입장 게이트 네온 간판 — "On Air" 방송 점등 컨셉(주인님 판정 2026-07-13: 시안 B 네온사인).
// 로딩 = 빨강(fire-hot) 지지직 점등, entering = 초록(spring-green) 전환. 형태는 여기,
// 모션(neon-flick·neon-die·neon-go)은 index.css 소유. 장식이라 aria-hidden(상태 문구는 게이트 소유).
export default function NeonOnAir({ entering = false }: { entering?: boolean }) {
  return (
    <div className={`neon-onair${entering ? ' neon-onair--on' : ''}`} aria-hidden="true">
      <span className="neon-onair-text">
        On A<span className="neon-onair-dim">i</span>r
      </span>
    </div>
  )
}
