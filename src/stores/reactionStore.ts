import { create } from 'zustand'

// 리액션 휠 상태 슬라이스.
// - slots: 휠에 표시할 이모지 세트(커스터마이즈·localStorage 영속). 데이터 주도라 N 가변.
// - floats: 무대 위로 떠오르는 리액션(휘발성, 애니 후 자동 제거).
// SSOT: docs/contracts/ReactionWheel.md
// 규칙: stores/index.ts barrel 금지(CLAUDE.md §12.3) — 직접 import.

export interface ReactionSlot {
  id: string
  emoji: string
  label: string
}

// 기본 8슬롯(45°). ❓ = LoL 핑휠 대응. 사용자가 setSlots 로 교체 가능.
export const DEFAULT_SLOTS: ReactionSlot[] = [
  { id: 'thumbsup', emoji: '👍', label: '좋아요' },
  { id: 'laugh', emoji: '😂', label: '웃음' },
  { id: 'clap', emoji: '👏', label: '박수' },
  { id: 'fire', emoji: '🔥', label: '열정' },
  { id: 'heart', emoji: '❤️', label: '하트' },
  { id: 'cry', emoji: '😢', label: '슬픔' },
  { id: 'wow', emoji: '😮', label: '놀람' },
  { id: 'question', emoji: '❓', label: '핑' },
]

export const MAX_SLOTS = 12 // ceiling: 12 초과는 휠이 붐빔 → 2중링/페이지는 후속(ponytail)
export const MAX_FLOATS = 30 // 동시 표시 상한(스팸 방어)

export interface FloatingReaction {
  id: string
  identity: string // 보낸 사람 LiveKit identity(=auth uid) → 좌석 위에 띄움
  emoji: string
  ts: number
}

const STORAGE_KEY = 'chatterbox.reactionSlots'

function loadSlots(): ReactionSlot[] {
  if (typeof localStorage === 'undefined') return DEFAULT_SLOTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SLOTS
    const parsed = JSON.parse(raw)
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((s) => s && typeof s.id === 'string' && typeof s.emoji === 'string')
    ) {
      return parsed.slice(0, MAX_SLOTS).map((s) => ({ id: s.id, emoji: s.emoji, label: String(s.label ?? '') }))
    }
  } catch {
    /* 손상 → 기본값 */
  }
  return DEFAULT_SLOTS
}

interface ReactionStore {
  slots: ReactionSlot[]
  floats: FloatingReaction[]
  setSlots: (slots: ReactionSlot[]) => void
  addFloat: (identity: string, emoji: string) => void
  removeFloat: (id: string) => void
}

export const useReactionStore = create<ReactionStore>((set) => ({
  slots: loadSlots(),
  floats: [],

  setSlots: (slots) => {
    if (slots.length === 0) return // 빈 세트 = 발사 불가 휠 → 무시(피커 UI 도 최소 1개 강제)
    const trimmed = slots.slice(0, MAX_SLOTS)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    } catch {
      /* 영속 실패 무시 — 세션 내에선 반영 */
    }
    set({ slots: trimmed })
  },

  addFloat: (identity, emoji) =>
    set((s) => ({
      floats: [...s.floats, { id: crypto.randomUUID(), identity, emoji, ts: Date.now() }].slice(-MAX_FLOATS),
    })),

  removeFloat: (id) => set((s) => ({ floats: s.floats.filter((f) => f.id !== id) })),
}))
