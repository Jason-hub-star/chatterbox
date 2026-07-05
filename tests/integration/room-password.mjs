// 통합테스트: set-room-password + join-room-with-password (HOST-06). supabase-slice-verify 하네스용 — vitest 아님.
// 실행: `supabase functions serve` (set-room-password·join-room-with-password·join-public-room) 후
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//   HOST_EMAIL=... HOST_PASSWORD=... GUEST_EMAIL=... GUEST_PASSWORD=... \
//   node tests/integration/room-password.mjs
//
// 검증:
//   1) 비호스트 비번설정 → 403 Not host
//   2) 호스트 비번설정 → 200 is_locked=true + room_secrets.password_hash(pbkdf2)
//   3) 잠금방 공개입장 → 403 Room is locked
//   4) 틀린 비번 → 403 Wrong password
//   5) 맞는 비번 → 201 입장 + 재입장 멱등 200
//   6) 비번 해제 → 200 is_locked=false + room_secrets 행 삭제
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

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
async function appUserId(authId) {
  const { data } = await svc.from('users').select('id').eq('auth_id', authId).single()
  return data.id
}

async function main() {
  const host = await signIn(process.env.HOST_EMAIL, process.env.HOST_PASSWORD)
  const guest = await signIn(process.env.GUEST_EMAIL, process.env.GUEST_PASSWORD)
  const hostUserId = await appUserId(host.authId)

  const { data: room } = await svc.from('rooms')
    .insert({ host_id: hostUserId, title: 'password-test', status: 'live' }).select('id').single()
  await svc.from('room_participants').insert([
    { room_id: room.id, user_id: hostUserId, slot_index: 0, state: 'connected', role: 'actor' },
  ])

  console.log('room-password integration')

  const p1 = await callFn('set-room-password', guest.token, { room_id: room.id, password: 'secret123' })
  ok(p1.status === 403 && p1.json?.error === 'Not host', '비호스트 비번설정 → 403 Not host')

  const p2 = await callFn('set-room-password', host.token, { room_id: room.id, password: 'secret123' })
  ok(p2.status === 200 && p2.json?.is_locked === true, '호스트 비번설정 → 200 is_locked=true')
  const { data: sec } = await svc.from('room_secrets').select('password_hash').eq('room_id', room.id).single()
  ok(sec?.password_hash?.startsWith('pbkdf2$'), 'room_secrets.password_hash = pbkdf2 해시')

  const p3 = await callFn('join-public-room', guest.token, { room_id: room.id })
  ok(p3.status === 403 && p3.json?.error === 'Room is locked', '잠금방 공개입장 → 403 Room is locked')

  const p4 = await callFn('join-room-with-password', guest.token, { room_id: room.id, password: 'wrong' })
  ok(p4.status === 403 && p4.json?.error === 'Wrong password', '틀린 비번 → 403 Wrong password')

  const p5 = await callFn('join-room-with-password', guest.token, { room_id: room.id, password: 'secret123' })
  ok(p5.status === 201 && p5.json?.slot_index === 1, '맞는 비번 → 201 입장(slot 1)')

  const p6 = await callFn('join-room-with-password', guest.token, { room_id: room.id, password: 'secret123' })
  ok(p6.status === 200 && p6.json?.rejoined === true, '재입장 멱등 → 200 rejoined')

  const p7 = await callFn('set-room-password', host.token, { room_id: room.id, password: '' })
  ok(p7.status === 200 && p7.json?.is_locked === false, '비번 해제 → 200 is_locked=false')
  const { data: sec2 } = await svc.from('room_secrets').select('room_id').eq('room_id', room.id).maybeSingle()
  ok(!sec2, 'room_secrets 행 삭제됨')

  await svc.from('room_participants').delete().eq('room_id', room.id)
  await svc.from('room_secrets').delete().eq('room_id', room.id)
  await svc.from('rooms').delete().eq('id', room.id)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
