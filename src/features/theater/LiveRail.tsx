import { useTranslation } from 'react-i18next'
import type { LobbyRoom } from '@/lib/rooms'

// 공개 광장 홈의 "지금 열린 무대" 레일(UIUX-OVERHAUL-2026-07 P1) — 광장 미학(데스크톱 헤더 없음
// 주인님 콜)을 존중해 좌하단 컴팩트 플로팅 1장. 목록 전체·필터는 대극장 몫, 여기는 입장 유도 최대 4행.
export default function LiveRail({
  rooms,
  onEnter,
  onMore,
}: {
  rooms: LobbyRoom[]
  onEnter: (room: LobbyRoom) => void
  onMore: () => void
}) {
  const { t } = useTranslation()
  const shown = rooms.filter((r) => !r.isPractice && !r.isLocked).slice(0, 4)

  return (
    <section
      aria-label={t('lobby.liveRailTitle')}
      className="pointer-events-auto w-full max-w-md rounded-xl border border-stage-border bg-stage-base/85 p-3 backdrop-blur"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-app-h2">{t('lobby.liveRailTitle')}</h2>
        <button onClick={onMore} className="shrink-0 text-xs text-stage-text-muted hover:text-stage-text">
          {t('lobby.liveRailMore')}
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-stage-text-muted">{t('lobby.liveRailEmpty')}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {shown.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => onEnter(r)}
                className="flex w-full items-center gap-2 rounded-lg border border-stage-border/60 bg-stage-panel/70 px-3 py-2 text-left transition-colors hover:border-fire-amber/50"
              >
                {r.status === 'live' && (
                  <span className="shrink-0 rounded bg-fire-hot/15 px-1.5 py-0.5 text-[10px] font-bold text-fire-hot">
                    {t('theater.filterLive')}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-stage-text-muted">
                  {r.currentParticipants}/{r.maxParticipants}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
