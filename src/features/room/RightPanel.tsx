import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useRightPanelStore } from '@/stores/rightPanelStore'

// RightPanel — 우측 사이드바의 "탭 셸". 계약: contracts/RightPanel.md.
// 설계: 탭 콘텐츠를 직접 import하지 않고 주입(inject)받는다. RoomPage가 LiveKit 훅(sendChat 등)을
//   쥐고 있으므로 탭 렌더러를 배열로 넘겨받아, 패널을 "갈아끼우는 블록"으로 만든다.
// MVP 범위: chat·dub·vgen 3탭. notes(ROOM-17)·사운드보드·mode 자동전환은 미빌드 기능 → defer(계약 §구현 현황).
export interface RightPanelTab {
  id: string
  label: string
  render: () => ReactNode
}

export default function RightPanel({ tabs }: { tabs: RightPanelTab[] }) {
  const { t } = useTranslation()
  const activeTab = useRightPanelStore((s) => s.activeTab)
  const setActiveTab = useRightPanelStore((s) => s.setActiveTab)
  // 순수 파생: store 값이 탭 목록에 없으면 첫 탭으로 폴백(effect 없이).
  const current = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]
  if (!current) return null

  return (
    <aside
      className="flex max-h-[75vh] flex-col rounded-lg border border-stage-border lg:max-h-[calc(100vh-8rem)]"
      aria-label={t('room.sidePanel')}
    >
      <div role="tablist" aria-label={t('room.sidePanel')} className="flex border-b border-stage-border">
        {tabs.map((tab) => {
          const selected = tab.id === current.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-2 text-sm font-semibold ${
                selected
                  ? 'border-b-2 border-fire-amber text-stage-text'
                  : 'text-stage-text-muted hover:text-stage-text'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* 비활성 탭도 언마운트하지 않음(hidden) — 녹음·생성 중 탭 전환에도 작업 유지(RightPanel.md MUST NOT). */}
      <div className="flex-1 overflow-y-auto p-3">
        {tabs.map((tab) => (
          <div key={tab.id} role="tabpanel" hidden={tab.id !== current.id} className="h-full">
            {tab.render()}
          </div>
        ))}
      </div>
    </aside>
  )
}
