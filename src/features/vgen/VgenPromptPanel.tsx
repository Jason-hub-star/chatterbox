import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { useVgenStore } from '@/stores/vgenStore'
import { refineVgenPrompt } from '@/lib/vgen'
import { uploadAvatarReference } from '@/lib/avatarReference'
import { resolveAvatarUrl } from '@/lib/avatars'
import { creditCost as costOf, estimateUsd, RESOLUTIONS, type VgenResolution } from '@/lib/fal'
import CostConfirmDialog from '@/components/shared/CostConfirmDialog'

// VGEN 프롬프트 패널(slice1: 호스트 단일작성). 협업 LWW·커서 어웨어니스는 slice2.
// SSOT: docs/contracts/VgenPanel.md §VgenPromptPanel

const DURATIONS = [5, 10] // VGEN_MAX_SEC=10. 15초는 플래그 상향 후 slice2.
// 화면비(VGEN-11): 쇼츠 기본 9:16. Edge ALLOWED_AR(6종)의 부분집합 — 1:1 등은 UI 수요 생기면 추가.
const ASPECTS = ['9:16', '16:9'] as const
const MAX_PROMPT = 2000

export default function VgenPromptPanel({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const balance = useUserStore((s) => s.creditBalance)
  const session = useUserStore((s) => s.session)
  const avatarProjectUrl = resolveAvatarUrl(useUserStore((s) => s.avatarUrl)) // 내 아바타 project.json (미설정=기본)
  const generate = useVgenStore((s) => s.generate)
  const isGenerating = useVgenStore((s) => s.isGenerating)
  const error = useVgenStore((s) => s.error)
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState<VgenResolution>('720p')
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECTS)[number]>('9:16')
  const [confirm, setConfirm] = useState(false)
  const [refining, setRefining] = useState(false)
  const [refineErr, setRefineErr] = useState<string | null>(null)
  const [useMyCharacter, setUseMyCharacter] = useState(true) // reference-to-video: 내 아바타 고정
  const [preparing, setPreparing] = useState(false)

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
  const canSubmit = prompt.trim().length > 0 && !isGenerating && !preparing && balance >= cost

  const onGenerate = async () => {
    setConfirm(false)
    let imageUrls: string[] | undefined
    // 내 캐릭터 고정(reference-to-video): 아바타를 참조 시트로 렌더→R2 업로드→fal image_urls.
    if (useMyCharacter && avatarProjectUrl && session?.access_token) {
      setPreparing(true)
      setRefineErr(null)
      try {
        imageUrls = [await uploadAvatarReference(session.access_token, roomId, avatarProjectUrl)]
      } catch {
        setRefineErr(t('vgen.referenceFailed'))
        setPreparing(false)
        return
      }
      setPreparing(false)
    }
    await generate(roomId, prompt.trim(), duration, resolution, imageUrls, aspectRatio)
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

      {/* 화면비(VGEN-11): 세로 쇼츠 기본. 비용은 비율 무관(duration×해상도 가중)·dedup 해시에 비율 포함(캐시 교차 없음). */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-stage-text-muted">{t('vgen.aspectLabel')}</span>
        {ASPECTS.map((a) => (
          <button key={a} onClick={() => setAspectRatio(a)} aria-pressed={aspectRatio === a}
            className={`rounded-lg px-3 py-1 text-sm ${aspectRatio === a ? 'bg-fire-amber text-stage-base' : 'border border-stage-border text-stage-text-muted'}`}>
            {a === '9:16' ? t('vgen.aspect916') : t('vgen.aspect169')}
          </button>
        ))}
      </div>

      {avatarProjectUrl && (
        <label className="mt-2 flex items-center gap-2 text-xs text-stage-text-muted">
          <input type="checkbox" checked={useMyCharacter} onChange={(e) => setUseMyCharacter(e.target.checked)} />
          {t('vgen.myCharacter')}
        </label>
      )}

      {(error || refineErr) && <p className="mt-2 text-sm text-red-400">{error || refineErr}</p>}
      {balance < cost && <p className="mt-2 text-xs text-red-400">{t('vgen.insufficientCredits')}</p>}

      <button onClick={() => setConfirm(true)} disabled={!canSubmit}
        className="mt-3 w-full rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40">
        {preparing ? t('vgen.preparingReference') : isGenerating ? t('vgen.generating') : t('vgen.generateButton')}
      </button>

      <CostConfirmDialog open={confirm} creditCost={cost} balance={balance} onConfirm={onGenerate} onCancel={() => setConfirm(false)} />
    </section>
  )
}
