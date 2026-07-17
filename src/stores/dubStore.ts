import { create } from 'zustand'
import type { DubSegment } from '@/lib/dub'

// 더빙 상태의 3패널 공유 진실 — DubPanel(오른쪽)이 쓰고 MainView(센터)·DubScriptPanel(왼쪽)이 읽는다.
// 배경(DUB-UX): stageStore.mode='dub' 는 오른쪽 탭만 구독해 더빙이 오른쪽 패널에 고립됐다 → 센터 영상·
//   좌패널 대본이 이 store 로 더빙에 반응한다. 세션은 DB(fetchActiveDubSession)가 진실, 여긴 파생 캐시.
// stores/index.ts barrel 금지(CLAUDE.md §12.3) — 직접 import.
interface DubStore {
  activeSessionId: string | null
  status: string | null                 // dub_sessions.status (uploaded…completed)
  segments: DubSegment[]                 // 대사 세그먼트(원문+번역)
  sourceUrl: string | null              // getDubSourceUrl 서명 URL — 센터 영상 소스
  currentSegmentId: number | null       // 센터 영상 재생 위치가 가리키는 세그먼트(좌패널 하이라이트)
  setActive: (s: { activeSessionId: string; status: string; segments: DubSegment[]; sourceUrl: string | null }) => void
  setCurrentSegment: (id: number | null) => void
  clear: () => void
}

export const useDubStore = create<DubStore>((set) => ({
  activeSessionId: null,
  status: null,
  segments: [],
  sourceUrl: null,
  currentSegmentId: null,
  setActive: ({ activeSessionId, status, segments, sourceUrl }) =>
    set({ activeSessionId, status, segments, sourceUrl }),
  setCurrentSegment: (currentSegmentId) => set({ currentSegmentId }),
  clear: () => set({ activeSessionId: null, status: null, segments: [], sourceUrl: null, currentSegmentId: null }),
}))
