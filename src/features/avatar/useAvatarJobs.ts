import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToastStore } from '@/stores/toastStore'
import { useUserStore } from '@/stores/userStore'
import {
  uploadAvatarPng,
  createAvatarJob,
  fetchMyAvatarJobs,
  subscribeToAvatarJob,
  sha256Hex,
  pickFreshCompleted,
} from '@/lib/avatarJobs'
import type { AvatarJob } from '@/types/avatarJob'

// X1(AVATAR-DONE-NOTIFY): "완성 통지했나" 셋 — 옷장 NEW 배지(AtelierPage cb.atelier.seenJobs=입어봤나)와
// 별개 개념(이 완성을 재진입 배너로 통지했나). 라이브 완성은 토스트로, 자리 비운 사이 완성분은 배너로 1회.
const NOTIFIED_KEY = 'cb.avatar.notifiedDone'
function loadNotified(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY)
    return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}
function persistNotified(set: Set<string>) {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set]))
  } catch {
    /* quota/스토리지 비활성 — 통지만 못 기억, 무해 */
  }
}

// 커미션 잡 수명주기 훅 — 재진입 복원(fetchMyAvatarJobs) + 활성 잡 Realtime 구독 + 제출.
// dev 페이지(AvatarForgeDevPage) 배선을 의상실용으로 승격. 활성 잡은 한 번에 1개만 구독.
// 완성/실패 전이 토스트는 상태 ref 로 판정(React 업데이터 순수성 유지 — 업데이터 안 부작용 금지).
export function useAvatarJobs() {
  const { t } = useTranslation()
  const session = useUserStore((s) => s.session)
  const pushToast = useToastStore((s) => s.push)
  const [jobs, setJobs] = useState<AvatarJob[]>([])
  const [loaded, setLoaded] = useState(false)
  const [reused, setReused] = useState(false) // 디덥 캐시 히트 인지 배너(§6). 새 제출/닫기로 해제.
  const [awayDone, setAwayDone] = useState(0) // 자리 비운 사이 완성된 커미션 수(재진입 배너). 닫기로 해제.
  const unsubRef = useRef<(() => void) | null>(null)
  const statusRef = useRef(new Map<string, string>())
  const notifiedRef = useRef<Set<string> | null>(null) // 완성 통지 셋(localStorage 백업, lazy 로드)
  const dismissReused = useCallback(() => setReused(false), [])
  const dismissAwayDone = useCallback(() => setAwayDone(0), [])

  const upsert = useCallback(
    (job: AvatarJob) => {
      const prev = statusRef.current.get(job.id)
      if (prev && prev !== job.status) {
        if (job.status === 'done') pushToast('success', t('atelier.commissionDone'))
        if (job.status === 'failed') pushToast('error', t('atelier.commissionFailed'))
      }
      statusRef.current.set(job.id, job.status)
      // 라이브 완성은 위 토스트로 통지됨 → notified 셋에 기록해 재진입 배너 중복 방지(캐시 히트 재주문 포함).
      if (job.status === 'done') {
        const seen = (notifiedRef.current ??= loadNotified())
        if (!seen.has(job.id)) {
          seen.add(job.id)
          persistNotified(seen)
        }
      }
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
    const firstRun = localStorage.getItem(NOTIFIED_KEY) === null
    const seen = (notifiedRef.current ??= loadNotified())
    void fetchMyAvatarJobs().then((list) => {
      if (cancelled) return
      list.forEach((j) => statusRef.current.set(j.id, j.status))
      setJobs(list)
      setLoaded(true)
      // X1: 자리 비운 사이 완성된 잡 감지 → 재진입 배너. firstRun 은 통지 없이 시딩만(첫 방문 스팸 방지).
      const doneIds = list.filter((j) => j.status === 'done').map((j) => j.id)
      const { fresh, seed } = pickFreshCompleted(doneIds, seen, firstRun)
      if (seed.length > 0) {
        seed.forEach((id) => seen.add(id))
        persistNotified(seen)
      }
      if (fresh.length > 0) setAwayDone(fresh.length)
      const active = list.find((j) => j.status === 'queued' || j.status === 'running')
      if (active) watch(active.id)
    })
    return () => {
      cancelled = true
      unsubRef.current?.()
    }
  }, [watch])

  // PNG 제출 → 해시 → 업로드 → 잡 생성 → 구독. fire-and-forget: 접수 즉시 낙관적 카드 표시.
  // 디덥 히트면 서버가 status='done' 을 즉시 반환 → 구독 없이 완료 처리 + 재사용 배너(§6).
  const submit = useCallback(
    async (file: File) => {
      if (!session) throw new Error(t('atelier.orderFailedToast'))
      setReused(false)
      const hash = await sha256Hex(file)
      const key = await uploadAvatarPng(file)
      const { job_id, status, result_project_url } = await createAvatarJob(session.access_token, key, hash)
      const isCache = status === 'done'
      upsert({
        id: job_id,
        userId: '',
        status,
        phase: isCache ? 'finishing' : null,
        resultProjectUrl: result_project_url ?? null,
        error: null,
        createdAt: new Date().toISOString(),
        cached: isCache,
      })
      if (isCache) {
        // 이미-done row 는 Realtime 이 안 오므로 반환값으로 완결. 재사용 인지 신호(배너+캐시 토스트).
        setReused(true)
        pushToast('success', t('atelier.commissionReused'))
      } else {
        watch(job_id)
      }
    },
    [session, t, upsert, watch, pushToast],
  )

  return { jobs, loaded, submit, reused, dismissReused, awayDone, dismissAwayDone }
}
