import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AriaAvatar } from '@/lib/pixi/aria'

// B1 게이트: 아리아 실 rig의 **네이티브 이식**(src/lib/pixi/aria) 미리보기.
// 왼쪽 = 네이티브 AriaAvatar(경로 B), 오른쪽 = aria-player 런타임 iframe(동일 project.json, ?renderer=pixi).
// 중립 포즈로 나란히 대조 → 픽셀/시각 정합 확인. 슬라이더로 FFD 격자변형·키폼·눈커버·물리를 실증.
// ponytail: 자동 픽셀 diff(Playwright)는 후속. B1은 시각 대조 게이트.
const ARIA_PROJECT = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/aria/project.json`
const REFERENCE_SRC = `/aria-player/index.html?renderer=pixi&project=${encodeURIComponent(ARIA_PROJECT)}`

interface Slider {
  id: string
  label: string
  min: number
  max: number
  step: number
  def: number
}

// 대표 채널: 머리 FFD(Angle) · 립싱크 키폼(MouthOpenY) · 눈커버(EyeOpen) · 입꼴(MouthForm).
const SLIDERS: Slider[] = [
  { id: 'ParamAngleX', label: '머리 좌우 (FFD)', min: -30, max: 30, step: 1, def: 0 },
  { id: 'ParamAngleY', label: '머리 상하 (FFD)', min: -30, max: 30, step: 1, def: 0 },
  { id: 'ParamAngleZ', label: '고개 기울임', min: -30, max: 30, step: 1, def: 0 },
  { id: 'ParamMouthOpenY', label: '입 벌림 (키폼)', min: 0, max: 1, step: 0.02, def: 0 },
  { id: 'ParamMouthForm', label: '입꼴 (−찡그림/+미소)', min: -1, max: 1, step: 0.02, def: 0 },
  { id: 'ParamEyeLOpen', label: '왼눈 개폐 (커버)', min: 0, max: 1, step: 0.02, def: 1 },
  { id: 'ParamEyeROpen', label: '오른눈 개폐 (커버)', min: 0, max: 1, step: 0.02, def: 1 },
]

export default function AriaNativePage() {
  const mountRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<AriaAvatar | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [params, setParams] = useState<Record<string, number>>(
    () => Object.fromEntries(SLIDERS.map((s) => [s.id, s.def])),
  )

  useEffect(() => {
    let cancelled = false
    let created: AriaAvatar | null = null
    const mount = mountRef.current
    if (mount) {
      AriaAvatar.create(mount, { projectUrl: ARIA_PROJECT, size: 480 })
        .then((av) => {
          if (cancelled) {
            av.destroy()
            return
          }
          created = av
          avatarRef.current = av
          setStatus('ready')
          if (import.meta.env.DEV) {
            ;(window as unknown as { __ariaAvatar?: AriaAvatar }).__ariaAvatar = av
          }
        })
        .catch((e: unknown) => {
          if (cancelled) return
          setStatus('error')
          setError(e instanceof Error ? e.message : String(e))
        })
    }
    return () => {
      cancelled = true
      created?.destroy()
      avatarRef.current = null
    }
  }, [])

  function onSlide(id: string, value: number) {
    setParams((prev) => ({ ...prev, [id]: value }))
    avatarRef.current?.setParams({ [id]: value })
  }

  function reset() {
    const neutral = Object.fromEntries(SLIDERS.map((s) => [s.id, s.def]))
    setParams(neutral)
    avatarRef.current?.setParams(neutral)
  }

  return (
    <main className="flex min-h-screen flex-col bg-stage-base text-stage-text">
      <header className="flex items-center justify-between border-b border-stage-border px-6 py-3">
        <div>
          <h1 className="text-lg font-bold">아리아 — 네이티브 rig (경로 B, B1 게이트)</h1>
          <p className="text-xs text-stage-text-muted">
            왼쪽 = 네이티브 이식 렌더 · 오른쪽 = aria-player 런타임(동일 project.json). 중립 포즈 대조.
          </p>
        </div>
        <nav className="flex gap-4 text-sm text-stage-text-muted">
          <Link to="/avatar-aria-self" className="hover:text-stage-text">
            웹캠 self drive (B2)
          </Link>
          <Link to="/avatar-aria" className="hover:text-stage-text">
            iframe PoC
          </Link>
          <Link to="/" className="hover:text-stage-text">
            홈
          </Link>
        </nav>
      </header>

      <div className="flex flex-wrap items-start justify-center gap-8 p-6">
        <figure className="flex flex-col items-center gap-2">
          <div
            ref={mountRef}
            className="overflow-hidden rounded-lg border border-stage-border bg-[#f4f0e8]"
            style={{ width: 480, height: 480 }}
            aria-label="네이티브 아바타 캔버스"
          />
          <figcaption className="text-xs text-stage-text-muted">
            네이티브 이식 (src/lib/pixi/aria)
            {status === 'loading' && ' · 로딩 중…'}
            {status === 'ready' && ' · 렌더 중'}
            {status === 'error' && ' · 오류'}
          </figcaption>
        </figure>

        <figure className="flex flex-col items-center gap-2">
          <iframe
            src={REFERENCE_SRC}
            title="aria-player 런타임 참조"
            className="rounded-lg border border-stage-border"
            style={{ width: 480, height: 480 }}
          />
          <figcaption className="text-xs text-stage-text-muted">aria-player 런타임 (참조 골든)</figcaption>
        </figure>

        <div className="flex w-64 flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">파라미터 구동</span>
            <button
              type="button"
              onClick={reset}
              className="rounded border border-stage-border px-2 py-0.5 text-xs hover:bg-stage-border/30"
            >
              중립 복귀
            </button>
          </div>
          {SLIDERS.map((s) => (
            <label key={s.id} className="flex flex-col gap-1 text-xs text-stage-text-muted">
              <span className="flex justify-between">
                <span>{s.label}</span>
                <span className="tabular-nums">{params[s.id].toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={params[s.id]}
                onChange={(e) => onSlide(s.id, Number(e.target.value))}
                disabled={status !== 'ready'}
              />
            </label>
          ))}
        </div>
      </div>

      {error && (
        <p className="mx-6 rounded-lg bg-fire-hot/10 px-4 py-2 text-sm text-fire-hot" role="alert">
          로드 실패: {error}
        </p>
      )}
    </main>
  )
}
