// 통합테스트: 참가자별 로컬 원본 트랙 (ROOM-28 P2a / GOAL-voice-multitrack Q1).
// 계약: docs/contracts/VoiceRecording.md §P2 설계 — 동의는 **호출자 본인** 기준, 키는 서버 소유.
// supabase-slice-verify 하네스용 — vitest 아님. 테스트 유저·방은 스스로 만들고 finally 정리.
//
// 실행: `supabase functions serve` 후
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node tests/integration/voice-multitrack.mjs
//
// 검증:
//   1) 비참가자 트랙 발급 → 403                       (방 경계)
//   2) kind='stage' 녹화에 트랙 발급 → 409             (음성 전용 기능)
//   3) **미동의 참가자 트랙 발급 → 412**               (프라이버시 P0 — 골 blocked 조건)
//   4) 동의자 트랙 발급 → 200 + 키가 서버 규칙(.../tracks/<userId>.webm)
//   5) 같은 참가자 2회 발급 → **행 1개**(unique 덮어쓰기, 저장 선형증가 방지)
//   6) 업로드 전 제출도 행을 submitted 로              (업로드 실패 복구는 재발급으로)
//   7) 트랙 없는 사람이 제출 → 404                     (남의 행 지목 불가 — 파라미터 자체가 없음)
//   8) 2인 제출 → submitted_count=2
//   9) recording 삭제 → 트랙 CASCADE 0
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const FN = `${URL}/functions/v1`

let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('  ✗', m)) }
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

async function makeUser(tag) {
  const email = `mt-${tag}-${Date.now()}@test.local`
  const password = 'test-password-1234'
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`createUser: ${error.message}`)
  const c = createClient(URL, ANON)
  const { data: s } = await c.auth.signInWithPassword({ email, password })
  const { data: row } = await svc.from('users').select('id').eq('auth_id', data.user.id).single()
  return { authId: data.user.id, userId: row.id, token: s.session.access_token }
}
const callFn = async (name, token, body) => {
  const res = await fetch(`${FN}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}
const tracksOf = async (recId) =>
  (await svc.from('recording_tracks').select('participant_id, status, storage_object_key, start_offset_ms')
    .eq('recording_id', recId)).data ?? []

async function main() {
  const host = await makeUser('h')
  const guest = await makeUser('g')
  const outsider = await makeUser('o')

  const { data: room } = await svc.from('rooms')
    .insert({ host_id: host.userId, title: 'multitrack-test', status: 'live' }).select('id').single()
  await svc.from('room_participants').insert([
    { room_id: room.id, user_id: host.userId, slot_index: 0, state: 'connected', role: 'actor' },
    { room_id: room.id, user_id: guest.userId, slot_index: 1, state: 'connected', role: 'actor' },
  ])

  try {
    console.log('voice-multitrack integration (ROOM-28 P2a)')

    // 음성 녹음 시작 → 호스트만 동의된 상태(게스트 미동의)에서 트랙 게이트를 본다.
    const start = await callFn('start-room-recording', host.token, { room_id: room.id, kind: 'voice' })
    const recId = start.json.recording_id
    // 전원 동의 없이는 recording 전이가 안 되므로, 게이트 시험을 위해 상태만 서버측으로 올린다.
    await svc.from('recordings').update({ status: 'recording' }).eq('id', recId)

    const t1 = await callFn('create-recording-track-upload', outsider.token, { recording_id: recId })
    ok(t1.status === 403, '1) 비참가자 트랙 발급 → 403')

    const { data: stageRec } = await svc.from('recordings')
      .insert({ room_id: room.id, user_id: host.userId, kind: 'stage', status: 'recording',
                consent_json: { participants: { [host.userId]: { consented: true } }, all_consented: true } })
      .select('id').single()
    const t2 = await callFn('create-recording-track-upload', host.token, { recording_id: stageRec.id })
    ok(t2.status === 409, '2) kind=stage 에 트랙 발급 → 409(음성 전용)')

    const t3 = await callFn('create-recording-track-upload', guest.token, { recording_id: recId })
    ok(t3.status === 412 && t3.json?.code === 'consent_required',
      '3) **미동의 참가자 트랙 발급 → 412**(프라이버시 게이트)')
    ok((await tracksOf(recId)).length === 0, '3b) 미동의 상태에선 트랙 행이 생기지 않는다')

    const t4 = await callFn('create-recording-track-upload', host.token, { recording_id: recId })
    ok(t4.status === 200, '4a) 동의자(호스트) 트랙 발급 → 200')
    ok(t4.json?.storage_key === `recordings/${room.id}/${recId}/tracks/${host.userId}.webm`,
      '4b) 키가 서버 규칙 그대로(클라 미제공)')

    await callFn('create-recording-track-upload', host.token, { recording_id: recId })
    ok((await tracksOf(recId)).length === 1, '5) 같은 참가자 2회 발급 → 행 1개(unique 덮어쓰기)')

    const s6 = await callFn('submit-recording-track', host.token, {
      recording_id: recId, duration_ms: 5000, start_offset_ms: 120, file_size_bytes: 40000,
    })
    ok(s6.status === 200 && s6.json?.status === 'submitted', '6a) 제출 → submitted')
    const rows = await tracksOf(recId)
    ok(rows[0]?.start_offset_ms === 120, `6b) start_offset_ms 기록 ${rows[0]?.start_offset_ms}`)

    const s7 = await callFn('submit-recording-track', guest.token, { recording_id: recId })
    ok(s7.status === 404, '7) 트랙 없는 사람이 제출 → 404(남의 행 지목 파라미터 없음)')

    // 게스트 동의 후 트랙 1개 더
    await svc.from('recordings').update({
      consent_json: {
        participants: { [host.userId]: { consented: true }, [guest.userId]: { consented: true } },
        all_consented: true,
      },
    }).eq('id', recId)
    await callFn('create-recording-track-upload', guest.token, { recording_id: recId })
    const s8 = await callFn('submit-recording-track', guest.token, {
      recording_id: recId, duration_ms: 5100, start_offset_ms: 90, file_size_bytes: 41000,
    })
    ok(s8.status === 200 && s8.json?.submitted_count === 2, `8) 2인 제출 → submitted_count=${s8.json?.submitted_count}`)

    await svc.from('recordings').delete().eq('id', recId)
    ok((await tracksOf(recId)).length === 0, '9) recording 삭제 → 트랙 CASCADE 0')
  } finally {
    await svc.from('recordings').delete().eq('room_id', room.id)
    await svc.from('room_participants').delete().eq('room_id', room.id)
    await svc.from('rooms').delete().eq('id', room.id)
    for (const u of [host, guest, outsider]) {
      await svc.from('users').delete().eq('id', u.userId)
      await svc.auth.admin.deleteUser(u.authId)
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
