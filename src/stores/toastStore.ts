import { create } from 'zustand'

// 성공/실패/정보 피드백 채널(seam · A-SEAM-1 / UX-GAPS P-1).
// 이 store 는 "채널"만 소유한다 — 큐 적재 + 자동 소멸까지 책임지므로, 표현(<ToastHost/>)을 얹는
// 트랙 B 는 toasts 를 렌더만 하면 된다(타이밍 로직 불필요). 메시지는 호출부가 이미 t() 로 번역해 넘긴다.
type ToastKind = 'success' | 'error' | 'info'

interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastStore {
  toasts: Toast[]
  push: (kind: ToastKind, message: string) => number
  dismiss: (id: number) => void
}

const AUTO_DISMISS_MS = 4000
let nextId = 1

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
    setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS)
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
