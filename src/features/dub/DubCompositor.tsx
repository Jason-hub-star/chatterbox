import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import {
  startDubCompositing, uploadDubOutput, finalizeDubOutput, getDubOutputUrl,
  fetchDubRecordings, getDubSourceUrl, separateDubAudio, type DubSegment, type DubTrack,
} from '@/lib/dub'
import { mixAndMux, buildVtt, type DubCue, type SubtitleCue } from '@/lib/ffmpeg'
import ProgressBar from '@/components/shared/ProgressBar'

// Phase 3B 슬라이스 3a/3b: 더빙 완성본 합성(DUB-05, 원본 재더빙 + 음원분리 배경합류).
// 계약(DubCompositor.md) 준수: allSynced+호스트 게이트·브라우저 ffmpeg.wasm·미리보기·다운로드.
// 3b(G-280): 합성 전 separate-dub-audio(fal Demucs)로 원어 대사 제거 → 비보컬 배경 스템을
//   mixAndMux background 로 amix → 이중음성 없이 원어 배경음 위에 한국어 더빙.
// ponytail defer: 아바타 오버레이·Realtime 진행구독·공유링크·새 더빙 리셋·스템 캐시(재과금 방지).

interface Props {
  dubSessionId: string
  status: string
  isHost: boolean
  tracks: DubTrack[]
  segments: DubSegment[]
  onChanged: () => void | Promise<void>
}

type Phase = 'idle' | 'separating' | 'downloading' | 'mixing' | 'uploading' | 'error'

export default function DubCompositor({ dubSessionId, status, isHost, tracks, segments, onChanged }: Props) {
  const { t } = useTranslation()
  const token = useUserStore((s) => s.session?.access_token)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)

  const allSynced = tracks.length > 0 && tracks.every((t) => t.status === 'synced')
  // V-10 자막: 세그먼트 → 자막 큐(더빙 대사 = 번역본 우선). mp4 내장(mov_text) + 미리보기 <track>(VTT) 동일 소스.
  const subtitleCues = useMemo<SubtitleCue[]>(
    () => segments.map((s) => ({ startMs: s.start_ms, endMs: s.end_ms, text: s.translated_text || s.text })),
    [segments],
  )
  const vttUrl = useMemo(
    () => (subtitleCues.length ? URL.createObjectURL(new Blob([buildVtt(subtitleCues)], { type: 'text/vtt' })) : null),
    [subtitleCues],
  )
  useEffect(() => () => { if (vttUrl) URL.revokeObjectURL(vttUrl) }, [vttUrl])
  const isCompleted = status === 'completed'
  const isCompositing = status === 'compositing'
  const busy = phase === 'separating' || phase === 'downloading' || phase === 'mixing' || phase === 'uploading'

  // 완료 세션: 완성본 URL 로드(게스트·재로드 포함)
  useEffect(() => {
    if (!token || !isCompleted) return
    let cancelled = false
    ;(async () => {
      try { const o = await getDubOutputUrl(token, dubSessionId); if (!cancelled) setOutputUrl(o.url) }
      catch { /* 아직 준비 안 됨 */ }
    })()
    return () => { cancelled = true }
  }, [token, dubSessionId, isCompleted])

  const run = useCallback(async () => {
    if (!token) return
    setError(null); setProgress(0)
    let outputId = ''
    try {
      setPhase('separating')
      const started = await startDubCompositing(token, dubSessionId)
      outputId = started.output_id
      // 분리(느림, ~1분)를 소스/녹음 URL 조회와 병렬. sep 이 이 단계 시간을 지배.
      const [srcUrl, recs, sep] = await Promise.all([
        getDubSourceUrl(token, dubSessionId),
        fetchDubRecordings(token, dubSessionId),
        separateDubAudio(token, dubSessionId),
      ])
      setPhase('downloading')
      const srcBlob = await (await fetch(srcUrl)).blob()
      const cues: DubCue[] = await Promise.all(
        // G9-P4: 캘리브레이션을 합성에도 동일 적용(미리보기=완성본 싱크 일치). adelay 는 음수 불가 → 0 클램프.
        recs.map(async (r) => ({ blob: await (await fetch(r.url)).blob(), startMs: Math.max(0, r.startTimeMs + r.calibrationOffsetMs) })),
      )
      // 비보컬 배경 스템 다운로드 → mixAndMux background(원어 대사 대신 이 위에 더빙 amix).
      const background = await Promise.all(
        sep.background_urls.map(async (u) => (await fetch(u)).blob()),
      )
      setPhase('mixing')
      const out = await mixAndMux(srcBlob, cues, background, subtitleCues, setProgress)
      setPhase('uploading')
      await uploadDubOutput(started.uploadUrl, out)
      await finalizeDubOutput(token, { outputId, outputPath: started.path, fileSizeBytes: out.size })
      setPhase('idle')
      await onChanged()
      const o = await getDubOutputUrl(token, dubSessionId)
      setOutputUrl(o.url)
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('dub.compositeError')
      setError(msg)
      setPhase('error')
      if (outputId) { try { await finalizeDubOutput(token, { outputId, errorMessage: msg }) } catch { /* noop */ } }
      await onChanged()
    }
  }, [token, dubSessionId, subtitleCues, onChanged, t])

  const phaseLabel = phase === 'separating' ? t('dub.phaseSeparating')
    : phase === 'downloading' ? t('dub.phaseDownloading')
    : phase === 'mixing' ? t('dub.phaseMixing', { progress: Math.round(progress * 100) })
    : phase === 'uploading' ? t('dub.phaseUploading') : ''

  return (
    <div className="mt-4 border-t border-stage-border pt-4">
      <h3 className="text-xs font-semibold text-stage-text-muted">{t('dub.compositeHeader')}</h3>
      {error && <p className="mt-2 rounded bg-fire-hot/10 px-3 py-2 text-sm text-fire-hot" role="alert">{error}</p>}

      {/* 완료: 미리보기 + 다운로드 */}
      {isCompleted && outputUrl && (
        <div className="mt-2 space-y-2">
          <video src={outputUrl} controls className="w-full rounded-lg">
            {vttUrl ? <track kind="captions" srcLang="ko" src={vttUrl} default /> : <track kind="captions" />}
          </video>
          <a
            href={outputUrl}
            download={`dub-${dubSessionId}.mp4`}
            className="inline-block rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base"
          >
            {t('dub.downloadButton')}
          </a>
        </div>
      )}
      {isCompleted && !outputUrl && <p className="mt-2 text-sm text-stage-text-muted">{t('dub.loadingOutput')}</p>}

      {/* 진행 중(호스트 로컬 실행) — 믹싱만 실측 %, 나머지 단계는 불확정 바(트랙 B P-2) */}
      {busy && (
        <div className="mt-2">
          <ProgressBar value={phase === 'mixing' ? progress : null} label={phaseLabel} />
        </div>
      )}

      {/* 합성 시작 / 재시도 */}
      {!isCompleted && !busy && (
        isHost ? (
          <button
            onClick={() => void run()}
            disabled={!allSynced}
            className="mt-2 rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
          >
            {isCompositing || phase === 'error' ? t('dub.compositeRetryButton') : t('dub.compositeStartButton')}
          </button>
        ) : (
          <p className="mt-2 text-sm text-stage-text-muted">
            {isCompositing ? t('dub.hostCompositing') : t('dub.hostCompositeReady')}
          </p>
        )
      )}
    </div>
  )
}
