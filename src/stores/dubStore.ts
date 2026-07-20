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
  selectedSegmentId: number | null      // DUB-EDIT: 타임라인 사용자 선택(재생 파생과 분리 — 드래그 중 점프 방지)
  segmentAssignees: Record<number, string> // DUB-EDIT: segId→배정 배우 표시명(타임라인 색·이니셜) — DubPanel 이 파생 푸시
  editingBadge: { segmentId: number; name: string } | null // DUB-EDIT E3: "OO 편집 중" 배지(수신측 3s decay)
  bedUrls: string[]                     // S1: 배경 스템 서명 URL(기존 목소리 제거본) — 센터 베드·미리보기가 소비
  bedMode: 'original' | 'bed'           // S2 A/B 토글(각인 #1) — 로컬 취향(broadcast 없음). 유효 모드는 bedUrls 있어야 bed
  sourceAR: number | null               // S3: 소스 영상 가로/세로 비(loadedmetadata 실측) — 더빙 무대 AR fit 재료
  seekRequest: { ms: number; nonce: number } | null // F2: 좌패널→센터 텔레포트(nonce 로 동일 세그 재클릭 재발화)
  recordRequest: { trackId: string; nonce: number } | null // F8: 좌패널 [녹음]→DubRecorder 시작 브리지
  localMode: DubLocalMode | null
  screening: boolean                    // G9-P3 누적 시사회 — 호스트 토글, 전원 공유(room-authority dub_screening)
  myTurnRanges: Array<{ trackId: string; startMs: number; endMs: number }> // G9-P4 내 미제출 트랙 구간(배너·F8 좌패널 녹음 매칭)
  setActive: (s: { activeSessionId: string; status: string; segments: DubSegment[]; sourceUrl: string | null }) => void
  setCurrentSegment: (id: number | null) => void
  setSelectedSegment: (id: number | null) => void
  setSegmentAssignees: (a: Record<number, string>) => void
  setEditingBadge: (b: { segmentId: number; name: string } | null) => void
  setBedUrls: (urls: string[]) => void
  setBedMode: (m: 'original' | 'bed') => void
  setSourceAR: (ar: number | null) => void
  setSeekRequest: (r: { ms: number; nonce: number } | null) => void
  setRecordRequest: (r: { trackId: string; nonce: number } | null) => void
  setLocalMode: (m: DubLocalMode | null) => void
  setScreening: (on: boolean) => void
  setMyTurnRanges: (r: Array<{ trackId: string; startMs: number; endMs: number }>) => void
  clear: () => void
}

export const useDubStore = create<DubStore>((set) => ({
  activeSessionId: null,
  status: null,
  segments: [],
  sourceUrl: null,
  currentSegmentId: null,
  selectedSegmentId: null,
  segmentAssignees: {},
  editingBadge: null,
  bedUrls: [],
  bedMode: 'bed',
  sourceAR: null,
  seekRequest: null,
  recordRequest: null,
  localMode: null,
  screening: false,
  myTurnRanges: [],
  setActive: ({ activeSessionId, status, segments, sourceUrl }) =>
    set({ activeSessionId, status, segments, sourceUrl }),
  setCurrentSegment: (currentSegmentId) => set({ currentSegmentId }),
  setSelectedSegment: (selectedSegmentId) => set({ selectedSegmentId }),
  setSegmentAssignees: (segmentAssignees) => set({ segmentAssignees }),
  setEditingBadge: (editingBadge) => set({ editingBadge }),
  setBedUrls: (bedUrls) => set({ bedUrls }),
  setBedMode: (bedMode) => set({ bedMode }),
  setSourceAR: (sourceAR) => set({ sourceAR }),
  setSeekRequest: (seekRequest) => set({ seekRequest }),
  setRecordRequest: (recordRequest) => set({ recordRequest }),
  setLocalMode: (localMode) => set({ localMode }),
  setScreening: (screening) => set({ screening }),
  setMyTurnRanges: (myTurnRanges) => set({ myTurnRanges }),
  clear: () => set({ activeSessionId: null, status: null, segments: [], sourceUrl: null, currentSegmentId: null, selectedSegmentId: null, segmentAssignees: {}, editingBadge: null, bedUrls: [], bedMode: 'bed', sourceAR: null, seekRequest: null, recordRequest: null, localMode: null, screening: false, myTurnRanges: [] }),
}))
