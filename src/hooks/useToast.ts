import { useToastStore, type ToastAction } from '@/stores/toastStore'

// 피드백 emit API(seam). 컴포넌트는 useToast(), 스토어 액션·hook 등 비컴포넌트는 toast 싱글턴을 쓴다.
// 둘 다 같은 채널(toastStore)로 흘러간다. 문자열은 호출부에서 t() 로 번역해 넘긴다(이 seam 은 문자열 생성 안 함).
// action(FB-TOAST)은 옵션 — 실패 토스트가 "다음 한 수"(재시도·대안)를 실을 수 있다.
export const toast = {
  success: (message: string, action?: ToastAction) => useToastStore.getState().push('success', message, action),
  error: (message: string, action?: ToastAction) => useToastStore.getState().push('error', message, action),
  info: (message: string, action?: ToastAction) => useToastStore.getState().push('info', message, action),
}

export function useToast() {
  return toast
}
