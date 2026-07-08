import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { useVgenStore } from '@/stores/vgenStore'
import { getVgenUrl } from '@/lib/vgen'
import { etaProgress } from '@/lib/vgenEta'
import ProgressBar from '@/components/shared/ProgressBar'
import VgenPromptPanel from '@/features/vgen/VgenPromptPanel'

// VGEN 상태 탭(slice1): 잔액·프롬프트 열기(호스트)·생성 진행·최근 목록·재생.
// SSOT: docs/contracts/VgenPanel.md §VgenStatusTab

// 생성 진행 표현(트랙 B P-2): A-SEAM-2 의 currentJobEtaSec 를 바+남은시간으로.
// 경과 기준은 job.createdAt(realtime 첫 이벤트 전엔 null → 마운트 시각 폴백, 오차 수 초 무시 가능).
function VgenProgress({ statusText, createdAt }: { statusText: string; createdAt: string | null }) {
  const { t } = useTranslation()
  const etaSec = useVgenStore((s) => s.currentJobEtaSec)
  // 시계는 state 로만(레이지 초기화 1회 + 이펙트 틱) — 렌더 순수성(react-hooks/purity·refs·set-state-in-effect) 준수.
  const [clock, setClock] = useState(() => {
    const t0 = Date.now()
    return { start: t0, now: t0 }
  })
  useEffect(() => {
    const id = setInterval(() => setClock((c) => ({ ...c, now: Date.now() })), 1000)
    return () => clearInterval(id)
  }, [])
  if (etaSec == null) return <p className="text-sm text-stage-text-muted">{statusText}</p>
  const parsed = createdAt ? Date.parse(createdAt) : NaN
  const startMs = Number.isFinite(parsed) ? parsed : clock.start
  const { ratio, remainingSec } = etaProgress((clock.now - startMs) / 1000, etaSec)
  return (
    <div>
      <ProgressBar value={ratio} label={statusText} />
      <p className="mt-1.5 text-xs text-stage-text-muted tabular-nums">
        {remainingSec > 0 ? t('vgen.etaRemaining', { sec: remainingSec }) : t('vgen.etaAlmost')}
      </p>
    </div>
  )
}

export default function VgenStatusTab({
  roomId,
  isHost,
  onShare,
}: {
  roomId: string
  isHost: boolean
  onShare: (jobId: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const balance = useUserStore((s) => s.creditBalance)
  const token = useUserStore((s) => s.session?.access_token)
  const recentJobs = useVgenStore((s) => s.recentJobs)
  const isGenerating = useVgenStore((s) => s.isGenerating)
  const currentJob = useVgenStore((s) => s.currentJob)
  const loadRecent = useVgenStore((s) => s.loadRecent)
  const [showPrompt, setShowPrompt] = useState(false)
  const [playUrl, setPlayUrl] = useState<string | null>(null)

  useEffect(() => { void loadRecent(roomId) }, [roomId, loadRecent])

  const play = async (jobId: string) => {
    if (!token) return
    try { setPlayUrl(await getVgenUrl(token, jobId)) } catch { /* 무시 */ }
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stage-text-muted">🎬 {t('vgen.tabTitle')}</h2>
        <span className="text-xs text-stage-text-muted">{t('vgen.creditBalance', { balance })}</span>
      </div>

      {isHost && !showPrompt && (
        <button onClick={() => setShowPrompt(true)}
          className="mt-2 rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base">
          {t('vgen.promptOpenButton')}
        </button>
      )}
      {showPrompt && <VgenPromptPanel roomId={roomId} onClose={() => setShowPrompt(false)} />}

      {isGenerating && (
        <div className="mt-3">
          <VgenProgress
            statusText={currentJob?.status === 'generating' ? t('vgen.generatingMaking') : t('vgen.generatingRequested')}
            createdAt={currentJob?.createdAt ?? null}
          />
        </div>
      )}

      {playUrl && (
        <video src={playUrl} controls className="mt-3 w-full max-w-xl rounded-lg">
          <track kind="captions" />
        </video>
      )}

      {recentJobs.length > 0 && (
        <ul className="mt-3 space-y-1">
          {recentJobs.map((j) => (
            <li key={j.id} className="flex items-center gap-2 rounded-lg border border-stage-border px-3 py-2 text-sm">
              <span className="flex-1 truncate text-stage-text">{j.promptText}</span>
              <span className="text-xs text-stage-text-muted">{j.status} · {j.creditCost}cr</span>
              {j.status === 'done' && (
                <button onClick={() => play(j.id)} className="text-xs text-stage-text-muted hover:text-stage-text">{t('vgen.playButton')}</button>
              )}
              {j.status === 'done' && isHost && (
                <button onClick={() => void onShare(j.id)} className="text-xs font-semibold text-fire-amber">{t('vgen.shareButton')}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
