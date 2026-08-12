// 음성 전용 레코더 (ROOM-28 · 계약 contracts/VoiceRecording.md).
// `stageRecorder` 에서 캔버스 합성(rAF·WebGL drawImage·배경 로드)을 걷어내고 WebAudio 믹스만 남긴 것 —
// 무대를 그리지 않으므로 호스트 기기 부담이 사라지고 `stage_not_visible` 실패 경로 자체가 없다.
// 산출물은 audio-only webm(opus): 64kbps 기준 시간당 약 29MB 로 무대 합성(4Mbps)의 약 1/62.
// ceiling(ponytail): 음성 기준 비트레이트라 음악·효과음은 열화 · LiveKit 수신본을 섞으므로 압축을
//   한 번 거친 소리다(무압축 원본이 필요하면 참가자별 로컬 녹음 = P2 double-ender, 별도 골).

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm']
const DEFAULT_BPS = 64_000 // 음성 기준 충분. 5분 ≈ 2.4MB

export interface VoiceRecorderOptions {
  audioTracks?: MediaStreamTrack[] // 시작 시점 오디오(내 마이크 + 원격). 이후 추가는 addAudioTrack
  bitsPerSecond?: number
}

export interface VoiceRecorder {
  readonly mimeType: string
  // 녹음 중 오디오 참가자 증감 대응(TrackSubscribed 배선용). 중복 추가는 무해(믹스 합산).
  addAudioTrack(track: MediaStreamTrack): void
  stop(): Promise<Blob> // 최종 webm(audio-only). 원본 오디오 트랙은 건드리지 않는다(LiveKit 소유)
  cancel(): void
}

export function startVoiceRecorder(opts: VoiceRecorderOptions = {}): VoiceRecorder {
  const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
  if (!mimeType) throw new Error('recording_unsupported')

  // 오디오 믹스: 트랙별 소스 → 단일 destination. 입력 트랙 0개여도 destination 이 무음 트랙을 실어
  // 산출물 shape 을 고정한다(후속 소비자가 오디오 유무 분기 불필요) — stageRecorder 와 같은 규약.
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

  const recorder = new MediaRecorder(dest.stream, {
    mimeType,
    audioBitsPerSecond: opts.bitsPerSecond ?? DEFAULT_BPS,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  recorder.start(1000) // 1s 타임슬라이스 — 장시간 녹음도 청크 단위로 안전하게 적재

  const cleanup = (): void => {
    stopped = true
    for (const s of sources) s.disconnect() // 원본 트랙은 stop 안 함 — LiveKit 재생이 계속돼야 한다
    dest.stream.getTracks().forEach((t) => t.stop()) // 믹스 destination 트랙만
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
