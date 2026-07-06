import type { Participant } from 'livekit-client'
import type { RoomParticipant } from '@/stores/roomStore'

// SSOT: reference/patterns/livekit-client.md · specs/livekit-edge-fn.md §2
// livekit-client@2.20.0 기준.

interface RoomToken {
  server_url: string
  token: string
}

// livekit-token Edge Function 호출 → 서명된 JWT 수신.
// 시크릿 서명은 서버에서만 (보안 성역). 클라이언트는 발급된 토큰만 받는다.
export async function fetchRoomToken(
  roomId: string,
  supabaseAccessToken: string,
): Promise<RoomToken> {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAccessToken}`,
      },
      body: JSON.stringify({ roomName: roomId }),
    },
  )
  if (!res.ok) {
    // 서버가 실은 {error} 본문을 준다 — 배포/게이트 실패 디버깅용으로 살린다.
    let detail = ''
    try {
      const body = await res.json()
      if (body?.error) detail = ` — ${body.error}`
    } catch {
      /* 본문 파싱 실패는 무시하고 상태코드만 노출 */
    }
    throw new Error(`Token fetch failed: ${res.status}${detail}`)
  }
  return res.json()
}

// SDK Participant → store UI 타입 (boundary 매핑, CODING-CONVENTIONS §2).
export function mapParticipant(p: Participant): RoomParticipant {
  return {
    identity: p.identity,
    name: p.name || p.identity,
    isLocal: p.isLocal,
    isSpeaking: p.isSpeaking,
    // ConnectionQuality enum 런타임값이 그대로 우리 union 문자열(excellent/good/poor/lost/unknown).
    connectionQuality: p.connectionQuality as RoomParticipant['connectionQuality'],
  }
}
