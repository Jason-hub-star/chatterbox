import { create } from 'zustand'

// 무대 센터(메인 뷰) 공유 상태. VGEN 공유재생(VGEN-04): 호스트가 방송한 영상을 전원이 같은 MainView 로 본다.
// SSOT: docs/contracts/MainViewComponent.md · state-machines/Vgen.md
// ponytail: 배경교체·서명URL 재발급은 후속 — 지금은 "공유 영상 URL 유무"가 곧 상태.
// stores/index.ts barrel 금지(CLAUDE.md §12.3) — 직접 import.

// G-261 무대 진행 모드. 변경은 서버(set-room-mode) broadcast 수신(announceMode)으로만 —
// 호스트도 자기 broadcast echo 를 받아 반영(로컬 선반영 없음 = 계약 MUST NOT "broadcast 없이 로컬만 변경" 준수).
export type StageMode = 'normal' | 'vgen' | 'dub'

interface StageStore {
  mainVideoUrl: string | null      // 재생 중인 공유 영상 서명 URL(뷰어별 자체 발급). null = 센터 비어있음
  mainVideoJobId: string | null    // 현재 공유 중인 vgen_jobs.id (재발급·중복 방송 판별용)
  backgroundUrl: string | null     // 무대 배경(HOST-04·05, ROOM-09). null = 기본(배경 없음). room-authority bg_change·입장 초기로드가 세팅
  mode: StageMode                  // G-261 현재 진행 모드. RightPanel 탭 자동전환이 구독
  bannerMode: StageMode | null     // 표출 중 모드 배너(2.4s 자동 소멸 — store 가 타이머 소유, toastStore 패턴)
  setMainVideo: (url: string, jobId: string) => void
  clearMainVideo: () => void
  setBackground: (url: string | null) => void
  setMode: (mode: StageMode) => void       // 조용히(입장 복원·방 이탈 리셋 — 배너 없음)
  announceMode: (mode: StageMode) => void  // 값 + 배너 표출(mode_change broadcast 수신 경로)
}

let bannerTimer: ReturnType<typeof setTimeout> | null = null

export const useStageStore = create<StageStore>((set) => ({
  mainVideoUrl: null,
  mainVideoJobId: null,
  backgroundUrl: null,
  mode: 'normal',
  bannerMode: null,
  setMainVideo: (mainVideoUrl, mainVideoJobId) => set({ mainVideoUrl, mainVideoJobId }),
  clearMainVideo: () => set({ mainVideoUrl: null, mainVideoJobId: null }),
  setBackground: (backgroundUrl) => set({ backgroundUrl }),
  setMode: (mode) => set({ mode }),
  announceMode: (mode) => {
    set({ mode, bannerMode: mode })
    if (bannerTimer) clearTimeout(bannerTimer)
    bannerTimer = setTimeout(() => set({ bannerMode: null }), 2400)
  },
}))

// E2E 전용 DEV 훅(프로드 번들 제외 — __streamAvatar 관례): 2탭 rate 동기 하네스가 공유영상을 직접 주입.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__setMainVideo = (url: string) =>
    useStageStore.getState().setMainVideo(url, 'e2e')
}
