import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { fetchAvatarPresets, resolveAvatarUrl, thumbUrlFor, type AvatarPreset } from '@/lib/avatars'
import AvatarPreview from '@/features/avatar/AvatarPreview'
import SelfAvatar from '@/features/stage/SelfAvatar'
import CommissionCorner from '@/features/avatar/CommissionCorner'
import FeedbackModal from '@/components/shared/FeedbackModal'
import { useAvatarJobs } from '@/features/avatar/useAvatarJobs'
import InteriorShell from '@/pages/lobby/InteriorShell'

// 의상실(로비 v3 · v6 안 A) — 워크벤치 3열: 옷장(좌 그리드)→거울(중앙 대형)→커미션(우) 한 화면.
// 씬은 InteriorShell workbench 연출(0.9초 온전히→백드롭)로 물러난다 — "배경은 연출, 화면은 작업공간".
// 동선 한 축: 타일 클릭=입어보기(저장 안 함) → 거울 아래 [입기] 확정. 거울 [비춰보기]로 웹캠 트래킹 승급.
// 커미션 = 우측 상시 패널 + 옷장 하단 [주문] 버튼 이중 진입(위저드는 컨트롤드로 공유).
// 모바일(<md)은 거울→옷장→커미션 세로 스택(DOM 순서 그대로).
// 레거시 설정(언어·로그아웃)은 이 페이지에서 제거 — 로비 관할로 이관 예정(2026-07-09 결정).

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

// 거울 캔버스 크기 — 중앙 열을 최대한 채운다(주인님: "거울이 더 커야 함").
// 그리드 상수(좌 minmax(210,24%)·우 minmax(250,26%)·gap 20×2·px 24×2)와 동기 — 열 폭·뷰포트
// 높이 중 작은 쪽. 리사이즈(뷰포트·브레이크포인트) 추종은 디바운스 리스너로.
function computeMirrorSize(): number {
  if (!window.matchMedia('(min-width: 768px)').matches) return 190
  const vw = window.innerWidth
  const vh = window.innerHeight
  const side = Math.max(210, vw * 0.24) + Math.max(250, vw * 0.26) + 88
  return Math.max(190, Math.min(Math.round(vw - side - 24), Math.round(vh * 0.55), 520))
}
function useMirrorSize(): number {
  const [size, setSize] = useState(computeMirrorSize)
  useEffect(() => {
    let timer: number | undefined
    const on = () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => setSize(computeMirrorSize()), 250)
    }
    window.addEventListener('resize', on)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', on)
    }
  }, [])
  return size
}

interface WardrobeEntry extends AvatarPreset {
  jobId?: string
  isNew?: boolean
}

// 옷장 타일 — 정적 썸네일(<img> thumb.png) + 이름 + 착용/입어보기 상태. 그리드 칸에 맞춰 유동 폭.
// 썸네일 부재(커미션 등 미생성분)는 onError 폴백으로 이름만 — rig 렌더는 거울 1곳뿐이라
// 아바타가 쌓여도 첫 페인트가 느려지지 않는다.
function WardrobeTile({
  entry,
  worn,
  isTrying,
  disabled,
  onTry,
}: {
  entry: WardrobeEntry
  worn: boolean
  isTrying: boolean
  disabled: boolean
  onTry: () => void
}) {
  const { t } = useTranslation()
  const [thumbOk, setThumbOk] = useState(true)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={worn || isTrying}
      disabled={disabled}
      onClick={onTry}
      className={`w-full rounded-xl border p-2 text-center transition disabled:opacity-50 ${
        worn
          ? 'border-fire-amber bg-fire-amber/10'
          : isTrying
            ? 'border-dashed border-fire-amber/70'
            : 'border-stage-border hover:border-fire-amber/50'
      }`}
    >
      <span className="relative block aspect-square w-full overflow-hidden rounded-lg bg-[#f4f0e8]">
        {thumbOk ? (
          <img
            src={entry.thumbUrl ?? thumbUrlFor(entry.projectUrl)}
            alt=""
            loading="lazy"
            onError={() => setThumbOk(false)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="block h-full w-full bg-stage-border/40" aria-hidden />
        )}
        {entry.isNew && (
          <span className="absolute right-0 top-0 rounded-bl bg-fire-amber px-1 py-0.5 text-[9px] font-bold text-stage-base">
            {t('atelier.new')}
          </span>
        )}
      </span>
      <span
        className={`mt-1 block truncate text-[11px] font-semibold ${
          worn || isTrying ? 'text-fire-amber' : 'text-stage-text'
        }`}
      >
        {entry.name}
      </span>
      <span className="block h-3.5 text-[9px] text-stage-text-muted">
        {worn ? t('atelier.worn') : isTrying ? t('atelier.tryingBadge') : ''}
      </span>
    </button>
  )
}

export default function AtelierPage() {
  const { t } = useTranslation()
  const avatarUrl = useUserStore((s) => s.avatarUrl)
  const setMyAvatar = useUserStore((s) => s.setMyAvatar)
  const { jobs, loaded: jobsLoaded, submit, reused, dismissReused } = useAvatarJobs()
  const mirrorSize = useMirrorSize()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [presets, setPresets] = useState<AvatarPreset[]>([])
  const [loadingPresets, setLoadingPresets] = useState(true)
  const [live, setLive] = useState(false) // 거울 웹캠 트래킹(비춰보기)
  const [trying, setTrying] = useState<string | null>(null) // 입어보는 중(미저장) projectUrl
  const [seen, setSeen] = useState<string[]>(readSeen)
  const [wizardOpen, setWizardOpen] = useState(false) // 커미션 위저드 — 패널·옷장 버튼 공유
  const [feedbackOpen, setFeedbackOpen] = useState(false) // 문제 알리기(ISS-04 창구)

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

  // 옷장 단일 그리드: 내가 만든(최신·NEW 우선) → 기성.
  const wardrobe = useMemo<WardrobeEntry[]>(
    () => [...(jobsLoaded ? myAvatars : []), ...presets],
    [jobsLoaded, myAvatars, presets],
  )

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

  // 입어보기: 클릭=거울에 비침(저장 안 함). 입고 있거나 입어보던 걸 클릭하면 해제.
  const tryOn = (entry: WardrobeEntry) => {
    if (entry.jobId) markSeen(entry.jobId)
    setTrying(entry.projectUrl === current || entry.projectUrl === trying ? null : entry.projectUrl)
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

  return (
    <InteriorShell dest="profile" title={t('hub.profile.title')} workbench>
      <div className="flex flex-col gap-4 md:grid md:h-full md:grid-cols-[minmax(210px,24%)_1fr_minmax(250px,26%)] md:gap-5 md:px-6 md:pb-6 md:pt-16">
        {/* 중앙: 거울 — 입어보는(또는 입고 있는) 아바타가 비침, live 면 웹캠 트래킹으로 실시간.
            [입기] 확정·저장 실패 알림이 전부 여기 — 옷장→거울→확정 한 시선. */}
        <section className="text-center md:col-start-2 md:row-start-1 md:flex md:min-h-0 md:flex-col md:items-center md:justify-center">
          <div className="inline-flex flex-col items-center gap-2">
            <div className="mirror-frame mirror-frame--arch">
              {live ? (
                <SelfAvatar key={mirrorUrl} projectUrl={mirrorUrl} sendBlendshapes={noop} size={mirrorSize} />
              ) : (
                <AvatarPreview key={mirrorUrl} projectUrl={mirrorUrl} size={mirrorSize} />
              )}
            </div>
            {failed && (
              <p className="max-w-[240px] rounded bg-fire-hot/10 px-2.5 py-1.5 text-xs text-fire-hot" role="alert">
                {t('settings.avatarSaveFailed')}
              </p>
            )}
            {trying ? (
              <>
                <p className="max-w-[240px] rounded bg-stage-base/70 px-2 py-1 text-xs text-stage-text-muted backdrop-blur">
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
        </section>

        {/* 좌: 옷장 그리드 — 상시 노출, 클릭=입어보기. 하단 [주문] 버튼이 커미션 위저드 이중 진입. */}
        <section className="md:col-start-1 md:row-start-1 md:min-h-0">
          <div className="interior-panel flex flex-col !py-3 md:h-full">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-semibold">{t('atelier.wardrobe')}</p>
              <p className="text-xs text-stage-text-muted">{t('atelier.wardrobeHint')}</p>
            </div>
            <div className="mt-2 min-h-0 flex-1 md:overflow-y-auto">
              {loadingPresets ? (
                <div aria-label={t('settings.loadingAvatars')} className="grid grid-cols-3 gap-2 md:grid-cols-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-stage-border/40" />
                  ))}
                </div>
              ) : (
                <div role="radiogroup" aria-label={t('atelier.wardrobe')} className="grid grid-cols-3 gap-2 md:grid-cols-2">
                  {wardrobe.map((entry) => (
                    <WardrobeTile
                      key={entry.id}
                      entry={entry}
                      worn={entry.projectUrl === current && !trying}
                      isTrying={entry.projectUrl === trying}
                      disabled={saving}
                      onTry={() => tryOn(entry)}
                    />
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="mt-2 w-full rounded-xl border border-dashed border-fire-amber/60 py-2 text-xs font-semibold text-fire-amber transition hover:bg-fire-amber/10"
            >
              + {t('atelier.commissionNew')}
            </button>
          </div>
        </section>

        {/* 우: 커미션 공방 — 주문서·진행 스텝 상시 패널 */}
        <section className="md:col-start-3 md:row-start-1 md:min-h-0">
          <div className="interior-panel md:h-full md:overflow-y-auto">
            <CommissionCorner jobs={jobs} onSubmit={submit} wizardOpen={wizardOpen} onWizardToggle={setWizardOpen} reused={reused} onDismissReused={dismissReused} />
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="mt-3 w-full rounded-lg border border-stage-border py-1.5 text-[11px] text-stage-text-muted transition hover:text-stage-text"
            >
              {t('feedback.button')}
            </button>
          </div>
        </section>
      </div>
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} avatarJobId={myAvatars[0]?.jobId} />}
    </InteriorShell>
  )
}
