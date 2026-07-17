import { create } from 'zustand'
import type { DubSegment } from '@/lib/dub'

// 더빙 상태의 3패널 공유 진실 — DubPanel(오른쪽)이 쓰고 MainView(센터)·DubScriptPanel(왼쪽)이 읽는다.
// 배경(DUB-UX): stageStore.mode='dub' 는 오른쪽 탭만 구독해 더빙이 오른쪽 패널에 고립됐다 → 센터 영상·
//   좌패널 대본이 이 store 로 더빙에 반응한다. 세션은 DB(fetchActiveDubSession)가 진실, 여긴 파생 캐시.
// stores/index.ts barrel 금지(CLAUDE.md §12.3) — 직접 import.
// G9-P2 녹음 로컬모드: 녹음/직후 미리보기 동안 내 화면의 센터 영상만 구간 재생(vodSync 일시 해제).
// DubRecorder 가 쓰고 MainView 가 진입·복귀·오디오 스케줄을 수행. audioUrl 은 preview 에서만(objectURL).
export interface DubLocalMode {
  kind: 'record' | 'preview'
  startMs: number
  endMs: number
  audioUrl: string | null
  calMs?: number // G9-P4 ±200ms 캘리브레이션 — preview 재생에 반영(제출 시 합성에도 동일 적용)
}

interface DubStore {
  activeSessionId: string | null
  status: string | null                 // dub_sessions.status (uploaded…completed)
  segments: DubSegment[]                 // 대사 세그먼트(원문+번역)
  sourceUrl: string | null              // getDubSourceUrl 서명 URL — 센터 영상 소스
  currentSegmentId: number | null       // 센터 영상 재생 위치가 가리키는 세그먼트(좌패널 하이라이트)
  localMode: DubLocalMode | null
  screening: boolean                    // G9-P3 누적 시사회 — 호스트 토글, 전원 공유(room-authority dub_screening)
  myTurnRanges: Array<{ startMs: number; endMs: number }> // G9-P4 내 미제출 트랙 구간(센터 "내 차례" 배너)
  setActive: (s: { activeSessionId: string; status: string; segments: DubSegment[]; sourceUrl: string | null }) => void
  setCurrentSegment: (id: number | null) => void
  setLocalMode: (m: DubLocalMode | null) => void
  setScreening: (on: boolean) => void
  setMyTurnRanges: (r: Array<{ startMs: number; endMs: number }>) => void
  clear: () => void
}

export const useDubStore = create<DubStore>((set) => ({
  activeSessionId: null,
  status: null,
  segments: [],
  sourceUrl: null,
  currentSegmentId: null,
  localMode: null,
  screening: false,
  myTurnRanges: [],
  setActive: ({ activeSessionId, status, segments, sourceUrl }) =>
    set({ activeSessionId, status, segments, sourceUrl }),
  setCurrentSegment: (currentSegmentId) => set({ currentSegmentId }),
  setLocalMode: (localMode) => set({ localMode }),
  setScreening: (screening) => set({ screening }),
  setMyTurnRanges: (myTurnRanges) => set({ myTurnRanges }),
  clear: () => set({ activeSessionId: null, status: null, segments: [], sourceUrl: null, currentSegmentId: null, localMode: null, screening: false, myTurnRanges: [] }),
}))
