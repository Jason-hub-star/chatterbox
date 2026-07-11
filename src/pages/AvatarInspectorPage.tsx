import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { RigAvatar } from '@/lib/pixi/rig'

// 아바타 인스펙터 — 네이티브 rig(src/lib/pixi/rig) 렌더 검사 도구.
// ?project=<url> 로 임의 아바타를 렌더하고 슬라이더로 FFD 격자변형·키폼·눈커버·물리를 실증.
// 새 rig 배포 검증용(avatar-deploy 스킬이 사용). 기본 = 현 기본 아바타(유키).
const DEFAULT_PROJECT = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/yuki/project.json`

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

export default function AvatarInspectorPage() {
  const [searchParams] = useSearchParams()
  const projectUrl = searchParams.get('project') || DEFAULT_PROJECT
  const mountRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<RigAvatar | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [params, setParams] = useState<Record<string, number>>(
    () => Object.fromEntries(SLIDERS.map((s) => [s.id, s.def])),
  )

  useEffect(() => {
    let cancelled = false
    let created: RigAvatar | null = null
    const mount = mountRef.current
    if (mount) {
      RigAvatar.create(mount, { projectUrl, size: 480 })
        .then((av) => {
          if (cancelled) {
            av.destroy()
            return
          }
          created = av
          avatarRef.current = av
          setStatus('ready')
          if (import.meta.env.DEV) {
            ;(window as unknown as { __rigAvatar?: RigAvatar }).__rigAvatar = av
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
  }, [projectUrl])

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
          <h1 className="text-lg font-bold">아바타 인스펙터 — 네이티브 rig</h1>
          <p className="text-xs text-stage-text-muted">?project=&lt;url&gt; 로 임의 rig 검사 · 슬라이더로 파라미터 구동.</p>
        </div>
        <nav className="flex gap-4 text-sm text-stage-text-muted">
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
            네이티브 렌더 (src/lib/pixi/rig)
            {status === 'loading' && ' · 로딩 중…'}
            {status === 'ready' && ' · 렌더 중'}
            {status === 'error' && ' · 오류'}
          </figcaption>
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
