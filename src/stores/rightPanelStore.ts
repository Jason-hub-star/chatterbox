import { create } from 'zustand'

// RightPanel(우측 사이드바) UI 상태. 계약: contracts/RightPanel.md.
// activeTab 은 탭 id 문자열(주입식 탭 셸이라 유니온 대신 string) — 셸이 목록에 없으면 첫 탭으로 폴백.
// 순수 상태 컨테이너 — 컴포넌트/SDK를 import하지 않아 단위 테스트 가능(roomStore·trackingStore 동일 패턴).
interface RightPanelStore {
  activeTab: string
  isOpen: boolean
  setActiveTab: (tab: string) => void
  setIsOpen: (open: boolean) => void
  toggle: () => void
}

const INITIAL = {
  activeTab: '', // 빈 값 = "아직 미선택" → RightPanel 이 첫 탭으로 파생(set-state-in-effect 회피)
  isOpen: true,
}

export const useRightPanelStore = create<RightPanelStore>((set) => ({
  ...INITIAL,
  setActiveTab: (activeTab) => set({ activeTab }),
  setIsOpen: (isOpen) => set({ isOpen }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}))
