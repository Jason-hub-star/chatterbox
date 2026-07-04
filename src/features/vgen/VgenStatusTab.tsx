import { useEffect, useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import { useVgenStore } from '@/stores/vgenStore'
import { getVgenUrl } from '@/lib/vgen'
import VgenPromptPanel from '@/features/vgen/VgenPromptPanel'

// VGEN 상태 탭(slice1): 잔액·프롬프트 열기(호스트)·생성 진행·최근 목록·재생.
// SSOT: docs/contracts/VgenPanel.md §VgenStatusTab

export default function VgenStatusTab({ roomId, isHost }: { roomId: string; isHost: boolean }) {
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
        <h2 className="text-sm font-semibold text-stage-text-muted">🎬 AI 영상생성</h2>
        <span className="text-xs text-stage-text-muted">크레딧 {balance}</span>
      </div>

      {isHost && !showPrompt && (
        <button onClick={() => setShowPrompt(true)}
          className="mt-2 rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base">
          프롬프트 열기
        </button>
      )}
      {showPrompt && <VgenPromptPanel roomId={roomId} onClose={() => setShowPrompt(false)} />}

      {isGenerating && (
        <p className="mt-3 text-sm text-stage-text-muted">
          생성 중… {currentJob?.status === 'generating' ? '영상 만드는 중이에요' : '요청 접수됨'}
        </p>
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
                <button onClick={() => play(j.id)} className="text-xs text-fire-amber">재생</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
