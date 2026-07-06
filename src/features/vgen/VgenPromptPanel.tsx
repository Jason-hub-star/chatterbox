import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { useVgenStore } from '@/stores/vgenStore'
import { refineVgenPrompt } from '@/lib/vgen'
import { creditCost as costOf, estimateUsd, RESOLUTIONS, type VgenResolution } from '@/lib/fal'
import CostConfirmDialog from '@/components/shared/CostConfirmDialog'

// VGEN 프롬프트 패널(slice1: 호스트 단일작성). 협업 LWW·커서 어웨어니스는 slice2.
// SSOT: docs/contracts/VgenPanel.md §VgenPromptPanel

const DURATIONS = [5, 10] // VGEN_MAX_SEC=10. 15초는 플래그 상향 후 slice2.
const MAX_PROMPT = 2000

export default function VgenPromptPanel({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const balance = useUserStore((s) => s.creditBalance)
  const session = useUserStore((s) => s.session)
  const generate = useVgenStore((s) => s.generate)
  const isGenerating = useVgenStore((s) => s.isGenerating)
  const error = useVgenStore((s) => s.error)
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState<VgenResolution>('720p')
  const [confirm, setConfirm] = useState(false)
  const [refining, setRefining] = useState(false)
  const [refineErr, setRefineErr] = useState<string | null>(null)

  const onRefine = async () => {
    const token = session?.access_token
    if (!token || !prompt.trim()) return
    setRefining(true)
    setRefineErr(null)
    try {
      const { refined_prompt } = await refineVgenPrompt(token, roomId, prompt.trim())
      setPrompt(refined_prompt.slice(0, MAX_PROMPT))
    } catch (e) {
      setRefineErr(e instanceof Error ? e.message : t('vgen.refineError'))
    } finally {
      setRefining(false)
    }
  }

  const cost = costOf(duration, resolution)
  const canSubmit = prompt.trim().length > 0 && !isGenerating && balance >= cost

  const onGenerate = async () => {
    setConfirm(false)
    await generate(roomId, prompt.trim(), duration, resolution)
  }

  return (
    <section className="mt-4 rounded-lg border border-stage-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stage-text">🎬 {t('vgen.title')}</h3>
        <button onClick={onClose} className="text-xs text-stage-text-muted hover:text-stage-text">{t('common.close')}</button>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT))}
        placeholder={t('vgen.promptPlaceholder')}
        rows={3}
        className="mt-3 w-full resize-none rounded-lg border border-stage-border bg-transparent p-2 text-sm text-stage-text placeholder:text-stage-text-muted"
      />
      <div className="mt-1 flex items-center justify-between">
        <button onClick={onRefine} disabled={!prompt.trim() || refining || isGenerating}
          className="rounded-lg border border-stage-border px-3 py-1 text-xs text-stage-text-muted hover:text-stage-text disabled:opacity-40">
          {refining ? t('vgen.refining') : t('vgen.refineButton')}
        </button>
        <span className="text-xs text-stage-text-muted">{prompt.length} / {MAX_PROMPT}</span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {DURATIONS.map((d) => (
          <button key={d} onClick={() => setDuration(d)}
            className={`rounded-lg px-3 py-1 text-sm ${duration === d ? 'bg-fire-amber text-stage-base' : 'border border-stage-border text-stage-text-muted'}`}>
            {t('vgen.durationLabel', { seconds: d, cost: costOf(d, resolution) })}
          </button>
        ))}
        <span className="ml-auto text-xs text-stage-text-muted">{t('vgen.balanceEstimate', { balance, usd: estimateUsd(duration, resolution) })}</span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-stage-text-muted">{t('vgen.resolution')}</span>
        {RESOLUTIONS.map((r) => (
          <button key={r} onClick={() => setResolution(r)} aria-pressed={resolution === r}
            className={`rounded-lg px-3 py-1 text-sm ${resolution === r ? 'bg-fire-amber text-stage-base' : 'border border-stage-border text-stage-text-muted'}`}>
            {r}
          </button>
        ))}
      </div>

      {(error || refineErr) && <p className="mt-2 text-sm text-red-400">{error || refineErr}</p>}
      {balance < cost && <p className="mt-2 text-xs text-red-400">{t('vgen.insufficientCredits')}</p>}

      <button onClick={() => setConfirm(true)} disabled={!canSubmit}
        className="mt-3 w-full rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40">
        {isGenerating ? t('vgen.generating') : t('vgen.generateButton')}
      </button>

      <CostConfirmDialog open={confirm} creditCost={cost} balance={balance} onConfirm={onGenerate} onCancel={() => setConfirm(false)} />
    </section>
  )
}
