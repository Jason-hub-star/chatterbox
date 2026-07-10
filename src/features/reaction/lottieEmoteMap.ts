// 이모트 비주얼 매핑 — id → Lottie JSON URL(옐로/앰버 라운드 세트, fire-amber 언어).
// 자산 추가 절차: ① public/lotties/emotes/<id>.json ② 여기 1줄 — 컴포넌트 로직 변경 0.
// 빈 항목 = emoji 폴백(EmoteGlyph). id 는 EMOTE_CATALOG 의 안정 키. SSOT: docs/contracts/ReactionWheel.md
export const LOTTIE_BY_ID: Record<string, string> = {
  thumbsup: '/lotties/emotes/thumbsup.json',
  laugh: '/lotties/emotes/laugh.json',
  clap: '/lotties/emotes/clap.json',
  fire: '/lotties/emotes/fire.json',
  heart: '/lotties/emotes/heart.json',
  cry: '/lotties/emotes/cry.json',
  wow: '/lotties/emotes/wow.json',
  question: '/lotties/emotes/question.json',
}

// 좌석 플로트 동시 Lottie 상한(성능 가드) — 초과분은 ReactionOverlay 가 emoji 로 강등. MAX_FLOATS(30)와 별개.
export const MAX_LOTTIE_FLOATS = 8
