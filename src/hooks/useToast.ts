import { useToastStore } from '@/stores/toastStore'

// 피드백 emit API(seam). 컴포넌트는 useToast(), 스토어 액션·hook 등 비컴포넌트는 toast 싱글턴을 쓴다.
// 둘 다 같은 채널(toastStore)로 흘러간다. 문자열은 호출부에서 t() 로 번역해 넘긴다(이 seam 은 문자열 생성 안 함).
export const toast = {
  success: (message: string) => useToastStore.getState().push('success', message),
  error: (message: string) => useToastStore.getState().push('error', message),
  info: (message: string) => useToastStore.getState().push('info', message),
}

export function useToast() {
  return toast
}
