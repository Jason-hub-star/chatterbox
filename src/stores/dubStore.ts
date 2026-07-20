import { create } from 'zustand'
import type { DubSegment } from '@/lib/dub'

// 더빙 상태의 3패널 공유 진실 — DubPanel(오른쪽)이 쓰고 MainView(센터)·DubScriptPanel(왼쪽)이 읽는다.
// 배경(DUB-UX): stageStore.mode='dub' 는 오른쪽 탭만 구독해 더빙이 오른쪽 패널에 고립됐다 → 센터 영상·
//   좌패널 대본이 이 store 로 더빙에 반응한다. 세션은 DB(fetchActiveDubSession)가 진실, 여긴 파생 캐시.
// stores/index.ts barrel 금지(CLAUDE.md §12.3) — 직접 import.
// G9-P2 녹음 로컬모드: 녹음/직후 미리보기 동안 내 화면의 센터 영상만 구간 재생(vodSync 일시 해제).
// DubRecorder 가 쓰고 MainView 가 진입·복귀·오디오 스케줄을 수행. audioUrl 은 preview 에서만(objectURL).
export interface DubRecEngine {
  start: (trackId: string) => void // 내 트랙만·녹음/busy 중 무시(엔진이 가드)
  stop: () => void
  replay: () => void
  submit: () => void
}

export interface DubLocalMode {
  kind: 'record' | 'preview'
  startMs: number
  endMs: number
  audioUrl: string | null
  calMs?: number // G9-P4 ±200ms 캘리브레이션 — preview 재생에 반영(제출 시 합성에도 동일 적용)
  preroll?: boolean // W3: 카운트다운 중(구간 시작 프레임 정지) — false/미설정이면 재생
}

interface DubStore {
  activeSessionId: string | null
  status: string | null                 // dub_sessions.status (uploaded…completed)
  segments: DubSegment[]                 // 대사 세그먼트(원문+번역)
  sourceUrl: string | null              // getDubSourceUrl 서명 URL — 센터 영상 소스
  currentSegmentId: number | null       // 센터 영상 재생 위치가 가리키는 세그먼트(좌패널 하이라이트)
  selectedSegmentId: number | null      // DUB-EDIT: 타임라인 사용자 선택(재생 파생과 분리 — 드래그 중 점프 방지)
  segmentAssignees: Record<number, string> // DUB-EDIT: segId→배정 배우 표시명(타임라인 색·이니셜) — DubPanel 이 파생 푸시
  segmentStatus: Record<number, 'assigned' | 'recording' | 'submitted' | 'synced'> // U3: segId→트랙 상태(타임라인/좌패널 "더빙됨" 시각화) — 동일 파생
  editingBadge: { segmentId: number; name: string } | null // DUB-EDIT E3: "OO 편집 중" 배지(수신측 3s decay)
  bedUrls: string[]                     // S1: 배경 스템 서명 URL(기존 목소리 제거본) — 센터 베드·미리보기가 소비
  bedMode: 'original' | 'bed'           // S2 A/B 토글(각인 #1) — 로컬 취향(broadcast 없음). 유효 모드는 bedUrls 있어야 bed
  sourceAR: number | null               // S3: 소스 영상 가로/세로 비(loadedmetadata 실측) — 더빙 무대 AR fit 재료
  seekRequest: { ms: number; nonce: number } | null // F2: 좌패널→센터 텔레포트(nonce 로 동일 세그 재클릭 재발화)
  // U1 PANEL-UNIFY-V2: 녹음 엔진 헤드리스 — DubRecorder(우패널·hidden 유지라 상시 마운트)가 렌더 상태를
  //   여기 올리고 액션을 recEngine 으로 등록 → 좌패널·센터 HUD 가 패널 무소속으로 조작(F8 nonce 브리지 대체).
  recTrackId: string | null             // 녹음 중 트랙 id (null=비녹음)
  recPreview: { trackId: string; url: string; durationMs: number } | null // 정지 후 미리보기(blob 은 엔진 ref)
  recBusy: boolean                      // 업로드/제출/확정 진행 중
  recCalMs: number                      // G9-P4 ±200ms 캘리브레이션(테이크마다 0 리셋)
  recMicStream: MediaStream | null      // 녹음 중 마이크(레벨미터 렌더용)
  recError: string | null
  recCountdown: number | null           // W3: 구간 진입 3‑2‑1 프리롤(null=카운트다운 없음)
  recLoop: boolean                      // W3: 녹음 중 구간 끝 도달 시 되돌아 반복(기본 ON — 타이밍 재시도)
  recEngine: DubRecEngine | null        // 마운트 시 등록·언마운트 시 null
  localMode: DubLocalMode | null
  screening: boolean                    // G9-P3 누적 시사회 — 호스트 토글, 전원 공유(room-authority dub_screening)
  // G9-P4→U4: 내 미확정(synced 제외) 트랙 구간 — 배너(미제출만)·좌패널 🎙(재녹음 포함) 매칭.
  // submitted 포함 이유: 호스트 확정 해제(RETAKE) 후 재녹음 진입점이 좌패널 🎙 뿐(우패널 행 제거됨).
  myTurnRanges: Array<{ trackId: string; startMs: number; endMs: number; submitted: boolean }>
  setActive: (s: { activeSessionId: string; status: string; segments: DubSegment[]; sourceUrl: string | null }) => void
  setCurrentSegment: (id: number | null) => void
  setSelectedSegment: (id: number | null) => void
  setSegmentAssignees: (a: Record<number, string>) => void
  setSegmentStatus: (s: Record<number, 'assigned' | 'recording' | 'submitted' | 'synced'>) => void
  setEditingBadge: (b: { segmentId: number; name: string } | null) => void
  setBedUrls: (urls: string[]) => void
  setBedMode: (m: 'original' | 'bed') => void
  setSourceAR: (ar: number | null) => void
  setSeekRequest: (r: { ms: number; nonce: number } | null) => void
  setRec: (p: Partial<Pick<DubStore, 'recTrackId' | 'recPreview' | 'recBusy' | 'recCalMs' | 'recMicStream' | 'recError' | 'recCountdown'>>) => void
  setRecLoop: (on: boolean) => void
  setRecEngine: (e: DubRecEngine | null) => void
  setLocalMode: (m: DubLocalMode | null) => void
  setScreening: (on: boolean) => void
  setMyTurnRanges: (r: Array<{ trackId: string; startMs: number; endMs: number; submitted: boolean }>) => void
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
  segmentStatus: {},
  editingBadge: null,
  bedUrls: [],
  bedMode: 'bed',
  sourceAR: null,
  seekRequest: null,
  recTrackId: null,
  recPreview: null,
  recBusy: false,
  recCalMs: 0,
  recMicStream: null,
  recError: null,
  recCountdown: null,
  recLoop: true,
  recEngine: null,
  localMode: null,
  screening: false,
  myTurnRanges: [],
  setActive: ({ activeSessionId, status, segments, sourceUrl }) =>
    set({ activeSessionId, status, segments, sourceUrl }),
  setCurrentSegment: (currentSegmentId) => set({ currentSegmentId }),
  setSelectedSegment: (selectedSegmentId) => set({ selectedSegmentId }),
  setSegmentAssignees: (segmentAssignees) => set({ segmentAssignees }),
  setSegmentStatus: (segmentStatus) => set({ segmentStatus }),
  setEditingBadge: (editingBadge) => set({ editingBadge }),
  setBedUrls: (bedUrls) => set({ bedUrls }),
  setBedMode: (bedMode) => set({ bedMode }),
  setSourceAR: (sourceAR) => set({ sourceAR }),
  setSeekRequest: (seekRequest) => set({ seekRequest }),
  setRec: (p) => set(p),
  setRecLoop: (recLoop) => set({ recLoop }),
  setRecEngine: (recEngine) => set({ recEngine }),
  setLocalMode: (localMode) => set({ localMode }),
  setScreening: (screening) => set({ screening }),
  setMyTurnRanges: (myTurnRanges) => set({ myTurnRanges }),
  clear: () => set({ activeSessionId: null, status: null, segments: [], sourceUrl: null, currentSegmentId: null, selectedSegmentId: null, segmentAssignees: {}, segmentStatus: {}, editingBadge: null, bedUrls: [], bedMode: 'bed', sourceAR: null, seekRequest: null, recTrackId: null, recPreview: null, recBusy: false, recCalMs: 0, recMicStream: null, recError: null, recCountdown: null, recLoop: true, recEngine: null, localMode: null, screening: false, myTurnRanges: [] }),
}))

// DEV 훅(프로드 번들 제외) — 실렌더 하네스가 store 상태를 실측(__streamAvatar 관례 동형)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __dubStore?: typeof useDubStore }).__dubStore = useDubStore
}
