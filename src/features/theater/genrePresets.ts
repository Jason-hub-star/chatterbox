// 대극장 카드 장르 악센트 — 무채 미니멀(주인님 콜 2026-07-09).
// 카드 썸네일은 무채; hue 는 장르칩·프로필 원 악센트에만 쓴다(치지직식 담백).
// 장르 어휘 SSOT = create-room GENRES · lib/rooms ROOM_GENRES · i18n lobby.genre.* (셋이 1:1).
// genre=null(화이트리스트 밖·미지정)은 중립 폴백 hue.
export interface GenreAccent {
  hue: string
}

export const GENRE_ACCENTS: Record<string, GenreAccent> = {
  romance: { hue: '#ff5c93' },
  horror: { hue: '#a78bfa' },
  fantasy: { hue: '#38d1d9' },
  comedy: { hue: '#ffcb47' },
  drama: { hue: '#7aa2ff' },
  free: { hue: '#4ecdc4' },
}

const FALLBACK: GenreAccent = { hue: '#9c8b73' }

export const genreAccent = (genre: string | null): GenreAccent =>
  (genre ? GENRE_ACCENTS[genre] : undefined) ?? FALLBACK
