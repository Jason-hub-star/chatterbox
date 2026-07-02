import { useCallback, useEffect, useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import {
  startDubCompositing, uploadDubOutput, finalizeDubOutput, getDubOutputUrl,
  fetchDubRecordings, getDubSourceUrl, type DubTrack,
} from '@/lib/dub'
import { mixAndMux, type DubCue } from '@/lib/ffmpeg'

// Phase 3B 슬라이스 3a: 더빙 완성본 합성(DUB-05, 원본 재더빙).
// 계약(DubCompositor.md) 준수: allSynced+호스트 게이트·브라우저 ffmpeg.wasm·미리보기·다운로드.
// ponytail defer: 음원분리 stem 합류(G-280)·아바타 오버레이·Realtime 진행구독·공유링크·새 더빙 리셋.

interface Props {
  dubSessionId: string
  status: string
  isHost: boolean
  tracks: DubTrack[]
  onChanged: () => void | Promise<void>
}

type Phase = 'idle' | 'downloading' | 'mixing' | 'uploading' | 'error'

export default function DubCompositor({ dubSessionId, status, isHost, tracks, onChanged }: Props) {
  const token = useUserStore((s) => s.session?.access_token)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)

  const allSynced = tracks.length > 0 && tracks.every((t) => t.status === 'synced')
  const isCompleted = status === 'completed'
  const isCompositing = status === 'compositing'
  const busy = phase === 'downloading' || phase === 'mixing' || phase === 'uploading'

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
      setPhase('downloading')
      const started = await startDubCompositing(token, dubSessionId)
      outputId = started.output_id
      const [srcUrl, recs] = await Promise.all([
        getDubSourceUrl(token, dubSessionId),
        fetchDubRecordings(token, dubSessionId),
      ])
      const srcBlob = await (await fetch(srcUrl)).blob()
      const cues: DubCue[] = await Promise.all(
        recs.map(async (r) => ({ blob: await (await fetch(r.url)).blob(), startMs: r.startTimeMs })),
      )
      setPhase('mixing')
      const out = await mixAndMux(srcBlob, cues, setProgress)
      setPhase('uploading')
      await uploadDubOutput(started.path, started.token, out)
      await finalizeDubOutput(token, { outputId, outputPath: started.path, fileSizeBytes: out.size })
      setPhase('idle')
      await onChanged()
      const o = await getDubOutputUrl(token, dubSessionId)
      setOutputUrl(o.url)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '합성에 실패했어요.'
      setError(msg)
      setPhase('error')
      if (outputId) { try { await finalizeDubOutput(token, { outputId, errorMessage: msg }) } catch { /* noop */ } }
      await onChanged()
    }
  }, [token, dubSessionId, onChanged])

  const phaseLabel = phase === 'downloading' ? '소스·녹음 내려받는 중…'
    : phase === 'mixing' ? `합성 중… ${Math.round(progress * 100)}%`
    : phase === 'uploading' ? '완성본 업로드 중…' : ''

  return (
    <div className="mt-4 border-t border-stage-border pt-4">
      <h3 className="text-xs font-semibold text-stage-text-muted">완성본 합성 (DUB-05)</h3>
      {error && <p className="mt-2 rounded bg-fire-hot/10 px-3 py-2 text-sm text-fire-hot" role="alert">{error}</p>}

      {/* 완료: 미리보기 + 다운로드 */}
      {isCompleted && outputUrl && (
        <div className="mt-2 space-y-2">
          <video src={outputUrl} controls className="w-full rounded-lg">
            <track kind="captions" />
          </video>
          <a
            href={outputUrl}
            download={`dub-${dubSessionId}.mp4`}
            className="inline-block rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base"
          >
            ⬇ 다운로드
          </a>
        </div>
      )}
      {isCompleted && !outputUrl && <p className="mt-2 text-sm text-stage-text-muted">완성본을 불러오는 중…</p>}

      {/* 진행 중(호스트 로컬 실행) */}
      {busy && <p className="mt-2 text-sm text-stage-text-muted">{phaseLabel}</p>}

      {/* 합성 시작 / 재시도 */}
      {!isCompleted && !busy && (
        isHost ? (
          <button
            onClick={() => void run()}
            disabled={!allSynced}
            className="mt-2 rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
          >
            {isCompositing || phase === 'error' ? '합성 다시 시도' : '합성 시작'}
          </button>
        ) : (
          <p className="mt-2 text-sm text-stage-text-muted">
            {isCompositing ? '호스트가 합성 중이에요…' : '호스트가 완성본을 합성할 수 있어요.'}
          </p>
        )
      )}
    </div>
  )
}
