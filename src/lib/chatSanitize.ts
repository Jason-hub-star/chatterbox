// 채팅 입력 sanitize 1단계(클라이언트) — SSOT: docs/specs/security/livekit-media-moderation.md §6.4.1.
// 서버(send-chat Edge)가 동일 규칙을 재실행하는 진짜 게이트이고, 여기는 UX용 1차 방어(왕복 전 차단).
// ponytail: markdown 렌더링이 필요 없으면 DOMPurify도 생략한다.
//   Phase 1은 평문 + 제한 링크만 지원. markdown 지원 추가 시 DOMPurify 도입.

const MAX_MESSAGE_LENGTH = 500
const ALLOWED_URL_PROTOCOLS = ['https:', 'mailto:']

/** 클라이언트가 send-chat 계열 Edge Function 호출 전 반드시 통과 */
export function sanitizeChatInput(raw: string): { ok: true; text: string } | { ok: false; reason: string } {
  // (1) 길이 제한
  if (raw.length === 0) return { ok: false, reason: 'empty' }
  if (raw.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'too_long' }

  // (2) 제어 문자 제거 (null byte, Bell 등)
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  // (3) 프로토콜 화이트리스트 — javascript:, data:, vbscript: 차단
  const found = text.match(/https?:\/\/[^\s]+/gi) ?? []
  for (const url of found) {
    try {
      const parsed = new URL(url)
      if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
        return { ok: false, reason: `blocked_protocol:${parsed.protocol}` }
      }
    } catch {
      return { ok: false, reason: 'invalid_url' }
    }
  }

  // (4) HTML 태그 감지 — <script>, <iframe>, <img onerror=> 등 차단. Phase 1은 평문만 허용.
  if (/<\s*(script|iframe|object|embed|form|input|button|svg|math)/i.test(text)) {
    return { ok: false, reason: 'html_tag_blocked' }
  }

  if (text.trim().length === 0) return { ok: false, reason: 'empty' }
  return { ok: true, text }
}
