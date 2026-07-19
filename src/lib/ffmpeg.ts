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
export interface SubtitleCue { startMs: number; endMs: number; text: string }

const ms = (n: number) => Math.max(0, Math.round(n))

// V-10 자막: 세그먼트 → SRT(mp4 내장 mov_text 스트림용) / WebVTT(<track> 미리보기용).
// ponytail: 번인(-vf subtitles)은 libass 부재(wasm 코어) + 전체 재인코딩이라 기각 —
//   소프트 자막은 -c:v copy 유지(합성 속도 불변). 번인이 필요해지면 서버측(Egress P2)에서.
const validCues = (cues: SubtitleCue[]) =>
  cues.filter((c) => c.text.trim().length > 0 && c.endMs > c.startMs)

function stamp(msTotal: number, msSep: string): string {
  const t = ms(msTotal)
  const h = String(Math.floor(t / 3600000)).padStart(2, '0')
  const m = String(Math.floor((t % 3600000) / 60000)).padStart(2, '0')
  const s = String(Math.floor((t % 60000) / 1000)).padStart(2, '0')
  const f = String(t % 1000).padStart(3, '0')
  return `${h}:${m}:${s}${msSep}${f}`
}

export function buildSrt(cues: SubtitleCue[]): string {
  return validCues(cues)
    .map((c, i) => `${i + 1}\n${stamp(c.startMs, ',')} --> ${stamp(c.endMs, ',')}\n${c.text.trim()}\n`)
    .join('\n')
}

export function buildVtt(cues: SubtitleCue[]): string {
  const body = validCues(cues)
    .map((c) => `${stamp(c.startMs, '.')} --> ${stamp(c.endMs, '.')}\n${c.text.trim()}\n`)
    .join('\n')
  return `WEBVTT\n\n${body}`
}

// 원본(비디오) + 더빙 오디오 큐들 → 재더빙 mp4. 원본 오디오 드롭(-map 0:v 만), 비디오 무손실 복사.
// background: 음원분리(G-280 fal Demucs)로 얻은 배경음/효과음 스템들. 있으면 원본 대사 대신 이 stem 위에 더빙을 얹는다.
//   (offset 0·전체 길이로 amix 합류 — 원본 보컬은 여전히 드롭되므로 이중음성 없음.)
export async function mixAndMux(
  source: Blob,
  cues: DubCue[],
  background: Blob[] = [],
  subtitles: SubtitleCue[] = [],
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  if (cues.length === 0) throw new Error('더빙 트랙이 없어요.')
  const ffmpeg = await loadFfmpeg()
  currentProgress = onProgress ?? null

  const SRC = 'source.mp4'
  const OUT = 'out.mp4'
  const SUBS = 'subs.srt'
  const srt = buildSrt(subtitles)
  const withSubs = srt.trim().length > 0
  const recNames = cues.map((_, i) => `rec${i}.webm`)
  const bgNames = background.map((_, j) => `bg${j}.mp3`)
  try {
    await ffmpeg.writeFile(SRC, await fetchFile(source))
    if (withSubs) await ffmpeg.writeFile(SUBS, new TextEncoder().encode(srt))
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
    // 자막(SRT)은 마지막 입력으로 append → 기존 오디오 filter 인덱스 불변, mov_text 소프트 스트림으로 mux.
    const subIdx = 1 + B + cues.length
    await ffmpeg.exec([
      '-i', SRC,
      ...bgNames.flatMap((n) => ['-i', n]),
      ...recNames.flatMap((n) => ['-i', n]),
      ...(withSubs ? ['-i', SUBS] : []),
      '-filter_complex', filter,
      '-map', '0:v', '-map', '[dub]',
      ...(withSubs ? ['-map', `${subIdx}:s`, '-c:s', 'mov_text', '-metadata:s:s:0', 'language=kor'] : []),
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
    if (withSubs) await ffmpeg.deleteFile(SUBS).catch(() => {})
    for (const n of bgNames) await ffmpeg.deleteFile(n).catch(() => {})
    for (const n of recNames) await ffmpeg.deleteFile(n).catch(() => {})
  }
}

// ── DUB-TRIM v1: 업로드 전 구간 절단 ─────────────────────────────────
// 순수부(유닛테스트 대상): 슬라이더 입력 정규화 + 예상 용량(비율 근사 — "예상" 표기 전제).
export interface TrimRange { startMs: number; endMs: number }
export const MIN_TRIM_MS = 1000 // 최소 1초 — 시작/끝 핸들 교차 방지

export function clampTrimRange(durMs: number, startMs: number, endMs: number): TrimRange {
  const d = Math.max(0, Math.round(durMs))
  const s = Math.min(Math.max(0, Math.round(startMs)), Math.max(0, d - MIN_TRIM_MS))
  const e = Math.min(Math.max(Math.round(endMs), s + MIN_TRIM_MS), d)
  return { startMs: s, endMs: Math.max(e, s) }
}

export function estimateTrimBytes(totalBytes: number, durMs: number, r: TrimRange): number {
  if (durMs <= 0) return totalBytes
  return Math.round(totalBytes * ((r.endMs - r.startMs) / durMs))
}

// -ss 를 -i 앞(입력 시킹) = 키프레임 스냅·재인코딩 0(-c copy: 수초 완료·화질 무손실).
// 시작점이 요청보다 최대 수초 이를 수 있다(키프레임 경계) — 더빙 소스 용도 무해, 정밀 컷(재인코딩)은 ponytail.
// 출력 확장자 = 입력 확장자 유지(muxer 불일치 방지) · 반환 File 은 원본 이름·type 유지 → 업로드 경로 무수정.
export async function trimVideo(file: File, startMs: number, endMs: number): Promise<File> {
  const ffmpeg = await loadFfmpeg()
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
  const IN = `trim-in.${ext}`
  const OUT = `trim-out.${ext}`
  try {
    await ffmpeg.writeFile(IN, await fetchFile(file))
    const code = await ffmpeg.exec([
      '-ss', (Math.max(0, startMs) / 1000).toFixed(3),
      '-i', IN,
      '-t', (Math.max(0, endMs - startMs) / 1000).toFixed(3),
      '-c', 'copy', '-avoid_negative_ts', 'make_zero',
      OUT,
    ])
    if (code !== 0) throw new Error(`trim failed (ffmpeg exit ${code})`)
    const data = await ffmpeg.readFile(OUT)
    const bytes = data as Uint8Array
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    return new File([copy], file.name, { type: file.type })
  } finally {
    await ffmpeg.deleteFile(IN).catch(() => {})
    await ffmpeg.deleteFile(OUT).catch(() => {})
  }
}
