import { DEFAULT_SLOTS, type ReactionSlot } from '@/stores/reactionStore'

// 이모트 카탈로그 — 피커 팔레트의 단일 SSOT(확장 지점). 여기 1행 추가하면 피커에 자동 노출(컴포넌트 무변경).
// = 기본 로드아웃(DEFAULT_SLOTS) + 추가 이모트. label 은 데이터(기존 슬롯 패턴 계승 — .ts라 JSX 한글 lint 무해).
// 옐로 애니는 후속 레이어(lottieEmoteMap.ts 의 id 매핑) — id 가 그 매핑 키이므로 안정적으로 유지한다.
const EXTRA_EMOTES: ReactionSlot[] = [
  { id: 'party', emoji: '🎉', label: '축하' },
  { id: 'shock', emoji: '😱', label: '충격' },
  { id: 'eyes', emoji: '👀', label: '주목' },
  { id: 'pray', emoji: '🙏', label: '부탁' },
  { id: 'cool', emoji: '😎', label: '멋짐' },
  { id: 'think', emoji: '🤔', label: '고민' },
  { id: 'sweat', emoji: '😅', label: '진땀' },
  { id: 'hundred', emoji: '💯', label: '최고' },
  { id: 'celebrate', emoji: '🥳', label: '파티' },
  { id: 'sob', emoji: '😭', label: '눈물' },
  { id: 'mindblown', emoji: '🤯', label: '멘붕' },
  { id: 'punch', emoji: '👊', label: '파이팅' },
  { id: 'star', emoji: '🌟', label: '스타' },
  { id: 'sparkle', emoji: '✨', label: '반짝' },
  { id: 'rofl', emoji: '🤣', label: '폭소' },
  { id: 'love', emoji: '😍', label: '반함' },
]

export const EMOTE_CATALOG: ReactionSlot[] = [...DEFAULT_SLOTS, ...EXTRA_EMOTES]

// 플로트(와이어)는 emoji 만 실리므로 비주얼 레이어(EmoteGlyph)용 역색인 — 카탈로그가 단일 SSOT.
export const EMOTE_ID_BY_EMOJI: ReadonlyMap<string, string> = new Map(EMOTE_CATALOG.map((e) => [e.emoji, e.id]))
