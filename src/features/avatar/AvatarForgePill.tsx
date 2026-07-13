import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { fetchMyAvatarJobs, subscribeToAvatarJob } from '@/lib/avatarJobs'
import type { AvatarJob } from '@/types/avatarJob'

const PHASE_KEY: Record<NonNullable<AvatarJob['phase']>, string> = {
  analyzing: 'atelier.phaseAnalyzing',
  cutting: 'atelier.phaseCutting',
  rigging: 'atelier.phaseRigging',
  finishing: 'atelier.phaseFinishing',
}

// 전역 진행 pill(대기 UX #22): 광장 헤더에 활성 아바타 잡을 상시 노출 — 로비를 돌아다녀도 "제작 중"이 보인다.
// 완료 알림은 NotificationBell(트리거) 담당 → pill 은 표시 전용(토스트 재발화 안 함, 중복 방지). 활성 잡 없으면 null.
// AtelierPage 와 다른 라우트라 useAvatarJobs 와 동시 구독 안 됨(채널 토픽도 avatar_job:<id> 로 분리).
export default function AvatarForgePill() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const appUserId = useUserStore((s) => s.appUserId)
  const [job, setJob] = useState<AvatarJob | null>(null)

  useEffect(() => {
    if (!appUserId) return
    let cancelled = false
    let unsub: (() => void) | null = null
    void fetchMyAvatarJobs().then((list) => {
      if (cancelled) return
      const active = list.find((j) => j.status === 'queued' || j.status === 'running')
      if (!active) return
      setJob(active)
      unsub = subscribeToAvatarJob(active.id, (j) => {
        setJob(j.status === 'queued' || j.status === 'running' ? j : null)
      })
    })
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [appUserId])

  if (!job) return null
  const phaseLabel = job.phase ? t(PHASE_KEY[job.phase]) : null

  return (
    <button
      type="button"
      onClick={() => navigate('/lobby/atelier')}
      aria-label={t('atelier.forgePill')}
      className="flex items-center gap-2 rounded-full border border-fire-amber/40 bg-stage-base/60 px-3 py-2 text-xs text-fire-amber backdrop-blur-sm transition hover:bg-stage-base/80"
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-fire-amber motion-safe:animate-pulse" />
      <span className="font-semibold">{t('atelier.forgePill')}</span>
      {phaseLabel && <span className="text-stage-text-muted">· {phaseLabel}</span>}
    </button>
  )
}
