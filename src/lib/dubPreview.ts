// 더빙 오디오 스케줄러 — GOAL-dub-recording-tangible §6-B + DUB-PART-LOOP 상시 레이어.
// 원본 영상 재생 위에 녹음 트랙들을 각자 start_ms(+calibration) 위치에 Web Audio 로 얹는다.
// ffmpeg 불필요(재생일 뿐) — 최종 다운로드 합성은 lib/ffmpeg.ts mixAndMux 그대로.
// AudioBufferSourceNode 는 1회용(재생마다 새로 생성), AudioBuffer 는 캐시(디코드 1회).

export interface DubPreviewTrack {
  url: string      // 녹음 오디오(objectURL 또는 서명 URL)
  startMs: number  // 원본 영상 기준 발화 시작
  calMs?: number   // ±캘리브레이션(dub_tracks.calibration_offset_ms)
  durationMs?: number // 세그먼트 길이 — 초과 테이크를 구간 끝에서 컷(0/미지정=트림 없음, stale 서버 하위호환)
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

// 영상 현재 위치 기준으로 트랙들을 스케줄(시크 없음). durationMs 트림 + 배속 반영(버퍼는 video 타임라인 1x 녹음
// → node.playbackRate=rate 로 소비 속도를 맞추고 시작 지연은 실시간(delta/rate)으로 환산).
function scheduleTracks(
  ctx: AudioContext,
  video: HTMLVideoElement,
  tracks: DubPreviewTrack[],
  buffers: Array<AudioBuffer | null>,
): AudioBufferSourceNode[] {
  const base = ctx.currentTime + 0.05 // 짧은 리드타임
  const baseMs = video.currentTime * 1000
  const rate = video.playbackRate || 1
  const nodes: AudioBufferSourceNode[] = []
  tracks.forEach((t, i) => {
    const buf = buffers[i]
    if (!buf) return
    const durSec = t.durationMs && t.durationMs > 0 ? Math.min(t.durationMs / 1000, buf.duration) : buf.duration
    const whenMs = t.startMs + (t.calMs ?? 0) - baseMs
    const node = new AudioBufferSourceNode(ctx, { buffer: buf, playbackRate: rate })
    if (whenMs >= 0) {
      node.connect(ctx.destination)
      node.start(base + whenMs / rate / 1000, 0, durSec)
    } else {
      const offset = -whenMs / 1000 // 이미 지난 트랙은 중간부터(늦참 대응)
      if (offset >= durSec - 0.01) return // 트림 구간까지 지나감 — 스케줄 생략
      node.connect(ctx.destination)
      node.start(base, offset, durSec - offset)
    }
    nodes.push(node)
  })
  return nodes
}

// video 를 fromMs 로 시크·재생하고, 각 트랙을 영상 타임라인에 맞춰 스케줄한다(프리뷰·1회성).
// S2(각인 #2): bedUrls 를 주면 배경 스템(기존 목소리 제거본)을 연속 트랙으로 깔아
// "배경음 위 내 목소리"로 들린다 — 없으면 기존 무음 배경 그대로(하위호환).
export async function playDubPreview(
  video: HTMLVideoElement,
  tracks: DubPreviewTrack[],
  fromMs: number,
  bedUrls: string[] = [],
): Promise<DubPreviewHandle> {
  const ctx = new AudioContext()
  void ctx.resume() // 제스처 컨텍스트 부재 시 suspended 시작 방어(MicLevelMeter 전례 — 무음 오탐)
  const [buffers, bedBuffers] = await Promise.all([
    Promise.all(tracks.map((t) => decode(ctx, t.url))),
    Promise.all(bedUrls.map((u) => decode(ctx, u).catch(() => null))), // 베드 실패 비치명
  ])
  video.currentTime = fromMs / 1000
  await video.play()
  const nodes = scheduleTracks(ctx, video, tracks, buffers)
  const base = ctx.currentTime + 0.05
  const baseMs = video.currentTime * 1000
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

// DUB-PART-LOOP 상시 레이어: 일반 재생·시사회·리허설 중 더빙된 구간을 항상 들리게.
// 시크 없이 현재 위치 기준 스케줄 — play/seeked/ratechange 마다 "전부 정지 후 재스케줄" 단일 경로
// (suspend/resume 정렬 특례 없음 · 시크/배속 desync 원천 차단), pause 는 전부 정지.
// 베드는 MainView 의 슬레이브 <audio> 가 담당(여기선 녹음 트랙만).
export async function attachDubLayer(
  video: HTMLVideoElement,
  tracks: DubPreviewTrack[],
): Promise<() => void> {
  const ctx = new AudioContext()
  void ctx.resume()
  const buffers = await Promise.all(tracks.map((t) => decode(ctx, t.url).catch(() => null))) // 개별 실패 비치명
  let nodes: AudioBufferSourceNode[] = []
  let detached = false
  let reschedules = 0
  const stopNodes = () => {
    for (const n of nodes) { try { n.stop() } catch { /* 이미 종료 */ } }
    nodes = []
  }
  const reschedule = () => {
    if (detached) return
    stopNodes()
    if (video.paused || video.ended) return
    nodes = scheduleTracks(ctx, video, tracks, buffers)
    reschedules += 1
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__dubLayerStats = {
        scheduled: nodes.length,
        tracks: tracks.length,
        reschedules,
        anchorMs: Math.round(video.currentTime * 1000),
        ctxState: ctx.state,
      }
    }
  }
  const onPause = () => stopNodes()
  video.addEventListener('play', reschedule)
  video.addEventListener('seeked', reschedule)
  video.addEventListener('ratechange', reschedule)
  video.addEventListener('pause', onPause)
  reschedule() // 이미 재생 중이면 즉시 정렬
  return () => {
    if (detached) return
    detached = true
    video.removeEventListener('play', reschedule)
    video.removeEventListener('seeked', reschedule)
    video.removeEventListener('ratechange', reschedule)
    video.removeEventListener('pause', onPause)
    stopNodes()
    void ctx.close()
  }
}
