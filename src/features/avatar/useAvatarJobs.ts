import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToastStore } from '@/stores/toastStore'
import { useUserStore } from '@/stores/userStore'
import {
  uploadAvatarPng,
  createAvatarJob,
  fetchMyAvatarJobs,
  subscribeToAvatarJob,
} from '@/lib/avatarJobs'
import type { AvatarJob } from '@/types/avatarJob'

// 커미션 잡 수명주기 훅 — 재진입 복원(fetchMyAvatarJobs) + 활성 잡 Realtime 구독 + 제출.
// dev 페이지(AvatarForgeDevPage) 배선을 의상실용으로 승격. 활성 잡은 한 번에 1개만 구독.
// 완성/실패 전이 토스트는 상태 ref 로 판정(React 업데이터 순수성 유지 — 업데이터 안 부작용 금지).
export function useAvatarJobs() {
  const { t } = useTranslation()
  const session = useUserStore((s) => s.session)
  const pushToast = useToastStore((s) => s.push)
  const [jobs, setJobs] = useState<AvatarJob[]>([])
  const [loaded, setLoaded] = useState(false)
  const unsubRef = useRef<(() => void) | null>(null)
  const statusRef = useRef(new Map<string, string>())

  const upsert = useCallback(
    (job: AvatarJob) => {
      const prev = statusRef.current.get(job.id)
      if (prev && prev !== job.status) {
        if (job.status === 'done') pushToast('success', t('atelier.commissionDone'))
        if (job.status === 'failed') pushToast('error', t('atelier.commissionFailed'))
      }
      statusRef.current.set(job.id, job.status)
      setJobs((list) =>
        list.some((j) => j.id === job.id)
          ? list.map((j) => (j.id === job.id ? job : j))
          : [job, ...list],
      )
    },
    [pushToast, t],
  )

  const watch = useCallback(
    (jobId: string) => {
      unsubRef.current?.()
      unsubRef.current = subscribeToAvatarJob(jobId, upsert)
    },
    [upsert],
  )

  useEffect(() => {
    let cancelled = false
    void fetchMyAvatarJobs().then((list) => {
      if (cancelled) return
      list.forEach((j) => statusRef.current.set(j.id, j.status))
      setJobs(list)
      setLoaded(true)
      const active = list.find((j) => j.status === 'queued' || j.status === 'running')
      if (active) watch(active.id)
    })
    return () => {
      cancelled = true
      unsubRef.current?.()
    }
  }, [watch])

  // PNG 제출 → 업로드 → 잡 생성 → 구독. fire-and-forget: 접수 즉시 낙관적 카드 표시.
  const submit = useCallback(
    async (file: File) => {
      if (!session) throw new Error(t('atelier.orderFailedToast'))
      const key = await uploadAvatarPng(file)
      const { job_id, status } = await createAvatarJob(session.access_token, key)
      upsert({
        id: job_id,
        userId: '',
        status,
        phase: null,
        resultProjectUrl: null,
        error: null,
        createdAt: new Date().toISOString(),
      })
      watch(job_id)
    },
    [session, t, upsert, watch],
  )

  return { jobs, loaded, submit }
}
