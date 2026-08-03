// 대극장 카드 장르 악센트 — 무채 미니멀(주인님 콜 2026-07-09).
// 카드 썸네일은 무채; hue 는 장르칩·프로필 원 악센트에만 쓴다(치지직식 담백).
// 장르 어휘 SSOT = create-room GENRES · lib/rooms ROOM_GENRES · i18n lobby.genre.* (셋이 1:1).
// genre=null(화이트리스트 밖·미지정)은 중립 폴백 hue.
export interface GenreAccent {
  hue: string
}

// hue 는 OKLCH 격자(L 0.80·C 0.125)에 정렬 — 밝기·채도 고정, 색상만 회전해 6색이 세트로 조용.
// 근거·계산: docs/goals/GOAL-color-harmony.md §1 (CP1). 폴백은 튀지 않게 저채도 웜그레이.
export const GENRE_ACCENTS: Record<string, GenreAccent> = {
  romance: { hue: '#FF9CB6' },
  horror: { hue: '#C1B0FF' },
  fantasy: { hue: '#37D5DE' },
  comedy: { hue: '#E1B856' },
  drama: { hue: '#9FBDFE' },
  free: { hue: '#3ED7CD' },
}

const FALLBACK: GenreAccent = { hue: '#999186' }

export const genreAccent = (genre: string | null): GenreAccent =>
  (genre ? GENRE_ACCENTS[genre] : undefined) ?? FALLBACK
