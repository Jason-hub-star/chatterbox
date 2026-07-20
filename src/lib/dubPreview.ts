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
  pause: () => void   // W5: 영상 pause 에 맞춰 오디오 정지(ctx.suspend)
  resume: () => void  // W5: 영상 play 에 맞춰 오디오 재개(ctx.resume)
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
// S2(각인 #2): bedUrls 를 주면 배경 스템(기존 목소리 제거본)을 연속 트랙으로 깔아
// "배경음 위 내 목소리"로 들린다 — 없으면 기존 무음 배경 그대로(하위호환).
export async function playDubPreview(
  video: HTMLVideoElement,
  tracks: DubPreviewTrack[],
  fromMs: number,
  bedUrls: string[] = [],
): Promise<DubPreviewHandle> {
  const ctx = new AudioContext()
  const [buffers, bedBuffers] = await Promise.all([
    Promise.all(tracks.map((t) => decode(ctx, t.url))),
    Promise.all(bedUrls.map((u) => decode(ctx, u).catch(() => null))), // 베드 실패 비치명
  ])
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
  const bedNodes = bedBuffers.filter((b): b is AudioBuffer => !!b).map((buf) => {
    const node = new AudioBufferSourceNode(ctx, { buffer: buf })
    node.connect(ctx.destination)
    node.start(base, Math.min(baseMs / 1000, buf.duration)) // 영상 위치부터 연속 재생
    return node
  })
  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__dubPreviewStats = {
      scheduled: nodes.length,
      beds: bedNodes.length,
      ctxState: ctx.state,
      fromMs,
      cals: tracks.map((t) => t.calMs ?? 0),
    }
    ;(window as unknown as Record<string, unknown>).__dubPreviewCtx = ctx // W5 검증: pause/play 시 state 관측
  }
  let stopped = false
  return {
    stop: () => {
      if (stopped) return
      stopped = true
      for (const n of [...nodes, ...bedNodes]) { try { n.stop() } catch { /* 이미 종료 */ } }
      void ctx.close()
    },
    // W5 DUB-PREVIEW-PAUSE: 오디오는 AudioContext 시계로 도므로 영상 pause 를 안 따라간다.
    //   ctx.suspend/resume 로 스케줄 전체를 영상 pause/play 에 묶는다(호출측이 video 이벤트에 배선).
    pause: () => { if (!stopped && ctx.state === 'running') void ctx.suspend() },
    resume: () => { if (!stopped && ctx.state === 'suspended') void ctx.resume() },
  }
}
