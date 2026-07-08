// Edge Function 호출 공용 헬퍼. rooms/dub/vgen 이 각자 복제하던 callFn 을 한 곳으로 통합.
// A-FUNC-1: 15s 타임아웃(무한대기 제거) + 외부 취소 signal(취소 버튼은 트랙 B). SSOT: docs/API-SURFACE.md
const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const DEFAULT_TIMEOUT_MS = 15_000

// 타임아웃 초과. 사용자 취소(AbortError)와 구분 — 호출부가 "네트워크 확인" 안내에 쓴다.
export class EdgeTimeoutError extends Error {
  constructor(fnName: string) {
    super(`${fnName} 응답이 없어요. 네트워크를 확인해주세요.`)
    this.name = 'EdgeTimeoutError'
  }
}

export async function callFn<T>(
  name: string,
  accessToken: string,
  body: unknown,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  // 외부 취소(취소 버튼)와 타임아웃을 하나의 AbortController 로 합류: 둘 중 먼저 발생한 쪽이 fetch 를 끊는다.
  const onExtAbort = () => ctrl.abort()
  if (opts?.signal) {
    if (opts.signal.aborted) ctrl.abort()
    else opts.signal.addEventListener('abort', onExtAbort, { once: true })
  }
  try {
    const res = await fetch(`${FN_BASE}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(json?.error ? String(json.error) : `${name} 실패 (${res.status})`)
    return json as T
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      if (opts?.signal?.aborted) throw e // 사용자 취소는 그대로 전파(호출부가 조용히 처리)
      throw new EdgeTimeoutError(name) // 타임아웃 — 무한대기 대신 명확한 에러
    }
    throw e
  } finally {
    clearTimeout(timer)
    opts?.signal?.removeEventListener('abort', onExtAbort)
  }
}
