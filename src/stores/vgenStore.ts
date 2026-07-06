import { create } from 'zustand'
import type { VgenJob } from '@/types/vgen'
import type { VgenResolution } from '@/lib/fal'
import { triggerVgen, subscribeToVgenJob, fetchRecentJobs } from '@/lib/vgen'
import { useUserStore } from '@/stores/userStore'

// VGEN 생성 상태 슬라이스(slice1: 호스트 단일작성). 협업 LWW·히스토리 갤러리는 slice2.
// SSOT: docs/contracts/VgenPanel.md · docs/state-machines/Vgen.md
// 규칙: stores/index.ts barrel 금지(CLAUDE.md §12.3) — 직접 import.

interface VgenStore {
  isGenerating: boolean
  currentJob: VgenJob | null
  recentJobs: VgenJob[]
  error: string | null
  loadRecent: (roomId: string) => Promise<void>
  generate: (roomId: string, prompt: string, durationSec: number, resolution: VgenResolution, imageUrls?: string[]) => Promise<void>
  reset: () => void
}

// 현재 구독 해제 핸들(단일 활성 job 전제). 새 generate/reset 시 정리.
let unsub: (() => void) | null = null

export const useVgenStore = create<VgenStore>((set, get) => ({
  isGenerating: false,
  currentJob: null,
  recentJobs: [],
  error: null,

  loadRecent: async (roomId) => {
    const jobs = await fetchRecentJobs(roomId)
    set({ recentJobs: jobs })
  },

  generate: async (roomId, prompt, durationSec, resolution, imageUrls) => {
    const token = useUserStore.getState().session?.access_token
    if (!token) { set({ error: '로그인이 필요해요.' }); return }
    set({ isGenerating: true, error: null })
    try {
      const res = await triggerVgen(token, roomId, prompt, durationSec, resolution, { imageUrls })
      if (res.status === 'done') { // dedup 캐시 히트: 즉시 완료
        set({ isGenerating: false })
        await get().loadRecent(roomId)
        return
      }
      if (unsub) { unsub(); unsub = null }
      unsub = subscribeToVgenJob(res.job_id, (job) => {
        set({ currentJob: job })
        if (job.status === 'done' || job.status === 'failed') {
          set({ isGenerating: false, error: job.status === 'failed' ? '영상 생성에 실패했어요. 크레딧은 환불됐어요.' : null })
          void get().loadRecent(roomId)
          if (unsub) { unsub(); unsub = null }
        }
      })
    } catch (e) {
      set({ isGenerating: false, error: e instanceof Error ? e.message : '생성 요청 실패' })
    }
  },

  reset: () => {
    if (unsub) { unsub(); unsub = null }
    set({ isGenerating: false, currentJob: null, error: null })
  },
}))
