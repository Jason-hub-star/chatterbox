import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { listRecentRooms, type RecentRoom } from '@/lib/rooms'
import InteriorShell from '@/pages/lobby/InteriorShell'
import { useInterior } from '@/pages/lobby/useInterior'

// 찻집(로비 v3) — 레거시 전가: 최근 함께한 방·사람. 살아있는 앵커: 함께했던 사람들이
// 테이블 자리에 칩으로 "앉아" 있음 — 칩 클릭 = 매표소로 이동해 그 사람이 체크된 예약 폼.
const vars = (a: { l: number; t: number; w: number; h: number }) =>
  ({ '--al': `${a.l}%`, '--at': `${a.t}%`, '--aw': `${a.w}%` }) as React.CSSProperties

export default function TeahousePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useUserStore((s) => s.session)
  const interior = useInterior('social')
  const [recent, setRecent] = useState<RecentRoom[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await listRecentRooms(session.access_token)
        if (!cancelled) setRecent(r.rooms)
      } catch {
        /* 빈 찻집으로 강등 */
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session])

  // 사람 칩: 방들의 동료를 최신순으로 중복 제거 — 테이블 2곳에 나눠 앉힘.
  const people: { id: string; name: string }[] = []
  for (const r of recent) {
    for (const f of r.fellows) {
      if (!people.some((p) => p.id === f.user_id)) people.push({ id: f.user_id, name: f.display_name ?? '?' })
    }
  }
  const tableA = people.filter((_, i) => i % 2 === 0).slice(0, 4)
  const tableB = people.filter((_, i) => i % 2 === 1).slice(0, 4)

  const chip = (p: { id: string; name: string }) => (
    <button
      key={p.id}
      className="tea-chip"
      onClick={() => navigate(`/lobby/theater?tab=ticket&invitee=${p.id}`)}
      title={t('teahouse.chipHint')}
    >
      ☕ {p.name}
    </button>
  )

  return (
    <InteriorShell dest="social" title={t('hub.social.title')}>
      {interior && (
        <div className="interior-anchor" style={vars(interior.anchors.tableA)}>
          <div className="flex flex-wrap justify-center gap-1.5">{tableA.map(chip)}</div>
        </div>
      )}
      {interior && tableB.length > 0 && (
        <div className="interior-anchor hidden md:block" style={vars(interior.anchors.tableB)}>
          <div className="flex flex-wrap justify-center gap-1.5">{tableB.map(chip)}</div>
        </div>
      )}

      {/* 하단 패널: 최근 방 재입장(레거시 이전). */}
      <div className="interior-anchor md:!left-[4%] md:!top-[8%] md:!w-[34%]" style={{}}>
        <div className="interior-panel space-y-1.5">
          <p className="text-xs font-semibold text-stage-text-muted">{t('lobby.recentRooms')}</p>
          {!loaded ? (
            <p className="text-xs text-stage-text-muted">{t('common.loading')}</p>
          ) : recent.length === 0 ? (
            <p className="text-xs text-stage-text-muted">{t('teahouse.empty')}</p>
          ) : (
            recent.slice(0, 5).map((r) => (
              <div key={r.room_id} className="flex items-center gap-2 rounded-lg border border-stage-border px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{r.title}</p>
                  {r.fellows.length > 0 && (
                    <p className="truncate text-[11px] text-stage-text-muted">
                      {t('lobby.recentWith', { names: r.fellows.map((f) => f.display_name ?? '?').join(', ') })}
                    </p>
                  )}
                </div>
                {r.status !== 'ended' && (
                  <button
                    onClick={() => navigate(`/rooms/${r.room_id}/ready`)}
                    className="shrink-0 rounded-md border border-stage-border px-2.5 py-1.5 text-[11px] text-stage-text-muted hover:text-stage-text"
                  >
                    {t('lobby.join')}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </InteriorShell>
  )
}
