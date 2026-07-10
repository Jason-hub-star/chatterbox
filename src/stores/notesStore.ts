import { create } from 'zustand'

// 실시간 디렉터 노트(ROOM-17) — 세션 내 휘발성(DB 저장 금지, 계약 RightPanel.md §ROOM-17).
// 전송은 'chat' DataChannel message_type='note'(별도 채널 금지). 순수 상태 컨테이너(단위 테스트 가능).
// as-built: author 는 payload 가 아니라 LiveKit participant 에서 파생(채팅과 동형·위조 차단),
//   방장 강조도 렌더 시 hostAuthId 비교로 파생(payload role 필드 생략 — 호스트 이양에도 실시간 정확).
export interface DirectorNote {
  id: string
  authorId: string // LiveKit identity = auth uid
  authorName: string
  content: string
  ts: number
}

const MAX_NOTES = 300 // ponytail: 세션 메모리 상한 — 초과 시 앞에서 버림(스트림 성격상 최근이 가치)

interface NotesStore {
  notes: DirectorNote[]
  isAutoScroll: boolean
  addNote: (note: DirectorNote) => void
  setAutoScroll: (enabled: boolean) => void
  clearNotes: () => void
}

export const useNotesStore = create<NotesStore>((set) => ({
  notes: [],
  isAutoScroll: true,
  addNote: (note) => set((s) => ({ notes: [...s.notes, note].slice(-MAX_NOTES) })),
  setAutoScroll: (isAutoScroll) => set({ isAutoScroll }),
  clearNotes: () => set({ notes: [], isAutoScroll: true }),
}))
