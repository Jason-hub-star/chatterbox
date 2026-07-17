// 더빙 미리보기 오디오 스케줄러 — GOAL-dub-recording-tangible §6-B.
// 원본 영상(muted) 재생 위에 녹음 트랙들을 각자 start_ms(+calibration) 위치에 Web Audio 로 얹는다.
// ffmpeg 불필요(미리보기는 재생일 뿐) — 최종 다운로드 합성은 lib/ffmpeg.ts mixAndMux 그대로.
// AudioBufferSourceNode 는 1회용(재생마다 새로 생성), AudioBuffer 는 캐시(디코드 1회).

export interface DubPreviewTrack {
  url: string      // 녹음 오디오(objectURL 또는 서명 URL)
  startMs: number  // 원본 영상 기준 발화 시작
  calMs?: number   // ±캘리브레이션(dub_tracks.calibration_offset_ms)
}

export interface DubPreviewHandle {
  stop: () => void
}

const CACHE_MAX = 32
const bufferCache = new Map<string, AudioBuffer>() // url → PCM (컨텍스트 무관 재사용 가능)

async function decode(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const hit = bufferCache.get(url)
  if (hit) return hit
  const res = await fetch(url)
  if (!res.ok) throw new Error(`preview fetch ${res.status}`)
  const buf = await ctx.decodeAudioData(await res.arrayBuffer())
  if (bufferCache.size >= CACHE_MAX) {
    const oldest = bufferCache.keys().next().value
    if (oldest !== undefined) bufferCache.delete(oldest)
  }
  bufferCache.set(url, buf)
  return buf
}

// video 를 fromMs 로 시크·재생하고, 각 트랙을 영상 타임라인에 맞춰 스케줄한다.
// 이미 지난 트랙은 offset 으로 중간부터 발화(늦참 시사회 대응). 반환 stop() 이 전 노드·컨텍스트 정리.
export async function playDubPreview(
  video: HTMLVideoElement,
  tracks: DubPreviewTrack[],
  fromMs: number,
): Promise<DubPreviewHandle> {
  const ctx = new AudioContext()
  const buffers = await Promise.all(tracks.map((t) => decode(ctx, t.url)))
  video.currentTime = fromMs / 1000
  await video.play()
  const base = ctx.currentTime + 0.05 // 짧은 리드타임
  const baseMs = video.currentTime * 1000
  const nodes = tracks.map((t, i) => {
    const node = new AudioBufferSourceNode(ctx, { buffer: buffers[i] })
    node.connect(ctx.destination)
    const whenMs = t.startMs + (t.calMs ?? 0) - baseMs
    if (whenMs >= 0) node.start(base + whenMs / 1000)
    else node.start(base, Math.min(-whenMs / 1000, buffers[i].duration))
    return node
  })
  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__dubPreviewStats = {
      scheduled: nodes.length,
      ctxState: ctx.state,
      fromMs,
      cals: tracks.map((t) => t.calMs ?? 0),
    }
  }
  let stopped = false
  return {
    stop: () => {
      if (stopped) return
      stopped = true
      for (const n of nodes) { try { n.stop() } catch { /* 이미 종료 */ } }
      void ctx.close()
    },
  }
}
