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

      {/* 찻집 = 사람 전용(로비 IA 재편): 방 재입장은 대극장 공개목록과 중복이라 이관/제거,
          여기는 최근 함께한 사람(재초대)·친구(P1 FriendSystem) 축. 아직 사람이 없으면 빈 안내.
          ponytail: 훗날 SNS형 커뮤니티(아바타 자랑 등) 확장 자리 — 건물 선점 유지. */}
      {interior && loaded && people.length === 0 && (
        <div className="interior-anchor" style={vars(interior.anchors.tableA)}>
          <p className="interior-panel text-center text-xs text-stage-text-muted">{t('teahouse.empty')}</p>
        </div>
      )}
    </InteriorShell>
  )
}
