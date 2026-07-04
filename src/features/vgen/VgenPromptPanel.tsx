import { useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import { useVgenStore } from '@/stores/vgenStore'
import { creditCost as costOf, estimateUsd } from '@/lib/fal'
import CostConfirmDialog from '@/components/shared/CostConfirmDialog'

// VGEN 프롬프트 패널(slice1: 호스트 단일작성). 협업 LWW·커서 어웨어니스는 slice2.
// SSOT: docs/contracts/VgenPanel.md §VgenPromptPanel

const DURATIONS = [5, 10] // VGEN_MAX_SEC=10. 15초는 플래그 상향 후 slice2.
const MAX_PROMPT = 2000

export default function VgenPromptPanel({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const balance = useUserStore((s) => s.creditBalance)
  const generate = useVgenStore((s) => s.generate)
  const isGenerating = useVgenStore((s) => s.isGenerating)
  const error = useVgenStore((s) => s.error)
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(5)
  const [confirm, setConfirm] = useState(false)

  const cost = costOf(duration)
  const canSubmit = prompt.trim().length > 0 && !isGenerating && balance >= cost

  const onGenerate = async () => {
    setConfirm(false)
    await generate(roomId, prompt.trim(), duration)
  }

  return (
    <section className="mt-4 rounded-lg border border-stage-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stage-text">🎬 AI 영상 생성</h3>
        <button onClick={onClose} className="text-xs text-stage-text-muted hover:text-stage-text">닫기</button>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT))}
        placeholder="만들고 싶은 장면을 설명해 주세요 (예: 노을 지는 바닷가를 걷는 소녀)"
        rows={3}
        className="mt-3 w-full resize-none rounded-lg border border-stage-border bg-transparent p-2 text-sm text-stage-text placeholder:text-stage-text-muted"
      />
      <div className="mt-1 text-right text-xs text-stage-text-muted">{prompt.length} / {MAX_PROMPT}</div>

      <div className="mt-2 flex items-center gap-2">
        {DURATIONS.map((d) => (
          <button key={d} onClick={() => setDuration(d)}
            className={`rounded-lg px-3 py-1 text-sm ${duration === d ? 'bg-fire-amber text-stage-base' : 'border border-stage-border text-stage-text-muted'}`}>
            {d}초 · {costOf(d)}크레딧
          </button>
        ))}
        <span className="ml-auto text-xs text-stage-text-muted">잔액 {balance} · 약 ${estimateUsd(duration)}</span>
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {balance < cost && <p className="mt-2 text-xs text-red-400">크레딧이 부족해요.</p>}

      <button onClick={() => setConfirm(true)} disabled={!canSubmit}
        className="mt-3 w-full rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40">
        {isGenerating ? '생성 중…' : '영상 생성'}
      </button>

      <CostConfirmDialog open={confirm} creditCost={cost} balance={balance} onConfirm={onGenerate} onCancel={() => setConfirm(false)} />
    </section>
  )
}
