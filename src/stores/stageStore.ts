import { create } from 'zustand'

// 무대 센터(메인 뷰) 공유 상태. VGEN 공유재생(VGEN-04): 호스트가 방송한 영상을 전원이 같은 MainView 로 본다.
// SSOT: docs/contracts/MainViewComponent.md · state-machines/Vgen.md
// ponytail: mode enum(normal/vgen/dub)·배경교체·서명URL 재발급은 후속 — 지금은 "공유 영상 URL 유무"가 곧 상태.
// stores/index.ts barrel 금지(CLAUDE.md §12.3) — 직접 import.
interface StageStore {
  mainVideoUrl: string | null      // 재생 중인 공유 영상 서명 URL(뷰어별 자체 발급). null = 센터 비어있음
  mainVideoJobId: string | null    // 현재 공유 중인 vgen_jobs.id (재발급·중복 방송 판별용)
  backgroundUrl: string | null     // 무대 배경(HOST-04·05, ROOM-09). null = 기본(배경 없음). room-authority bg_change·입장 초기로드가 세팅
  setMainVideo: (url: string, jobId: string) => void
  clearMainVideo: () => void
  setBackground: (url: string | null) => void
}

export const useStageStore = create<StageStore>((set) => ({
  mainVideoUrl: null,
  mainVideoJobId: null,
  backgroundUrl: null,
  setMainVideo: (mainVideoUrl, mainVideoJobId) => set({ mainVideoUrl, mainVideoJobId }),
  clearMainVideo: () => set({ mainVideoUrl: null, mainVideoJobId: null }),
  setBackground: (backgroundUrl) => set({ backgroundUrl }),
}))
