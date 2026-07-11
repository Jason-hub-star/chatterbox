import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '@/components/shared/Modal'
import ProgressBar from '@/components/shared/ProgressBar'
import { useToastStore } from '@/stores/toastStore'
import type { AvatarJob } from '@/types/avatarJob'

// 커미션 코너(의상실) — 주문 버튼 + 업로드 위저드 모달 + 4스텝 주문서 카드 + 실패 재주문.
// 계약: reference/patterns/avatar-forge-pipeline.md — fire-and-forget·실제-진행 스테퍼·실패 사유+재업로드.
// 잡 상태는 부모(useAvatarJobs) 소유 — 여기는 표현 + 제출 위저드만.

const PHASES = ['analyzing', 'cutting', 'rigging', 'finishing'] as const
const PHASE_KEY: Record<(typeof PHASES)[number], string> = {
  analyzing: 'atelier.phaseAnalyzing',
  cutting: 'atelier.phaseCutting',
  rigging: 'atelier.phaseRigging',
  finishing: 'atelier.phaseFinishing',
}
const MAX_BYTES = 10 * 1024 * 1024 // 버킷 file_size_limit(마이그)과 미러
const MIN_PX = 512

// 클라 선검증(PNG·10MB·최소 512px). 실패 시 i18n 키 반환, 통과 시 null.
async function validatePng(file: File): Promise<string | null> {
  if (file.type !== 'image/png') return 'atelier.validatePng'
  if (file.size > MAX_BYTES) return 'atelier.validateSize'
  const url = URL.createObjectURL(file)
  try {
    const ok = await new Promise<boolean>((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img.naturalWidth >= MIN_PX && img.naturalHeight >= MIN_PX)
      img.onerror = () => resolve(false)
      img.src = url
    })
    return ok ? null : 'atelier.validateDim'
  } finally {
    URL.revokeObjectURL(url)
  }
}

function OrderCard({ job }: { job: AvatarJob }) {
  const { t } = useTranslation()
  const idx = job.phase ? PHASES.indexOf(job.phase) : -1
  const progress = job.status === 'queued' || idx < 0 ? null : (idx + 0.5) / PHASES.length
  return (
    <div className="rounded-lg border border-stage-border bg-stage-base/50 p-3">
      <p className="text-xs text-stage-text-muted">{t('atelier.commissionEta')}</p>
      <ol className="mt-2 space-y-1" aria-label={t('atelier.commissionTitle')}>
        {PHASES.map((p, i) => {
          const state = idx > i ? 'done' : idx === i ? 'current' : 'pending'
          return (
            <li
              key={p}
              className={`flex items-center gap-2 text-xs ${
                state === 'current'
                  ? 'font-semibold text-fire-amber'
                  : state === 'done'
                    ? 'text-stage-text'
                    : 'text-stage-text-muted'
              }`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span
                aria-hidden
                className={`grid h-4 w-4 place-items-center rounded-full border text-[10px] ${
                  state === 'done'
                    ? 'border-fire-amber/60 text-fire-amber'
                    : state === 'current'
                      ? 'border-fire-amber text-fire-amber'
                      : 'border-stage-border'
                }`}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              {t(PHASE_KEY[p])}
            </li>
          )
        })}
      </ol>
      <div className="mt-2">
        <ProgressBar value={progress} />
      </div>
    </div>
  )
}

function UploadWizard({ onClose, onSubmit }: { onClose: () => void; onSubmit: (file: File) => Promise<void> }) {
  const { t } = useTranslation()
  const pushToast = useToastStore((s) => s.push)
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errKey, setErrKey] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null) // 서버측 동적 사유(엣지 에러 등)
  const [busy, setBusy] = useState(false)

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const accept = async (f: File | undefined) => {
    if (!f || busy) return
    setErrKey(null)
    setErrMsg(null)
    const err = await validatePng(f)
    if (err) {
      setErrKey(err)
      return
    }
    setFile(f)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
  }

  const order = async () => {
    if (!file || busy) return
    setBusy(true)
    setErrKey(null)
    setErrMsg(null)
    try {
      await onSubmit(file)
      pushToast('info', t('atelier.orderPlaced'))
      onClose()
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : t('atelier.orderFailedToast'))
      setBusy(false)
    }
  }

  return (
    <Modal title={t('atelier.uploadTitle')} onClose={onClose} widthClass="max-w-md">
      <div className="mt-3 space-y-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void accept(e.dataTransfer.files?.[0])
          }}
          className="grid w-full place-items-center gap-2 rounded-lg border border-dashed border-stage-border bg-stage-base/40 px-4 py-5 text-xs text-stage-text-muted hover:border-fire-amber/60 hover:text-stage-text"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" className="max-h-40 rounded-md" />
          ) : (
            <span>{t('atelier.uploadDrop')}</span>
          )}
          {file && <span className="text-[11px]">{file.name}</span>}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          className="hidden"
          onChange={(e) => void accept(e.target.files?.[0])}
        />

        {(errKey ?? errMsg) && (
          <p className="rounded bg-fire-hot/10 px-2.5 py-1.5 text-xs text-fire-hot" role="alert">
            {errKey ? t(errKey) : errMsg}
          </p>
        )}

        <div className="rounded-lg border border-stage-border bg-stage-base/40 p-3 text-xs">
          <p className="font-semibold text-spring-green">{t('atelier.guideGoodTitle')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-stage-text-muted">
            <li>{t('atelier.guideGood1')}</li>
            <li>{t('atelier.guideGood2')}</li>
          </ul>
          <p className="mt-2 font-semibold text-fire-hot">{t('atelier.guideBadTitle')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-stage-text-muted">
            <li>{t('atelier.guideBad1')}</li>
            <li>{t('atelier.guideBad2')}</li>
          </ul>
        </div>

        <p className="text-xs text-stage-text-muted">{t('atelier.commissionDesc')}</p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stage-border px-3 py-1.5 text-xs text-stage-text-muted hover:text-stage-text"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!file || busy}
            onClick={() => void order()}
            className="rounded-lg border border-fire-amber bg-fire-amber/15 px-3 py-1.5 text-xs font-semibold text-fire-amber disabled:opacity-50"
          >
            {busy ? t('atelier.ordering') : t('atelier.confirmOrder')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// 위저드 열림 상태는 부모 소유(컨트롤드) — 옷장 캐러셀 [+] 타일 등 외부 진입점이 같은 위저드를 연다.
export default function CommissionCorner({
  jobs,
  onSubmit,
  wizardOpen,
  onWizardToggle,
}: {
  jobs: AvatarJob[]
  onSubmit: (file: File) => Promise<void>
  wizardOpen: boolean
  onWizardToggle: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const active = jobs.find((j) => j.status === 'queued' || j.status === 'running')
  // 최신 잡이 실패면 사유 + 재주문 노출(활성 잡 있으면 주문서가 우선).
  const lastFailed = !active && jobs[0]?.status === 'failed' ? jobs[0] : null

  return (
    <div>
      <p className="text-sm font-semibold">{t('atelier.commissionTitle')}</p>
      <p className="mt-0.5 text-xs text-stage-text-muted">{t('atelier.commissionDesc')}</p>

      <div className="mt-2 space-y-2">
        {active && <OrderCard job={active} />}

        {lastFailed && (
          <div className="rounded-lg border border-fire-hot/40 bg-fire-hot/10 p-3">
            <p className="text-xs font-semibold text-fire-hot">{t('atelier.commissionFailed')}</p>
            {/* 실패 원문(파이썬 트레이스백 등)은 잡 레코드에만 — 사용자에겐 일반 안내(2026-07-11 첫 실런). */}
            <p className="mt-1 text-xs text-stage-text-muted">{t('atelier.commissionFailedHint')}</p>
          </div>
        )}

        {!active && (
          <button
            type="button"
            onClick={() => onWizardToggle(true)}
            className="w-full rounded-lg border border-fire-amber/60 bg-fire-amber/10 px-3 py-1.5 text-xs font-semibold text-fire-amber hover:bg-fire-amber/20"
          >
            {lastFailed ? t('atelier.retryUpload') : t('atelier.commissionNew')}
          </button>
        )}
      </div>

      {wizardOpen && <UploadWizard onClose={() => onWizardToggle(false)} onSubmit={onSubmit} />}
    </div>
  )
}
