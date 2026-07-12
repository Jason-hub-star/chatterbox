import { create } from 'zustand'

// 관객 투표(ROOM-22) — 방당 활성 폴 1개(activePoll 단일 모델, MobileViewer §4.2).
// 진실은 DB(polls·poll_responses) — 이 store 는 'poll' 서버 릴레이 + 입장 시 RLS fetch 의 라이브 미러.
// counts 는 reveal 후에만 채워짐(중간 결과 비공개). 이벤트가 멱등이라 릴레이 dedupe 불필요.
export interface ActivePoll {
  id: string
  question: string
  options: string[]
  status: 'open' | 'revealed'
  counts: number[] | null
  totalVotes: number
  myChoice: number | null
}

interface PollStore {
  poll: ActivePoll | null
  setPoll: (poll: ActivePoll | null) => void
  setTotalVotes: (pollId: string, totalVotes: number) => void
  reveal: (pollId: string, counts: number[], totalVotes: number) => void
  close: (pollId: string) => void
  setMyChoice: (pollId: string, choiceIndex: number) => void
}

export const usePollStore = create<PollStore>((set) => ({
  poll: null,
  setPoll: (poll) => set({ poll }),
  setTotalVotes: (pollId, totalVotes) =>
    set((s) => (s.poll?.id === pollId ? { poll: { ...s.poll, totalVotes } } : s)),
  reveal: (pollId, counts, totalVotes) =>
    set((s) => (s.poll?.id === pollId ? { poll: { ...s.poll, status: 'revealed', counts, totalVotes } } : s)),
  close: (pollId) => set((s) => (s.poll?.id === pollId ? { poll: null } : s)),
  setMyChoice: (pollId, choiceIndex) =>
    set((s) => (s.poll?.id === pollId ? { poll: { ...s.poll, myChoice: choiceIndex } } : s)),
}))
