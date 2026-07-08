// 진행 표현 프리미티브(트랙 B P-2). value 0..1 = 확정 진행(불씨 선단), null = 불확정(흐르는 바).
// 채움·불씨 색은 --scene-accent 연동(index.css .progress-*, DESIGN-DIRECTION §4.3) — 폴백 fire-amber.
export default function ProgressBar({ value, label }: { value: number | null; label?: string }) {
  const clamped = value == null ? null : Math.min(Math.max(value, 0), 1)
  return (
    <div>
      {label && <p className="mb-1.5 text-sm text-stage-text-muted">{label}</p>}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped == null ? undefined : Math.round(clamped * 100)}
        className={`h-1.5 rounded-full bg-stage-border ${clamped == null ? 'overflow-hidden' : ''}`}
      >
        {clamped == null ? (
          <div className="progress-indet h-full w-2/5 rounded-full" />
        ) : (
          <div
            className="progress-fill progress-ember relative h-full rounded-full transition-[width] duration-300"
            style={{ width: `${clamped * 100}%` }}
          />
        )}
      </div>
    </div>
  )
}
