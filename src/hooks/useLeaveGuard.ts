import { useEffect } from 'react'

/**
 * LEAVE-GUARD(감사 #8): 브라우저 안에서 도는 작업이 진행 중일 때 탭 닫기·새로고침에 확인창을 건다.
 *
 * 왜 필요한가 — 더빙 합성(ffmpeg.wasm)·방 녹화는 **탭 안에서만** 존재한다. 서버 잡이 아니라서
 * 탭이 닫히면 이어받을 곳이 없고, 그 앞에는 이미 돈이 든 단계(STT·음원분리·GPU)가 쌓여 있다.
 * 지금까지는 경고 한 번 없이 사라졌다([[protect-paid-api-work]]).
 *
 * 천장(ponytail): 이건 **경고**지 복구가 아니다. 진행 중 작업을 서버로 옮기거나 IndexedDB 로
 * 재개 가능하게 만드는 건 별개 작업(ROOM-23 계열). 사용자가 "나가기"를 고르면 여전히 잃는다.
 * 또 브라우저는 커스텀 문구를 무시하고 자체 문구만 띄운다 — 무엇을 잃는지는 화면 안에서 알려야 한다.
 */
export function useLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '' // 레거시 브라우저용 — 문구는 브라우저가 정한다
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])
}
