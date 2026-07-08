import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { fetchAvatarPresets, resolveAvatarUrl, type AvatarPreset } from '@/lib/avatars'
import AvatarPreview from '@/features/avatar/AvatarPreview'
import SelfAvatar from '@/features/stage/SelfAvatar'
import LanguageToggle from '@/components/shared/LanguageToggle'
import InteriorShell from '@/pages/lobby/InteriorShell'
import { useInterior } from '@/pages/lobby/useInterior'

// 의상실(로비 v3) — 레거시 전가: /settings 전체(아바타 선택·언어). 살아있는 앵커: 중앙 거울에
// 고른 아바타가 비침(기본 정적 프리뷰) — [비춰보기]로 웹캠 트래킹 승급(권한은 의도적 행동 뒤).
const vars = (a: { l: number; t: number; w: number; h: number }) =>
  ({ '--al': `${a.l}%`, '--at': `${a.t}%`, '--aw': `${a.w}%` }) as React.CSSProperties

const noop = () => {}

export default function AtelierPage() {
  const { t } = useTranslation()
  const interior = useInterior('profile')
  const avatarUrl = useUserStore((s) => s.avatarUrl)
  const setMyAvatar = useUserStore((s) => s.setMyAvatar)
  const [savingUrl, setSavingUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [presets, setPresets] = useState<AvatarPreset[]>([])
  const [loadingPresets, setLoadingPresets] = useState(true)
  const [live, setLive] = useState(false) // 거울 웹캠 트래킹(비춰보기)

  useEffect(() => {
    let cancelled = false
    fetchAvatarPresets().then((p) => {
      if (cancelled) return
      setPresets(p)
      setLoadingPresets(false)
    })
    return () => {
      cancelled = true
    }
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
    <InteriorShell dest="profile" title={t('hub.profile.title')}>
      {/* 거울 앵커: 고른 아바타가 비침 — live 면 웹캠 트래킹으로 실시간. */}
      {interior && (
        <div className="interior-anchor text-center" style={vars(interior.anchors.mirror)}>
          <div className="inline-flex flex-col items-center gap-2">
            <div className="mirror-frame">
              {live ? (
                <SelfAvatar key={current} projectUrl={current} sendBlendshapes={noop} size={190} />
              ) : (
                <AvatarPreview key={current} projectUrl={current} size={190} />
              )}
            </div>
            <button
              onClick={() => setLive((v) => !v)}
              className="rounded-lg border border-stage-border bg-stage-base/70 px-3 py-1.5 text-xs text-stage-text-muted backdrop-blur hover:text-stage-text"
            >
              {live ? t('atelier.mirrorOff') : t('atelier.mirrorOn')}
            </button>
          </div>
        </div>
      )}

      {/* 좌측 패널: 아바타 프리셋 + 언어 — 진입 즉시 표시(설정 페이지 이전). */}
      <div className="interior-anchor md:!left-[4%] md:!top-[10%] md:!w-[30%]" style={{}}>
        <div className="interior-panel space-y-3">
          <div>
            <p className="text-sm font-semibold">{t('settings.avatar')}</p>
            <p className="mt-0.5 text-xs text-stage-text-muted">{t('settings.avatarDescription')}</p>
            {failed && (
              <p className="mt-1.5 rounded bg-fire-hot/10 px-2.5 py-1.5 text-xs text-fire-hot" role="alert">
                {t('settings.avatarSaveFailed')}
              </p>
            )}
            <div className="mt-2 flex flex-col gap-1.5" role="radiogroup" aria-label={t('settings.avatarSelection')}>
              {loadingPresets && <p className="text-xs text-stage-text-muted">{t('settings.loadingAvatars')}</p>}
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
                    className={`rounded-lg border px-3 py-1.5 text-left text-xs font-semibold transition disabled:opacity-50 ${
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
          <div>
            <p className="text-sm font-semibold">{t('settings.language')}</p>
            <div className="mt-1.5">
              <LanguageToggle />
            </div>
          </div>
        </div>
      </div>
    </InteriorShell>
  )
}
