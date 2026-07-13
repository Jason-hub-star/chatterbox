// 대본 텔레프롬프터 개인 글자 크기 어휘(SSOT) — ScriptPanel(전체 대본)·TeleprompterFocus(현재 대사) 공유.
// 기기 로컬 설정(localStorage 'cb.scriptFontScale'), 다른 참가자에게 전파 없음(MILESTONES Phase 3 AC).
export const FONT_SCALES = ['sm', 'md', 'lg'] as const
export type FontScale = (typeof FONT_SCALES)[number]
export const CUE_TEXT_CLS: Record<FontScale, string> = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' }
export const LIST_TEXT_CLS: Record<FontScale, string> = { sm: 'text-xs', md: 'text-sm', lg: 'text-lg' }
