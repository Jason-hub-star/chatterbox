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
// background: 음원분리(G-280 fal Demucs)로 얻은 배경음/효과음 스템들. 있으면 원본 대사 대신 이 stem 위에 더빙을 얹는다.
//   (offset 0·전체 길이로 amix 합류 — 원본 보컬은 여전히 드롭되므로 이중음성 없음.)
export async function mixAndMux(
  source: Blob,
  cues: DubCue[],
  background: Blob[] = [],
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  if (cues.length === 0) throw new Error('더빙 트랙이 없어요.')
  const ffmpeg = await loadFfmpeg()
  currentProgress = onProgress ?? null

  const SRC = 'source.mp4'
  const OUT = 'out.mp4'
  const recNames = cues.map((_, i) => `rec${i}.webm`)
  const bgNames = background.map((_, j) => `bg${j}.mp3`)
  try {
    await ffmpeg.writeFile(SRC, await fetchFile(source))
    for (let j = 0; j < background.length; j++) {
      await ffmpeg.writeFile(bgNames[j], await fetchFile(background[j]))
    }
    for (let i = 0; i < cues.length; i++) {
      await ffmpeg.writeFile(recNames[i], await fetchFile(cues[i].blob))
    }

    // 입력 인덱스: 0=SRC, 1..B=배경 스템, B+1..=더빙 녹음.
    const B = background.length
    let filter: string
    if (B === 0 && cues.length === 1) {
      // 검증된 무분리 단일 경로 유지(회귀 0).
      const d = ms(cues[0].startMs)
      filter = `[1:a]adelay=${d}|${d}[dub]`
    } else if (B === 0) {
      const delays = cues
        .map((c, i) => { const d = ms(c.startMs); return `[${i + 1}:a]adelay=${d}|${d}[a${i}]` })
        .join(';')
      const mixIn = cues.map((_, i) => `[a${i}]`).join('')
      filter = `${delays};${mixIn}amix=inputs=${cues.length}:normalize=0[dub]`
    } else {
      // 배경 스템(무지연) + 더빙 큐(offset adelay)를 한 amix 로. normalize=0 로 레벨 보존.
      const delays = cues
        .map((c, i) => { const d = ms(c.startMs); return `[${B + 1 + i}:a]adelay=${d}|${d}[a${i}]` })
        .join(';')
      const bgRefs = background.map((_, j) => `[${1 + j}:a]`).join('')
      const dubRefs = cues.map((_, i) => `[a${i}]`).join('')
      const n = B + cues.length
      filter = `${delays};${bgRefs}${dubRefs}amix=inputs=${n}:normalize=0[dub]`
    }

    // -shortest 미사용: 비디오 전체 길이 유지(더빙이 짧으면 뒤는 배경음/무음).
    await ffmpeg.exec([
      '-i', SRC,
      ...bgNames.flatMap((n) => ['-i', n]),
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
    for (const n of bgNames) await ffmpeg.deleteFile(n).catch(() => {})
    for (const n of recNames) await ffmpeg.deleteFile(n).catch(() => {})
  }
}
