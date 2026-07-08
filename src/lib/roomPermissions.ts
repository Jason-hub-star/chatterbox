import type { ParticipantRole } from '@/stores/roomStore'

// 뷰어/배우 클라 권한 게이트(A-SEAM-4 / ViewerGate.md). 서버 진실(livekit-token canPublish: role!=='viewer')을
// 클라에서 미러 — B 의 뷰어모드 RoomView·MobileViewer 가 컨트롤 노출을 이 헬퍼로 판정한다(규칙 하드코딩 산개 방지).
// 여기서 firm 하게 확정된 축은 발행권(마이크·표정)뿐. 채팅·리액션 정책(로그인 뷰어 허용/익명 차단)은 anon auth
// 도입 시 확장(현재 join 경로가 actor 고정이라 뷰어 라이브 진입은 뷰어조인/ViewerGate 기능 뒤에).
export interface RoomPermissions {
  canPublish: boolean
}

export function roomPermissions(role: ParticipantRole): RoomPermissions {
  return { canPublish: role === 'actor' }
}
