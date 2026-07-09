import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { fetchAvatarPresets, resolveAvatarUrl, type AvatarPreset } from '@/lib/avatars'
import AvatarPreview from '@/features/avatar/AvatarPreview'
import SelfAvatar from '@/features/stage/SelfAvatar'
import CommissionCorner from '@/features/avatar/CommissionCorner'
import { useAvatarJobs } from '@/features/avatar/useAvatarJobs'
import LanguageToggle from '@/components/shared/LanguageToggle'
import InteriorShell from '@/pages/lobby/InteriorShell'
import { useInterior } from '@/pages/lobby/useInterior'

// 의상실(로비 v3) — 레거시 전가: /settings 전체(아바타 선택·언어) + 로그아웃.
// 살아있는 앵커: 중앙 거울에 아바타가 비침 — [비춰보기]로 웹캠 트래킹 승급(권한은 의도적 행동 뒤).
// v4 수직화: 입어보기(클릭=거울 프리뷰 → [입기] 확정 저장) + 커미션(PNG→내 아바타 주문, Forge)
// + 내가 만든 아바타 섹션(done 잡, 미착용 NEW 배지 — localStorage).
const vars = (a: { l: number; t: number; w: number; h: number }) =>
  ({ '--al': `${a.l}%`, '--at': `${a.t}%`, '--aw': `${a.w}%` }) as React.CSSProperties

const noop = () => {}

const SEEN_KEY = 'cb.atelier.seenJobs'
const readSeen = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? (v as string[]) : []
  } catch {
    return []
  }
}

interface WardrobeEntry extends AvatarPreset {
  jobId?: string
  isNew?: boolean
}

export default function AtelierPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const interior = useInterior('profile')
  const avatarUrl = useUserStore((s) => s.avatarUrl)
  const logout = useUserStore((s) => s.logout)
  const setMyAvatar = useUserStore((s) => s.setMyAvatar)
  const { jobs, loaded: jobsLoaded, submit } = useAvatarJobs()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [presets, setPresets] = useState<AvatarPreset[]>([])
  const [loadingPresets, setLoadingPresets] = useState(true)
  const [live, setLive] = useState(false) // 거울 웹캠 트래킹(비춰보기)
  const [trying, setTrying] = useState<string | null>(null) // 입어보는 중(미저장) projectUrl
  const [seen, setSeen] = useState<string[]>(readSeen)

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
  const mirrorUrl = trying ?? current

  // 내가 만든 아바타(커미션 완성분) — 최신순. 미착용(NEW)은 localStorage seen 기준.
  const myAvatars = useMemo<WardrobeEntry[]>(
    () =>
      jobs
        .filter((j) => j.status === 'done' && j.resultProjectUrl)
        .map((j) => ({
          id: j.id,
          jobId: j.id,
          name: t('atelier.myAvatarItem', { date: new Date(j.createdAt).toLocaleDateString() }),
          projectUrl: j.resultProjectUrl as string,
          isNew: !seen.includes(j.id),
        })),
    [jobs, seen, t],
  )
  const hasUnseen = myAvatars.some((e) => e.isNew)

  const markSeen = (jobId: string) => {
    setSeen((prev) => {
      if (prev.includes(jobId)) return prev
      const next = [...prev, jobId]
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next))
      } catch {
        /* 저장 실패해도 배지만 남음 — 무해 */
      }
      return next
    })
  }

  // 입어보기: 클릭=거울에 비침(저장 안 함). 입고 있는 걸 클릭하면 입어보기 해제.
  const tryOn = (entry: WardrobeEntry) => {
    if (entry.jobId) markSeen(entry.jobId)
    setTrying(entry.projectUrl === current ? null : entry.projectUrl)
  }

  // 입기: 입어보던 아바타를 확정 저장.
  const wear = async () => {
    if (!trying || saving) return
    setSaving(true)
    setFailed(false)
    const ok = await setMyAvatar(trying)
    setSaving(false)
    if (ok) setTrying(null)
    else setFailed(true)
  }

  const renderEntry = (entry: WardrobeEntry) => {
    const worn = entry.projectUrl === current && !trying
    const isTrying = entry.projectUrl === trying
    return (
      <button
        key={entry.id}
        type="button"
        role="radio"
        aria-checked={worn || isTrying}
        disabled={saving}
        onClick={() => tryOn(entry)}
        className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-left text-xs font-semibold transition disabled:opacity-50 ${
          worn
            ? 'border-fire-amber bg-fire-amber/10 text-fire-amber'
            : isTrying
              ? 'border-dashed border-fire-amber/70 text-fire-amber'
              : 'border-stage-border text-stage-text hover:border-fire-amber/50'
        }`}
      >
        <span>
          {entry.name}
          {worn && ' ✓'}
        </span>
        {entry.isNew && (
          <span className="rounded bg-fire-amber/20 px-1.5 py-0.5 text-[10px] font-bold text-fire-amber">
            {t('atelier.new')}
          </span>
        )}
      </button>
    )
  }

  return (
    <InteriorShell dest="profile" title={t('hub.profile.title')}>
      {/* 거울 앵커: 입어보는(또는 입고 있는) 아바타가 비침 — live 면 웹캠 트래킹으로 실시간. */}
      {interior && (
        <div className="interior-anchor text-center" style={vars(interior.anchors.mirror)}>
          <div className="inline-flex flex-col items-center gap-2">
            <div className="relative">
              <div className="mirror-frame">
                {live ? (
                  <SelfAvatar key={mirrorUrl} projectUrl={mirrorUrl} sendBlendshapes={noop} size={190} />
                ) : (
                  <AvatarPreview key={mirrorUrl} projectUrl={mirrorUrl} size={190} />
                )}
              </div>
              {hasUnseen && !trying && (
                <span className="absolute -right-2 -top-2 rounded bg-fire-amber px-1.5 py-0.5 text-[10px] font-bold text-stage-base">
                  {t('atelier.new')}
                </span>
              )}
            </div>
            {trying ? (
              <>
                <p className="max-w-[190px] rounded bg-stage-base/70 px-2 py-1 text-xs text-stage-text-muted backdrop-blur">
                  {t('atelier.tryingHint')}
                </p>
                <button
                  onClick={() => void wear()}
                  disabled={saving}
                  className="rounded-lg border border-fire-amber bg-fire-amber/15 px-3 py-1.5 text-xs font-semibold text-fire-amber disabled:opacity-50"
                >
                  {saving ? t('atelier.wearing') : t('atelier.wear')}
                </button>
              </>
            ) : (
              <button
                onClick={() => setLive((v) => !v)}
                className="rounded-lg border border-stage-border bg-stage-base/70 px-3 py-1.5 text-xs text-stage-text-muted backdrop-blur hover:text-stage-text"
              >
                {live ? t('atelier.mirrorOff') : t('atelier.mirrorOn')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 좌측 패널: 옷장(내가 만든/기성) + 커미션 + 언어 — 진입 즉시 표시(설정 페이지 이전). */}
      <div className="interior-anchor md:!left-[4%] md:!top-[10%] md:!w-[30%]" style={{}}>
        <div className="interior-panel space-y-3 md:max-h-[70vh] md:overflow-y-auto">
          <div>
            <p className="text-sm font-semibold">{t('settings.avatar')}</p>
            <p className="mt-0.5 text-xs text-stage-text-muted">{t('settings.avatarDescription')}</p>
            {failed && (
              <p className="mt-1.5 rounded bg-fire-hot/10 px-2.5 py-1.5 text-xs text-fire-hot" role="alert">
                {t('settings.avatarSaveFailed')}
              </p>
            )}

            {jobsLoaded && myAvatars.length > 0 && (
              <>
                <p className="mt-2 text-xs font-semibold text-stage-text-muted">{t('atelier.myAvatars')}</p>
                <div className="mt-1 flex flex-col gap-1.5" role="radiogroup" aria-label={t('atelier.myAvatars')}>
                  {myAvatars.map(renderEntry)}
                </div>
              </>
            )}

            <p className="mt-2 text-xs font-semibold text-stage-text-muted">{t('atelier.presets')}</p>
            <div className="mt-1 flex flex-col gap-1.5" role="radiogroup" aria-label={t('settings.avatarSelection')}>
              {loadingPresets && (
                <div aria-label={t('settings.loadingAvatars')} className="space-y-1.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-7 animate-pulse rounded-lg bg-stage-border/40" />
                  ))}
                </div>
              )}
              {presets.map((p) => renderEntry(p))}
            </div>
          </div>

          <div className="border-t border-stage-border/60 pt-3">
            <CommissionCorner jobs={jobs} onSubmit={submit} />
          </div>

          <div className="border-t border-stage-border/60 pt-3">
            <p className="text-sm font-semibold">{t('settings.language')}</p>
            <div className="mt-1.5">
              <LanguageToggle />
            </div>
          </div>

          <div className="border-t border-stage-border/60 pt-3">
            <button
              onClick={() => {
                void logout().then(() => navigate('/', { replace: true }))
              }}
              className="rounded-lg border border-stage-border px-3 py-1.5 text-xs text-stage-text-muted hover:text-stage-text"
            >
              {t('lobby.logout')}
            </button>
          </div>
        </div>
      </div>
    </InteriorShell>
  )
}
