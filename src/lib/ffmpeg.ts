import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

// ffmpeg.wasm 단일스레드 코어(CDN 핀) — SharedArrayBuffer 불필요 → COOP/COEP 없이 동작(아바타/LiveKit 무영향).
// DUB-05 합성(원본 재더빙): 더빙 오디오 트랙들을 세그먼트 offset 에 배치·믹스 후 원본 비디오에 mux.
// ponytail: mt 코어·오프라인 자가호스팅(Storage)·loudness 정규화·오디오전용 소스는 후속. MVP 는 st + CDN + 비디오 소스.

const CORE_VERSION = '0.12.10'
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`

let ffmpegPromise: Promise<FFmpeg> | null = null
let currentProgress: ((ratio: number) => void) | null = null

export function loadFfmpeg(): Promise<FFmpeg> {
  if (ffmpegPromise) return ffmpegPromise
  ffmpegPromise = (async () => {
    const ffmpeg = new FFmpeg()
    ffmpeg.on('progress', ({ progress }) => currentProgress?.(progress))
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    return ffmpeg
  })()
  return ffmpegPromise
}

export interface DubCue { blob: Blob; startMs: number }

const ms = (n: number) => Math.max(0, Math.round(n))

// 원본(비디오) + 더빙 오디오 큐들 → 재더빙 mp4. 원본 오디오 드롭(-map 0:v 만), 비디오 무손실 복사.
export async function mixAndMux(
  source: Blob,
  cues: DubCue[],
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  if (cues.length === 0) throw new Error('더빙 트랙이 없어요.')
  const ffmpeg = await loadFfmpeg()
  currentProgress = onProgress ?? null

  const SRC = 'source.mp4'
  const OUT = 'out.mp4'
  const recNames = cues.map((_, i) => `rec${i}.webm`)
  try {
    await ffmpeg.writeFile(SRC, await fetchFile(source))
    for (let i = 0; i < cues.length; i++) {
      await ffmpeg.writeFile(recNames[i], await fetchFile(cues[i].blob))
    }

    // filter_complex: 각 녹음을 시작 offset 만큼 adelay 후 amix(normalize=0 로 레벨 보존).
    let filter: string
    if (cues.length === 1) {
      const d = ms(cues[0].startMs)
      filter = `[1:a]adelay=${d}|${d}[dub]`
    } else {
      const delays = cues
        .map((c, i) => { const d = ms(c.startMs); return `[${i + 1}:a]adelay=${d}|${d}[a${i}]` })
        .join(';')
      const mixIn = cues.map((_, i) => `[a${i}]`).join('')
      filter = `${delays};${mixIn}amix=inputs=${cues.length}:normalize=0[dub]`
    }

    // -shortest 미사용: 비디오 전체 길이 유지(더빙이 짧으면 뒤는 무음).
    await ffmpeg.exec([
      '-i', SRC,
      ...recNames.flatMap((n) => ['-i', n]),
      '-filter_complex', filter,
      '-map', '0:v', '-map', '[dub]',
      '-c:v', 'copy', '-c:a', 'aac',
      OUT,
    ])

    const data = await ffmpeg.readFile(OUT)
    // readFile 은 Uint8Array<ArrayBufferLike>(SharedArrayBuffer 가능) → 평범한 ArrayBuffer 로 복사(Blob 타입 만족).
    const bytes = data as Uint8Array
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    return new Blob([copy], { type: 'video/mp4' })
  } finally {
    currentProgress = null
    await ffmpeg.deleteFile(SRC).catch(() => {})
    await ffmpeg.deleteFile(OUT).catch(() => {})
    for (const n of recNames) await ffmpeg.deleteFile(n).catch(() => {})
  }
}
