import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useUserStore } from '@/stores/userStore'
import { fetchAvatarPresets, resolveAvatarUrl, type AvatarPreset } from '@/lib/avatars'
import AvatarPreview from '@/features/avatar/AvatarPreview'

export default function SettingsPage() {
  const avatarUrl = useUserStore((s) => s.avatarUrl)
  const setMyAvatar = useUserStore((s) => s.setMyAvatar)
  const [savingUrl, setSavingUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [presets, setPresets] = useState<AvatarPreset[]>([])
  const [loadingPresets, setLoadingPresets] = useState(true)

  // 선택 가능한 아바타 = Storage 매니페스트(배포 스크립트가 유지) → 새 아바타가 재빌드 없이 나타남.
  useEffect(() => {
    let cancelled = false
    fetchAvatarPresets().then((p) => {
      if (cancelled) return
      setPresets(p)
      setLoadingPresets(false)
    })
    return () => { cancelled = true }
  }, [])

  const current = resolveAvatarUrl(avatarUrl)

  const pick = async (url: string) => {
    if (url === current) return
    setSavingUrl(url)
    setFailed(false)
    const ok = await setMyAvatar(url)
    setSavingUrl(null)
    if (!ok) setFailed(true)
  }

  return (
    <main className="min-h-screen bg-stage-base text-stage-text p-8">
      <h1 className="text-3xl font-bold">설정</h1>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">아바타</h2>
        <p className="mt-1 text-sm text-stage-text-muted">방에서 다른 사람에게 보일 내 아바타를 골라요.</p>
        {failed && (
          <p className="mt-2 rounded bg-fire-hot/10 px-3 py-2 text-sm text-fire-hot" role="alert">
            아바타 저장에 실패했어요. 다시 시도해 주세요.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-6">
          <AvatarPreview projectUrl={current} size={200} />

          <div className="flex flex-col gap-2" role="radiogroup" aria-label="아바타 선택">
            {loadingPresets && <p className="text-sm text-stage-text-muted">아바타 목록 불러오는 중…</p>}
            {presets.map((p) => {
              const selected = p.projectUrl === current
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={savingUrl !== null}
                  onClick={() => void pick(p.projectUrl)}
                  className={`rounded-lg border px-4 py-2 text-left text-sm font-semibold transition disabled:opacity-50 ${
                    selected
                      ? 'border-fire-amber bg-fire-amber/10 text-fire-amber'
                      : 'border-stage-border text-stage-text hover:border-fire-amber/50'
                  }`}
                >
                  {p.name}
                  {selected && ' ✓'}
                  {savingUrl === p.projectUrl && ' …'}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <p className="mt-8 text-sm text-stage-text-muted">오디오·성능·크레딧 (Phase 4에서 구현)</p>
      <Link to="/" className="mt-6 inline-block text-fire-amber">
        ← 홈
      </Link>
    </main>
  )
}
