import { useEffect, useRef, useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import {
  uploadAvatarPng,
  createAvatarJob,
  fetchMyAvatarJobs,
  subscribeToAvatarJob,
} from '@/lib/avatarJobs'
import type { AvatarJob } from '@/types/avatarJob'
import AvatarPreview from '@/features/avatar/AvatarPreview'

// ⚠️ 기능 수직 슬라이스 전용 dev 트리거 — UI/UX는 다음 세션(의상실 커미션). 디자인 금지, 배선만 검증.
// PNG 업로드 → create-avatar-job → Modal spawn → Realtime phase → done 시 AvatarPreview 로드.
// dev 툴 — 영문 라벨(i18n 게이트 우회). 실 UI는 의상실 커미션에서 t() 키로.
const PHASE_LABEL: Record<string, string> = {
  analyzing: '1 analyze', cutting: '2 cut', rigging: '3 rig', finishing: '4 finish',
}

export default function AvatarForgeDevPage() {
  const session = useUserStore((s) => s.session)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [job, setJob] = useState<AvatarJob | null>(null)
  const [recent, setRecent] = useState<AvatarJob[]>([])
  const unsubRef = useRef<(() => void) | null>(null)

  // 재진입: 내 잡 목록 로드 + 진행 중이면 구독.
  useEffect(() => {
    void fetchMyAvatarJobs().then((jobs) => {
      setRecent(jobs)
      const active = jobs.find((j) => j.status === 'queued' || j.status === 'running')
      if (active) {
        setJob(active)
        unsubRef.current = subscribeToAvatarJob(active.id, setJob)
      }
    })
    return () => unsubRef.current?.()
  }, [])

  async function onForge() {
    if (!file || !session) return
    setBusy(true)
    setErr(null)
    try {
      const key = await uploadAvatarPng(file)
      const { job_id } = await createAvatarJob(session.access_token, key)
      unsubRef.current?.()
      setJob({ id: job_id, userId: '', status: 'running', phase: 'analyzing', resultProjectUrl: null, error: null, createdAt: '', cached: false })
      unsubRef.current = subscribeToAvatarJob(job_id, setJob)
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'monospace', maxWidth: 560 }}>
      <h1>Avatar Forge (dev)</h1>
      <p style={{ color: '#888', fontSize: 13 }}>PNG &rarr; auto-rig &rarr; in-app avatar. Wiring smoke test.</p>

      <div style={{ margin: '16px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="file" accept="image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button onClick={() => void onForge()} disabled={!file || !session || busy}>
          {busy ? 'submitting…' : 'forge'}
        </button>
      </div>
      {err && <p style={{ color: 'crimson' }}>error: {err}</p>}

      {job && (
        <div style={{ border: '1px solid #ccc', padding: 12, borderRadius: 8 }}>
          <p>job <code>{job.id.slice(0, 8)}</code> — <b>{job.status}</b>
            {job.phase && ` · ${PHASE_LABEL[job.phase] ?? job.phase}`}</p>
          {job.error && <p style={{ color: 'crimson' }}>{job.error}</p>}
          {job.status === 'done' && job.resultProjectUrl && (
            <div style={{ marginTop: 8 }}>
              <AvatarPreview key={job.resultProjectUrl} projectUrl={job.resultProjectUrl} size={220} />
            </div>
          )}
        </div>
      )}

      <h3 style={{ marginTop: 24 }}>My jobs</h3>
      <ul style={{ fontSize: 13 }}>
        {recent.map((j) => (
          <li key={j.id}>{j.id.slice(0, 8)} — {j.status}{j.phase ? ` (${j.phase})` : ''}</li>
        ))}
      </ul>
    </main>
  )
}
