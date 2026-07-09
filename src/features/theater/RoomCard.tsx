import { useTranslation } from 'react-i18next'
import type { LobbyRoom } from '@/lib/rooms'
import { genreAccent } from '@/features/theater/genrePresets'

// 대극장 무대 카드 — 치지직식 무채 미니멀(주인님 콜). 썸네일은 무채(콜드스타트: 방 제목 워터마크,
// 후속 실제 무대·아바타컷 자리), 색은 장르칩·프로필 원 악센트에만. 카드 전체가 입장 버튼(만석=관전).
export default function RoomCard({ room, onEnter }: { room: LobbyRoom; onEnter: (r: LobbyRoom) => void }) {
  const { t } = useTranslation()
  const { hue } = genreAccent(room.genre)
  const full = room.currentParticipants >= room.maxParticipants
  const genreLabel = room.genre ? t(`lobby.genre.${room.genre}`) : t('lobby.genreNone')

  return (
    <button onClick={() => onEnter(room)} aria-label={room.title} className="group block w-full text-left">
      {/* 썸네일 영역(무채) — 방 제목 워터마크는 콜드스타트 폴백, 실제 무대/아바타컷 자리다. */}
      <div className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-xl border border-stage-border bg-stage-panel transition group-hover:border-stage-text-muted/50 group-focus-visible:border-fire-amber">
        <span className="line-clamp-3 px-4 text-center text-[15px] font-bold text-stage-text/10">{room.title}</span>

        {room.status === 'live' ? (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-fire-hot px-2 py-0.5 text-[10.5px] font-extrabold tracking-wide text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" />
            LIVE
          </span>
        ) : (
          <span className="absolute left-2 top-2 rounded-md bg-black/50 px-2 py-0.5 text-[10.5px] font-bold text-stage-text/90 backdrop-blur-sm">
            {t('lobby.statusWaiting')}
          </span>
        )}

        <span
          className={`absolute right-2 top-2 rounded-md bg-black/50 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums backdrop-blur-sm ${full ? 'text-fire-hot/90' : 'text-white'}`}
        >
          {full ? t('theater.watchFull', { n: room.maxParticipants }) : `${room.currentParticipants}/${room.maxParticipants}`}
        </span>

        {room.isLocked && (
          <span aria-hidden className="absolute bottom-2 right-2 text-sm opacity-85">
            🔒
          </span>
        )}
      </div>

      {/* 정보 영역이 주인공 — 프로필 원 + 제목 + 호스트·장르칩(치지직 구조). */}
      <div className="mt-2.5 flex gap-2.5">
        <span
          aria-hidden
          className="mt-0.5 grid h-[34px] w-[34px] flex-none place-items-center rounded-full text-[13px] font-bold text-white"
          style={{ background: hue }}
        >
          {(room.hostDisplayName ?? '?').slice(0, 1)}
        </span>
        <div className="min-w-0">
          <div className="line-clamp-2 text-[14.5px] font-bold leading-snug">{room.title}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-stage-text-muted">
            <span className="truncate">{room.hostDisplayName ?? t('lobby.host')}</span>
            <span className="text-stage-text-muted/50">·</span>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold"
              style={{ color: hue, background: `${hue}24` }}
            >
              {room.isPractice ? t('lobby.practiceBadge') : genreLabel}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}
