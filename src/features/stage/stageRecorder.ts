// 무대 합성 레코더 (V-3 · GOAL-g3 §0 — 클라 캔버스 합성 P1).
// 아바타는 LiveKit 비디오 트랙이 아니라(blendshape → 클라 Pixi 렌더) Egress 기본 컴포지트가 불가 —
// 호스트 클라가 무대를 직접 합성한다: 씬 배경 + 좌석 아바타 캔버스(rAF drawImage, 원형 클립)
// + WebAudio 오디오 믹스(내 마이크·원격) → canvas.captureStream + MediaRecorder(webm).
// ceiling(ponytail): 화질/프레임=호스트 기기 의존 · 탭 백그라운드 시 rAF 스로틀로 프레임 정지 ·
// DOM 오버레이(채팅·리액션·공유영상)는 미포함(무대 좌석+배경만) — 업그레이드 경로는 Egress custom template(P2).

// 좌석 아바타 캔버스만 합성 대상(Pixi 캔버스는 preserveDrawingBuffer=true 로 생성 — drawImage 안정).
const AVATAR_CANVAS_SELECTOR = '[data-self-avatar] canvas, [data-remote-avatar] canvas'
const MIME_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
const STAGE_BASE_FILL = '#141122' // 씬 미설정 시 바닥색(디자인 토큰 stage-base 근사)
const MAX_DIM = 1280 // 출력 장변(px) — 720p급. 호스트 기기 부담과 R2 용량의 절충.

export interface StageRecorderOptions {
  stageEl: HTMLElement // 무대 루트(배경 div + 좌석 캔버스 포함) — 좌표계 기준
  backgroundUrl?: string | null // 씬 배경(무대와 동일 이미지). CORS 미허용이면 로드 실패 → 바닥색만
  audioTracks?: MediaStreamTrack[] // 시작 시점 오디오(내 마이크 + 원격). 이후 추가는 addAudioTrack
  fps?: number
}

export interface StageRecorder {
  readonly mimeType: string
  // 녹화 중 오디오 참가자 증감 대응(TrackSubscribed 배선용). 중복 추가는 무해(믹스 합산).
  addAudioTrack(track: MediaStreamTrack): void
  stop(): Promise<Blob> // 최종 webm. 원본 오디오 트랙은 건드리지 않는다(LiveKit 소유)
  cancel(): void
}

// cover-fit(CSS bg-cover 동형) — 무대 실화면과 같은 크롭.
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number): void {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

export function startStageRecorder(opts: StageRecorderOptions): StageRecorder {
  const { stageEl } = opts
  const fps = opts.fps ?? 24

  const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
  if (!mimeType) throw new Error('recording_unsupported')

  // 출력 해상도: 무대 종횡비 유지, 장변 MAX_DIM, 짝수(인코더 요구).
  const stageRect = stageEl.getBoundingClientRect()
  if (stageRect.width <= 0 || stageRect.height <= 0) throw new Error('stage_not_visible')
  const scale = MAX_DIM / Math.max(stageRect.width, stageRect.height)
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2)
  const canvas = document.createElement('canvas')
  canvas.width = even(stageRect.width * scale)
  canvas.height = even(stageRect.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('recording_unsupported')

  // 배경은 비동기 로드 — 로드 전/실패 시 바닥색만 그린다(녹화는 계속).
  let bgImg: HTMLImageElement | null = null
  if (opts.backgroundUrl) {
    const img = new Image()
    img.crossOrigin = 'anonymous' // 캔버스 오염 방지 — 오염되면 captureStream 자체가 죽는다
    img.onload = () => {
      bgImg = img
    }
    img.src = opts.backgroundUrl
  }

  // 오디오 믹스: 트랙별 소스 → 단일 destination. 입력 트랙 0개여도 무음 오디오 트랙을 실어
  // 산출물 shape 을 고정한다(후속 소비자가 오디오 유무 분기 불필요).
  const audioCtx = new AudioContext()
  const dest = audioCtx.createMediaStreamDestination()
  const sources: MediaStreamAudioSourceNode[] = []
  let stopped = false
  const addAudioTrack = (track: MediaStreamTrack): void => {
    if (stopped || track.kind !== 'audio') return
    const src = audioCtx.createMediaStreamSource(new MediaStream([track]))
    src.connect(dest)
    sources.push(src)
  }
  for (const t of opts.audioTracks ?? []) addAudioTrack(t)

  // 합성 루프: 매 프레임 무대 rect 재측정 — speaking 확대·좌석 증감·리사이즈를 그대로 따라간다.
  let rafId = 0
  const drawFrame = (): void => {
    const rect = stageEl.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    ctx.fillStyle = STAGE_BASE_FILL
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (bgImg) drawCover(ctx, bgImg, canvas.width, canvas.height)
    for (const c of stageEl.querySelectorAll<HTMLCanvasElement>(AVATAR_CANVAS_SELECTOR)) {
      const r = c.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      const x = (r.left - rect.left) * sx
      const y = (r.top - rect.top) * sy
      const w = r.width * sx
      const h = r.height * sy
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2) // 좌석은 rounded-full — 실화면 동형 클립
      ctx.clip()
      ctx.drawImage(c, x, y, w, h)
      ctx.restore()
    }
    rafId = requestAnimationFrame(drawFrame)
  }
  drawFrame()

  const videoStream = canvas.captureStream(fps)
  const stream = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()])
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_000_000,
    audioBitsPerSecond: 128_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  recorder.start(1000) // 1s 타임슬라이스 — 장시간 녹화도 청크 단위로 안전하게 적재

  const cleanup = (): void => {
    stopped = true
    cancelAnimationFrame(rafId)
    for (const s of sources) s.disconnect() // 원본 트랙은 stop 안 함 — LiveKit 재생이 계속돼야 한다
    stream.getTracks().forEach((t) => t.stop()) // capture 비디오 + 믹스 destination 트랙만
    void audioCtx.close().catch(() => {})
  }

  return {
    mimeType,
    addAudioTrack,
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          cleanup()
          resolve(new Blob(chunks, { type: mimeType }))
        }
        recorder.stop()
      }),
    cancel: () => {
      recorder.onstop = null
      try {
        recorder.stop()
      } catch {
        /* inactive 무해 */
      }
      cleanup()
      chunks.length = 0
    },
  }
}
