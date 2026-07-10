import type { ReactNode } from 'react'

interface Props {
  col: number
  row: number
  // active-speaker: 지금 말하는 참가자를 앞으로(z↑·확대·amber glow) — DESIGN-DIRECTION §6.4 "연기 중 슬롯".
  speaking?: boolean
  children: ReactNode
}

// 무대 1석: 3×3 그리드 위치에 배치하고, 말하는 사람이면 앞 레이어로 강조한다.
// 좌석 콘텐츠(SelfAvatar·RemoteAvatar·빈자리)는 상위(Stage)가 넣는다 — 배치 책임만 여기 둔다.
export default function StageSlot({ col, row, speaking = false, children }: Props) {
  return (
    <div
      style={{ gridColumn: col, gridRow: row }}
      data-speaking={speaking ? 'true' : 'false'}
      className={`flex flex-col items-center justify-center gap-1 rounded-xl p-1 transition-all motion-reduce:transition-none ${
        speaking
          ? 'z-10 scale-105 shadow-[0_0_22px_rgba(255,140,42,0.55)]'
          : 'z-0'
      }`}
    >
      {children}
    </div>
  )
}
