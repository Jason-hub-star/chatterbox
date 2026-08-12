// 내 트랙 레코더 (ROOM-28 P2a · 계약 contracts/VoiceRecording.md §P2 설계).
// `voiceRecorder` 와 다른 점 하나: **소스가 LiveKit 수신 믹스가 아니라 내 마이크 원본**이다.
// getUserMedia 로 새 스트림을 잡아 그대로 인코딩하므로 업링크 압축을 거치지 않는다
// — 이게 double-ender 의 존재 이유고, `DubRecorder.tsx:188` 이 이미 쓰는 패턴이다.
//
// ceiling(ponytail): 여기서 만든 스트림은 우리가 소유하므로 stop 시 트랙을 끈다(LiveKit 소유 트랙과 반대).
//   마이크를 두 번 여는 셈이라 저사양 기기에서 입력 지연이 늘 수 있다 — 공유하려면 LiveKit 로컬
//   퍼블리시 트랙을 재사용해야 하는데, 그건 이미 인코딩된 경로라 원본이 아니게 된다(트레이드오프 확정).

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm']
const DEFAULT_BPS = 64_000 // P1 믹스와 같은 기준 — 원본 이점은 압축 단계 수(1회)에서 나온다

export interface TrackRecorder {
  readonly mimeType: string
  stop(): Promise<Blob>
  cancel(): void
}

export async function startTrackRecorder(deviceId?: string): Promise<TrackRecorder> {
  const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
  if (!mimeType) throw new Error('recording_unsupported')

  // 동의 확인 뒤에만 호출된다(계약 MUST NOT) — 이 호출 자체가 마이크 권한 프롬프트를 띄울 수 있다.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  })

  const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: DEFAULT_BPS })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  recorder.start(1000)

  // 우리가 연 스트림이므로 끝나면 우리가 끈다(마이크 표시등이 남으면 안 된다).
  const cleanup = (): void => stream.getTracks().forEach((t) => t.stop())

  return {
    mimeType,
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
