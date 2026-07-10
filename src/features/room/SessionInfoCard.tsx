import { useTranslation } from 'react-i18next'

// 세션 정보 카드(ROOM-REDESIGN R3 좌도크) — 장르·러닝타임·언어 전부 실데이터.
// 오디오포맷(48kHz/24bit)은 LiveKit 내부 기본값이라 검증 불가 → 생략(ROOM-REDESIGN §2).
// 프레젠테이션 전용: 데이터는 RoomPage 가 주입.
interface Props {
  genre: string
  elapsed: string
  connected: boolean
}

export default function SessionInfoCard({ genre, elapsed, connected }: Props) {
  const { t, i18n } = useTranslation()
  // 언어명은 브라우저 Intl.DisplayNames 로 현재 UI 언어 기준 표기(하드코딩 한글 회피 = lint 준수·미니멀).
  let langLabel = i18n.language
  try {
    langLabel = new Intl.DisplayNames([i18n.language], { type: 'language' }).of(i18n.language) ?? i18n.language
  } catch { /* 구형 런타임 폴백: 코드 그대로 */ }

  const rows: { icon: string; label: string; value: string }[] = [
    { icon: '🎭', label: t('room.infoGenre'), value: genre || t('room.infoGenreNone') },
    { icon: '⏱', label: t('room.infoRuntime'), value: connected ? elapsed : '—' },
    { icon: '🌐', label: t('room.infoLanguage'), value: langLabel },
  ]

  return (
    <section className="rounded-xl border border-stage-border bg-stage-panel/80 p-3 backdrop-blur-sm">
      <h3 className="mb-2 text-xs font-semibold text-stage-text-muted">{t('room.infoTitle')}</h3>
      <dl className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <dt className="flex items-center gap-1.5 text-stage-text-muted">
              <span aria-hidden>{r.icon}</span>
              {r.label}
            </dt>
            <dd className="tabular-nums text-stage-text">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
