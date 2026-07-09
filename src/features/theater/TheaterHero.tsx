import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LobbyRoom } from '@/lib/rooms'

// 대극장 히어로 — 넷플릭스형 자동 캐러셀(주인님 콜 2026-07-09): 인기 상위 무대를 6초마다 순환.
// 배경 원화는 잠깐 크게(공통 대극장 씬), 텍스트만 크로스페이드. 도트·좌우 화살표로 수동 이동.
// 방이 없으면 "첫 무대 열기" 온보딩. reduced-motion 이면 자동 회전 정지(수동만).
const ROTATE_MS = 6000

export default function TheaterHero({
  rooms,
  bgUrl,
  onEnter,
  onCreate,
}: {
  rooms: LobbyRoom[]
  bgUrl?: string
  onEnter: (r: LobbyRoom) => void
  onCreate: () => void
}) {
  const { t } = useTranslation()
  const [idx, setIdx] = useState(0)
  const count = rooms.length

  // 자동 회전 — 방 2개 이상 & reduced-motion 아닐 때만.
  useEffect(() => {
    if (count < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setIdx((i) => (i + 1) % count), ROTATE_MS)
    return () => clearInterval(id)
  }, [count])

  // 인덱스는 렌더에서 modulo 보정 — 방 수가 변동해도 항상 유효(set-state-in-effect 회피).
  const safeIdx = count > 0 ? idx % count : 0
  const room = count > 0 ? rooms[safeIdx] : null

  return (
    <section className="relative overflow-hidden rounded-2xl border border-stage-border">
      {bgUrl && (
        <img src={bgUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-stage-base via-stage-base/80 to-stage-base/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-stage-base/90 to-transparent" />

      <div className="relative flex min-h-[clamp(200px,34vh,320px)] max-w-xl flex-col justify-end gap-2 p-6 md:p-8">
        {room ? (
          <div key={room.id} className="hero-fade flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-fire-amber">{t('theater.todayStage')}</span>
            <h2 className="text-balance text-2xl font-extrabold leading-tight md:text-4xl">{room.title}</h2>
            <p className="text-sm text-stage-text-muted">
              {room.genre ? t(`lobby.genre.${room.genre}`) : t('lobby.genreNone')} · {room.hostDisplayName ?? t('lobby.host')} ·{' '}
              {t('theater.actingNow', { n: room.currentParticipants })}
            </p>
            <button
              onClick={() => onEnter(room)}
              className="mt-2 self-start rounded-lg bg-stage-text px-6 py-2.5 text-sm font-bold text-stage-base transition hover:opacity-85"
            >
              {t('lobby.join')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-fire-amber">{t('hub.rooms.title')}</span>
            <h2 className="text-balance text-2xl font-extrabold leading-tight md:text-3xl">{t('theater.emptyHeroTitle')}</h2>
            <p className="text-sm text-stage-text-muted">{t('theater.emptyHeroSub')}</p>
            <button
              onClick={onCreate}
              className="mt-2 self-start rounded-lg bg-fire-amber px-6 py-2.5 text-sm font-bold text-stage-base transition hover:opacity-90"
            >
              {t('theater.openFirstStage')}
            </button>
          </div>
        )}

        {count > 1 && (
          <div className="mt-3 flex gap-1.5">
            {rooms.map((r, i) => (
              <button
                key={r.id}
                onClick={() => setIdx(i)}
                aria-label={t('theater.heroGoto', { n: i + 1 })}
                aria-current={i === safeIdx}
                className={`h-1.5 rounded-full transition-all ${
                  i === safeIdx ? 'w-5 bg-stage-text' : 'w-1.5 bg-stage-text/30 hover:bg-stage-text/50'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {count > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => (i - 1 + count) % count)}
            aria-label={t('theater.heroPrev')}
            className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-lg text-white backdrop-blur transition hover:bg-black/60"
          >
            ‹
          </button>
          <button
            onClick={() => setIdx((i) => (i + 1) % count)}
            aria-label={t('theater.heroNext')}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-lg text-white backdrop-blur transition hover:bg-black/60"
          >
            ›
          </button>
        </>
      )}
    </section>
  )
}
