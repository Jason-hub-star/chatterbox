import { create } from 'zustand'

// 성공/실패/정보 피드백 채널(seam · A-SEAM-1 / UX-GAPS P-1).
// 이 store 는 "채널"만 소유한다 — 큐 적재 + 자동 소멸까지 책임지므로, 표현(<ToastHost/>)을 얹는
// 트랙 B 는 toasts 를 렌더만 하면 된다(타이밍 로직 불필요). 메시지는 호출부가 이미 t() 로 번역해 넘긴다.
type ToastKind = 'success' | 'error' | 'info'

// FB-TOAST: 다음 행동 슬롯. 실패를 알리기만 하고 끝내면 사용자는 "그래서 뭘 하지"에 남는다.
export interface ToastAction {
  label: string // 호출부가 이미 t() 로 번역해 넘긴다(이 store 는 문자열을 만들지 않는다)
  onClick: () => void
}

interface Toast {
  id: number
  kind: ToastKind
  message: string
  action?: ToastAction
}

interface ToastStore {
  toasts: Toast[]
  push: (kind: ToastKind, message: string, action?: ToastAction) => number
  dismiss: (id: number) => void
}

const AUTO_DISMISS_MS = 4000
let nextId = 1

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (kind, message, action) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, action }] }))
    // FB-TOAST: 에러는 자동 소멸시키지 않는다. 실패 문구가 4초 만에 사라지면 눈을 뗀 사이 일어난
    //   실패는 없었던 일이 되고, 재시도 버튼(action)도 같이 증발한다. 성공·정보만 스스로 비킨다.
    if (kind !== 'error') setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS)
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
