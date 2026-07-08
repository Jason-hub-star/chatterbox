import { afterEach, describe, expect, it, vi } from 'vitest'
import { callFn, EdgeTimeoutError } from '@/lib/edgeFn'

// A-FUNC-1 그라운드 트루스: 응답 없는 Edge 호출이 무한대기하지 않고 15s 에 EdgeTimeoutError 로 끝난다.
// + 외부 취소 signal 은 타임아웃과 구분돼 AbortError 로 전파된다(취소 버튼용 seam).
function neverResolvingFetch() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise((_res, rej) => {
        const sig = init?.signal
        sig?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
      }),
  )
}

describe('callFn timeout/cancel (A-FUNC-1)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('15초 응답 없으면 EdgeTimeoutError 로 끝난다(무한대기 제거)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', neverResolvingFetch())
    const p = callFn('join-public-room', 'tok', {})
    const assertion = expect(p).rejects.toBeInstanceOf(EdgeTimeoutError)
    await vi.advanceTimersByTimeAsync(15_000)
    await assertion
  })

  it('외부 signal 취소는 타임아웃 아닌 AbortError 로 전파된다', async () => {
    vi.stubGlobal('fetch', neverResolvingFetch())
    const ctrl = new AbortController()
    const p = callFn('create-room', 'tok', {}, { signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})
