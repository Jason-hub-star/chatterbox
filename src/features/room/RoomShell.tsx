import type { ReactNode } from 'react'

// 룸 3존 셸(리디자인 · 뷰 백지) — 상단바 / [좌도크 · 무대 · 우도크] / 하단 컨트롤바.
// 프레젠테이션 전용: 존 콘텐츠는 RoomPage(로직 허브)가 주입한다. 엔진(hook/store/Edge/rig)은 안 건드림.
// 반응형(DoD): lg↑ 3열 도크, 미만은 단일 열 스택(무대 우선) — 360px 가로 오버플로 0.
interface Props {
  topBar: ReactNode
  leftDock: ReactNode
  stage: ReactNode
  rightDock: ReactNode
  bottomBar: ReactNode
}

export default function RoomShell({ topBar, leftDock, stage, rightDock, bottomBar }: Props) {
  return (
    <div className="grid h-[100dvh] grid-rows-[auto_1fr_auto] bg-stage-base text-stage-text">
      <header className="border-b border-stage-border">{topBar}</header>
      <div className="grid min-h-0 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[clamp(240px,20vw,280px)_1fr_300px] lg:overflow-hidden">
        <aside className="order-2 min-h-0 overflow-y-auto lg:order-1">{leftDock}</aside>
        <section className="order-1 grid min-h-0 place-items-center overflow-y-auto lg:order-2">{stage}</section>
        <aside className="order-3 min-h-0 overflow-y-auto">{rightDock}</aside>
      </div>
      <footer className="border-t border-stage-border">{bottomBar}</footer>
    </div>
  )
}
