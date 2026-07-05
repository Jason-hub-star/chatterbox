// 통합테스트: kick-participant (HOST-01). supabase-slice-verify 하네스용 — vitest 아님.
// 실행: `supabase functions serve` (kick-participant + livekit-token) 후
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//   HOST_EMAIL=... HOST_PASSWORD=... GUEST_EMAIL=... GUEST_PASSWORD=... \
//   node tests/integration/kick-participant.mjs
//
// 검증:
//   1) 호스트 강퇴 → 200 + room_participants.is_disabled_by_host=true + token_version 증가
//   2) 비호스트 강퇴 시도 → 403 Not host
//   3) 자기 강퇴 → 400
//   4) 강퇴된 참가자 livekit-token → 403 Disabled by host (재입장 차단)
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
  return data.session.access_token
}

async function callFn(name, token, body) {
  const res = await fetch(`${FN}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

async function appUserId(authId) {
  const { data } = await svc.from('users').select('id').eq('auth_id', authId).single()
  return data.id
}
async function authIdOf(email) {
  const { data } = await svc.from('users').select('auth_id').eq('email', email).single()
  return data.auth_id
}

async function main() {
  const hostTok = await signIn(process.env.HOST_EMAIL, process.env.HOST_PASSWORD)
  const guestTok = await signIn(process.env.GUEST_EMAIL, process.env.GUEST_PASSWORD)
  const hostAuth = (await createClient(URL, ANON).auth.getUser(hostTok)).data.user.id
  const guestAuth = await authIdOf(process.env.GUEST_EMAIL)
  const hostUserId = await appUserId(hostAuth)
  const guestUserId = await appUserId(guestAuth)

  // 방 + 참가자 2인 (service_role 직접 세팅)
  const { data: room } = await svc.from('rooms')
    .insert({ host_id: hostUserId, title: 'kick-test', status: 'live' }).select('id').single()
  await svc.from('room_participants').insert([
    { room_id: room.id, user_id: hostUserId, slot_index: 0, state: 'connected', role: 'actor' },
    { room_id: room.id, user_id: guestUserId, slot_index: 1, state: 'connected', role: 'actor' },
  ])
  const { data: before } = await svc.from('room_participants')
    .select('token_version').eq('room_id', room.id).eq('user_id', guestUserId).single()

  console.log('kick-participant integration')

  // 2) 비호스트 → 403
  const r2 = await callFn('kick-participant', guestTok, { room_id: room.id, target_identity: hostAuth })
  ok(r2.status === 403 && r2.json?.error === 'Not host', '비호스트 강퇴 → 403 Not host')

  // 3) 자기 강퇴 → 400
  const r3 = await callFn('kick-participant', hostTok, { room_id: room.id, target_identity: hostAuth })
  ok(r3.status === 400, '자기 강퇴 → 400')

  // 1) 호스트 강퇴 → 200 + DB
  const r1 = await callFn('kick-participant', hostTok, { room_id: room.id, target_identity: guestAuth })
  ok(r1.status === 200 && r1.json?.ok === true, '호스트 강퇴 → 200 ok')
  const { data: after } = await svc.from('room_participants')
    .select('is_disabled_by_host, token_version').eq('room_id', room.id).eq('user_id', guestUserId).single()
  ok(after?.is_disabled_by_host === true, 'is_disabled_by_host = true')
  ok(after?.token_version === before.token_version + 1, `token_version +1 (${before.token_version}→${after?.token_version})`)

  // 4) 강퇴된 게스트 livekit-token → 403 Disabled by host
  const r4 = await callFn('livekit-token', guestTok, { roomName: room.id })
  ok(r4.status === 403 && r4.json?.error === 'Disabled by host', '강퇴 후 재입장 토큰 → 403 Disabled by host')

  // cleanup
  await svc.from('room_participants').delete().eq('room_id', room.id)
  await svc.from('rooms').delete().eq('id', room.id)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
