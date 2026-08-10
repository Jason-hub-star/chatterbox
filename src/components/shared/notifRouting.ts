// 알림 클릭 목적지 결정 — 순수 함수(컴포넌트 밖). NotificationBell 은 이걸 실행만 한다.
//
// 이 파일이 따로 있는 이유(UIUX 감사 #3): 발행되는 type 중 5종이 눌러도 아무 데도 가지 않는
// 데드클릭이었다. 분기를 컴포넌트 안에 두면 type 이 늘 때마다 조용히 재발하므로, 발행 지점
// 전수를 NOTIF_TYPES 로 고정하고 유닛 테스트가 "목적지 없는 type 0개"를 강제한다.

/** 서버가 실제로 notifications 에 INSERT 하는 type 전수(발행 지점 주석 = 근거). */
export const NOTIF_TYPES = [
  're_invite', // create-room-invite
  'reservation_invite', // create-reservation
  'reservation_reminder', // 20260808140000 send_reservation_reminders (pg_cron)
  'reservation_cancelled', // cancel-reservation
  'reservation_room_open', // create-room (RES-ROOM — 예약 방이 열렸다)
  'friend_request', // send-friend-request
  'friend_accepted', // respond-friend-request
  'followed_creator_stream_start', // create-room
  'avatar_job_done', // 20260713180000_avatar_job_notify.sql
  'avatar_job_failed', // 〃
  'vgen_job_done', // 20260808120000_vgen_job_notify.sql
  'vgen_job_failed', // 〃
  'dub_output_ready', // submit-dub-output
  'recording_ready', // complete-room-recording
] as const

export type NotifType = (typeof NOTIF_TYPES)[number]

export interface NotifPayload {
  invite_code?: string
  room_id?: string // followed_creator_stream_start — 컬럼이 아니라 payload 에 담겨 온다
  is_studio?: boolean // vgen_job_* — 공방 스튜디오 방은 유저에게 "방"이 아니다
}

export interface NotifLike {
  type: string
  room_id: string | null
  payload: NotifPayload
}

export type NotifTarget =
  /** 라우터 이동. */
  | { kind: 'navigate'; to: string }
  /** 로비 친구 패널 열기 — FriendsButton 은 벨과 같은 헤더라 이동할 곳이 아니다. */
  | { kind: 'friends' }
  /** 방 상태를 먼저 재검증한 뒤 이동(종료·만석이면 데드엔드 대신 안내). */
  | { kind: 'roomIfLive'; roomId: string }

/**
 * 목적지 없는 알림을 만들지 않는다 — 반환 null 은 곧 데드클릭이라 테스트가 막는다.
 * payload 가 비어 있어도(레거시 행·서버 필드 누락) 어딘가로는 보낸다.
 */
export function resolveNotifTarget(n: NotifLike): NotifTarget | null {
  // 초대코드가 있으면 로비 초대 배너 흐름(LOB-05) 재사용 — type 판정보다 우선.
  if (n.payload.invite_code) return { kind: 'navigate', to: `/lobby?invite=${n.payload.invite_code}` }

  switch (n.type) {
    case 're_invite':
      // 코드가 소진·폐기된 재초대라도 방은 안다(room_id 컬럼).
      return { kind: 'navigate', to: n.room_id ? `/rooms/${n.room_id}` : '/lobby/theater' }

    // RES-ROOM: 예약 알림에 방이 실려 있으면 그 방으로 직행한다. 방은 호스트가 열어야 생기므로
    //   같은 type 이라도 시점에 따라 있을 수도 없을 수도 있다 — 없으면 예약 목록(대극장)이 목적지.
    //   reservation_invite 는 방보다 먼저 발행되므로 사실상 항상 대극장이고, reminder 는 이미
    //   열린 뒤면 방을 싣는다. 취소 통지는 갈 방이 없는 게 정상이다.
    case 'reservation_invite':
    case 'reservation_reminder':
    case 'reservation_room_open':
      return typeof n.payload.room_id === 'string'
        ? { kind: 'roomIfLive', roomId: n.payload.room_id }
        : { kind: 'navigate', to: '/lobby/theater' }
    case 'reservation_cancelled':
      return { kind: 'navigate', to: '/lobby/theater' }

    // 친구 요청/수락: 처리할 UI(FriendsButton 패널)가 벨과 같은 로비 헤더에 있다.
    case 'friend_request':
    case 'friend_accepted':
      return { kind: 'friends' }

    case 'followed_creator_stream_start':
      return typeof n.payload.room_id === 'string'
        ? { kind: 'roomIfLive', roomId: n.payload.room_id }
        : { kind: 'navigate', to: '/lobby/theater' }

    // 아바타 완료/실패: 의상실(거울에 NEW 배지·재주문 카드가 기다린다).
    case 'avatar_job_done':
    case 'avatar_job_failed':
      return { kind: 'navigate', to: '/lobby/atelier' }

    case 'vgen_job_done':
    case 'vgen_job_failed':
      return {
        kind: 'navigate',
        to: n.payload.is_studio || !n.room_id ? '/lobby/workshop' : `/rooms/${n.room_id}`,
      }

    // 더빙 합성본·방 녹화는 결과물이 방 안에 있다(끝난 방이면 RoomPage 의 roomEnded 모달이 받는다).
    // room_id 는 서버가 항상 채우지만, 없으면 데드클릭 대신 광장으로 — 전역 작품함은 아직 없다.
    case 'dub_output_ready':
    case 'recording_ready':
      return { kind: 'navigate', to: n.room_id ? `/rooms/${n.room_id}` : '/lobby' }

    default:
      return null
  }
}
