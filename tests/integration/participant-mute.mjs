// 통합테스트: set-participant-mute (HOST-08). supabase-slice-verify 하네스용 — vitest 아님.
// 실행: `supabase functions serve` (set-participant-mute + livekit-token) 후
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//   LIVEKIT_* (더미 가능 — updateParticipant 실패는 try/catch, DB+토큰 게이트가 권위) \
//   HOST_EMAIL=... HOST_PASSWORD=... GUEST_EMAIL=... GUEST_PASSWORD=... \
//   node tests/integration/participant-mute.mjs
//
// 검증:
//   1) 비호스트 음소거 → 403 Not host
//   2) 자기 음소거 → 400 Cannot mute self
//   3) 호스트 음소거 → 200 + room_participants.muted_by_host=true
//   4) 음소거 중 livekit-token → canPublish=false (재연결해도 발행 차단, DB 권위)
//   5) 호스트 해제 → 200 + muted_by_host=false + 토큰 canPublish=true
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const FN = `${URL}/functions/v1`

let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('  ✗', m)) }

async function signIn(email, password) {
  const c = createClient(URL, ANON)
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn ${email}: ${error.message}`)
  return { token: data.session.access_token, authId: data.user.id }
}
async function callFn(name, token, body) {
  const res = await fetch(`${FN}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}
function jwtCanPublish(token) {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  return payload.video?.canPublish
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
async function appUserId(authId) {
  const { data } = await svc.from('users').select('id').eq('auth_id', authId).single()
  return data.id
}

async function main() {
  const host = await signIn(process.env.HOST_EMAIL, process.env.HOST_PASSWORD)
  const guest = await signIn(process.env.GUEST_EMAIL, process.env.GUEST_PASSWORD)
  const hostUserId = await appUserId(host.authId)
  const guestUserId = await appUserId(guest.authId)

  const { data: room } = await svc.from('rooms')
    .insert({ host_id: hostUserId, title: 'mute-test', status: 'live' }).select('id').single()
  await svc.from('room_participants').insert([
    { room_id: room.id, user_id: hostUserId, slot_index: 0, state: 'connected', role: 'actor' },
    { room_id: room.id, user_id: guestUserId, slot_index: 1, state: 'connected', role: 'actor' },
  ])

  console.log('participant-mute integration')

  const m1 = await callFn('set-participant-mute', guest.token, { room_id: room.id, target_identity: host.authId, muted: true })
  ok(m1.status === 403 && m1.json?.error === 'Not host', '비호스트 음소거 → 403 Not host')

  const m2 = await callFn('set-participant-mute', host.token, { room_id: room.id, target_identity: host.authId, muted: true })
  ok(m2.status === 400, '자기 음소거 → 400 Cannot mute self')

  const m3 = await callFn('set-participant-mute', host.token, { room_id: room.id, target_identity: guest.authId, muted: true })
  ok(m3.status === 200 && m3.json?.muted === true, '호스트 음소거 → 200 muted=true')
  const { data: gp1 } = await svc.from('room_participants').select('muted_by_host').eq('room_id', room.id).eq('user_id', guestUserId).single()
  ok(gp1?.muted_by_host === true, 'muted_by_host = true')

  const t1 = await callFn('livekit-token', guest.token, { roomName: room.id })
  ok(t1.status === 201 && jwtCanPublish(t1.json?.token) === false, '음소거 중 토큰 canPublish=false')

  const m4 = await callFn('set-participant-mute', host.token, { room_id: room.id, target_identity: guest.authId, muted: false })
  ok(m4.status === 200 && m4.json?.muted === false, '호스트 해제 → 200 muted=false')
  const { data: gp2 } = await svc.from('room_participants').select('muted_by_host').eq('room_id', room.id).eq('user_id', guestUserId).single()
  ok(gp2?.muted_by_host === false, 'muted_by_host = false')

  const t2 = await callFn('livekit-token', guest.token, { roomName: room.id })
  ok(t2.status === 201 && jwtCanPublish(t2.json?.token) === true, '해제 후 토큰 canPublish=true')

  await svc.from('room_participants').delete().eq('room_id', room.id)
  await svc.from('rooms').delete().eq('id', room.id)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
