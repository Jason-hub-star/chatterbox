// ROOM-01 잔여: 메인뷰 공유재생 타임라인 동기(타임스탬프 기반 ±200ms — MILESTONES Phase 3 AC).
// 호스트의 video 가 타임라인 진실. 호스트=이벤트 발행+5s 하트비트(늦은 입장·드리프트 보정),
// 비호스트=수신 상태로 시크/재생 보정.
// 얇은 버스: RoomPage(LiveKit 훅 보유) ↔ MainView(video 엘리먼트 보유) — Stage 프롭 드릴링 회피.
// ponytail: 발신자 시계 기준(at_ms)이라 기기 간 시계 오차는 보정 못 함(상수 오프셋) — NTP식 오프셋 추정은 후속.
export interface VodSyncState {
  positionMs: number
  playing: boolean
  atMs: number // 발신 시각(발신자 시계)
}

export const VOD_DRIFT_TOLERANCE_MS = 200

// 수신 시점의 목표 위치: 재생 중이면 발신 후 경과분을 더한다(일시정지면 그대로).
export const vodTargetMs = (s: VodSyncState, nowMs: number): number =>
  s.positionMs + (s.playing ? Math.max(0, nowMs - s.atMs) : 0)

export const vodNeedsSeek = (currentMs: number, targetMs: number): boolean =>
  Math.abs(currentMs - targetMs) > VOD_DRIFT_TOLERANCE_MS

let publisher: ((s: VodSyncState) => void) | null = null // RoomPage(호스트)가 등록 — LiveKit 발행
let reader: (() => VodSyncState | null) | null = null // MainView(호스트)가 등록 — 하트비트용 현재 상태
let applier: ((s: VodSyncState) => void) | null = null // MainView(비호스트)가 등록 — 보정 적용

export const setVodSyncPublisher = (fn: ((s: VodSyncState) => void) | null) => {
  publisher = fn
}
export const publishVodSync = (s: VodSyncState) => {
  publisher?.(s)
}
export const setVodSyncReader = (fn: (() => VodSyncState | null) | null) => {
  reader = fn
}
export const readVodSyncState = (): VodSyncState | null => reader?.() ?? null
export const setVodSyncApplier = (fn: ((s: VodSyncState) => void) | null) => {
  applier = fn
}
export const applyVodSync = (s: VodSyncState) => {
  applier?.(s)
}
