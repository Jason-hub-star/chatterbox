import { globSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NOTIF_TYPES, resolveNotifTarget, type NotifLike } from '@/components/shared/notifRouting'

// U2 회귀 잠금 — 이 테스트의 존재 이유는 "type 을 추가할 때 목적지를 잊는 것"을 막는 것이다.
// 감사 #3: 발행되는 9종 중 5종(친구 2·예약 3)이 눌러도 아무 데도 안 가는 데드클릭이었다.
// 새 알림 type 을 서버에 추가하면 NOTIF_TYPES 에 넣어야 하고, 넣는 순간 목적지가 없으면 여기서 막힌다.

const bare = (type: string): NotifLike => ({ type, room_id: null, payload: {} })

describe('resolveNotifTarget', () => {
  it('발행되는 모든 type 이 목적지를 갖는다 — 데드클릭 0', () => {
    const dead = NOTIF_TYPES.filter((type) => resolveNotifTarget(bare(type)) === null)
    expect(dead).toEqual([])
  })

  it('payload·room_id 가 비어도 목적지가 있다(레거시 행·서버 필드 누락 방어)', () => {
    // 실패하면 "서버가 항상 채워주니까" 라는 가정으로 분기를 짠 것 — 그 가정이 깨지면 데드클릭이 된다.
    for (const type of NOTIF_TYPES) {
      expect(resolveNotifTarget(bare(type)), `${type} 이 빈 payload 에서 목적지를 잃는다`).not.toBeNull()
    }
  })

  it('친구 알림은 라우팅이 아니라 패널 열기다', () => {
    // FriendsButton 은 벨과 같은 로비 헤더에 있다 — navigate 로는 열 수 없다.
    expect(resolveNotifTarget(bare('friend_request'))).toEqual({ kind: 'friends' })
    expect(resolveNotifTarget(bare('friend_accepted'))).toEqual({ kind: 'friends' })
  })

  it('초대코드는 type 보다 우선한다(로비 초대 배너 흐름 LOB-05 재사용)', () => {
    const n: NotifLike = { type: 're_invite', room_id: 'r1', payload: { invite_code: 'ABC' } }
    expect(resolveNotifTarget(n)).toEqual({ kind: 'navigate', to: '/lobby?invite=ABC' })
  })

  it('vgen: 공방 스튜디오 방은 방이 아니라 공방으로', () => {
    // 서버가 payload.is_studio 에 판정을 구워 보낸다(클라 재조회 불요).
    const studio: NotifLike = { type: 'vgen_job_done', room_id: 'r1', payload: { is_studio: true } }
    const inRoom: NotifLike = { type: 'vgen_job_done', room_id: 'r1', payload: { is_studio: false } }
    expect(resolveNotifTarget(studio)).toEqual({ kind: 'navigate', to: '/lobby/workshop' })
    expect(resolveNotifTarget(inRoom)).toEqual({ kind: 'navigate', to: '/rooms/r1' })
  })

  it('팔로우 공연시작은 방 상태 재검증을 거치게 표시된다(종료·만석 데드엔드 방지)', () => {
    const n: NotifLike = { type: 'followed_creator_stream_start', room_id: null, payload: { room_id: 'r9' } }
    expect(resolveNotifTarget(n)).toEqual({ kind: 'roomIfLive', roomId: 'r9' })
  })

  it('결과물 알림(더빙·녹화)은 그 방으로 간다', () => {
    for (const type of ['dub_output_ready', 'recording_ready']) {
      expect(resolveNotifTarget({ type, room_id: 'r7', payload: {} })).toEqual({
        kind: 'navigate',
        to: '/rooms/r7',
      })
    }
  })

  it('모르는 type 은 null — 라우팅한 척하지 않는다', () => {
    expect(resolveNotifTarget(bare('some_future_type'))).toBeNull()
  })
})

// NOTIF_TYPES 가 손으로 관리되는 목록이라는 게 이 감사의 결함과 똑같은 실패 모드다 —
// 서버에 type 을 추가하고 클라 목록에 안 넣으면 데드클릭이 조용히 돌아온다.
// 그래서 목록을 믿지 않고 서버 소스에서 직접 긁어 대조한다.
describe('NOTIF_TYPES ↔ 서버 발행 지점', () => {
  // 추출 오검출(알림 type 이 아닌 문자열). 늘어나면 여기 사유와 함께 적는다.
  const NOT_A_NOTIF_TYPE = new Set([
    'friend', // send/respond-friend-request 의 relationship_type
    'recording', // complete-room-recording 의 다른 필드
    'done', // 트리거의 `case when new.status = 'done'` — 잡 상태값
  ])

  const publishedTypes = (): string[] => {
    const found = new Set<string>()
    // Edge: notifications insert 를 하는 파일에서 user_id 와 같은 객체 리터럴에 붙은 type
    for (const file of globSync('supabase/functions/**/index.ts')) {
      const src = readFileSync(file, 'utf-8')
      if (!/from\(["']notifications["']\)/.test(src)) continue
      for (const m of src.matchAll(/user_id:[^;]{0,200}?type:\s*["']([a-z_]+)["']/gs)) found.add(m[1])
    }
    // 마이그: `insert into notifications ...` 문 안의 문자열 리터럴(트리거·pg_cron 발행분)
    for (const file of globSync('supabase/migrations/*.sql')) {
      const src = readFileSync(file, 'utf-8')
      for (const stmt of src.matchAll(/insert into (?:public\.)?notifications\b(.{0,400}?);/gs)) {
        for (const m of stmt[1].matchAll(/'([a-z_]+)'/g)) found.add(m[1])
      }
    }
    return [...found].filter((t) => !NOT_A_NOTIF_TYPE.has(t))
  }

  it('서버가 발행하는 type 중 목록에 없는 게 없다', () => {
    const declared = new Set<string>(NOTIF_TYPES)
    // jsonb_build_object 의 키(payload 필드명)도 같은 따옴표라 함께 잡힌다 — 목록에 있거나
    // payload 키이거나 둘 중 하나여야 한다. 진짜 신규 type 이면 어느 쪽도 아니라 여기서 걸린다.
    const payloadKeys = new Set([
      'job_id', 'result_project_url', 'room_title', 'scheduled_at',
      'reservation_id', 'failure_reason', 'is_studio', 'room_id',
    ])
    const missing = publishedTypes().filter((t) => !declared.has(t) && !payloadKeys.has(t))
    expect(missing, '서버가 발행하는데 NOTIF_TYPES 에 없다 → 데드클릭').toEqual([])
  })

  it('추출기가 실제로 동작한다 — 알려진 발행 type 을 놓치지 않는다', () => {
    // 이 대조군이 없으면 정규식이 0건을 긁어도 위 테스트가 통과해 버린다(가짜 초록).
    const published = publishedTypes()
    for (const known of ['friend_request', 'reservation_invite', 'avatar_job_done', 'vgen_job_done', 'recording_ready']) {
      expect(published, `추출기가 ${known} 를 못 찾았다`).toContain(known)
    }
  })
})
