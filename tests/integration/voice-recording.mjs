// 통합테스트: 음성 전용 방 녹음 kind 배선 (ROOM-28 / GOAL-voice-recording P1).
// 계약: docs/contracts/VoiceRecording.md — start-room-recording 만 kind 를 받고 나머지 4종은 무변경.
// supabase-slice-verify 하네스용 — vitest 아님. 테스트 유저·방은 스스로 만들고 finally 에서 정리한다.
//
// 실행: `supabase functions serve` 후
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node tests/integration/voice-recording.mjs
//
// 검증:
//   1) 비호스트 시작 → 403                        (기존 게이트 무회귀)
//   2) kind='bogus' → 400 Invalid kind            (DB CHECK 500 이 아니라 400 으로 되돌려준다)
//   3) kind 미지정 → 201 + DB kind='stage'        (기존 호출부 무회귀 — P1 핵심)
//   4) kind='voice' → 201 + 응답/DB/broadcast kind='voice'
//   5) 전원 동의 전 업로드 발급 → 412             (동의 게이트가 음성에서도 산다)
//   6) 게스트 동의 → all_consented=true
//   7) 업로드 발급 → 200 + storage_key 가 .webm   (audio-only 도 같은 컨테이너 = 무변경 근거)
//   8) complete → ready + kind 보존
//   9) get-recording-url 멤버 200 / 비멤버 403     (visibility 게이트 무회귀)
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const FN = `${URL}/functions/v1`

let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('  ✗', m)) }

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

async function makeUser(tag) {
  const email = `rec-${tag}-${Date.now()}@test.local`
  const password = 'test-password-1234'
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`createUser ${tag}: ${error.message}`)
  const c = createClient(URL, ANON)
  const { data: s, error: sErr } = await c.auth.signInWithPassword({ email, password })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  const { data: row } = await svc.from('users').select('id').eq('auth_id', data.user.id).single()
  return { authId: data.user.id, userId: row.id, token: s.session.access_token }
}

async function callFn(name, token, body) {
  const res = await fetch(`${FN}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

const kindOf = async (id) =>
  (await svc.from('recordings').select('kind, status').eq('id', id).single()).data

async function main() {
  const host = await makeUser('host')
  const guest = await makeUser('guest')
  const outsider = await makeUser('out')

  const { data: room } = await svc.from('rooms')
    .insert({ host_id: host.userId, title: 'voice-rec-test', status: 'live' }).select('id').single()
  await svc.from('room_participants').insert([
    { room_id: room.id, user_id: host.userId, slot_index: 0, state: 'connected', role: 'actor' },
    { room_id: room.id, user_id: guest.userId, slot_index: 1, state: 'connected', role: 'actor' },
  ])

  try {
    console.log('voice-recording integration (ROOM-28)')

    const c1 = await callFn('start-room-recording', guest.token, { room_id: room.id })
    ok(c1.status === 403, '1) 비호스트 시작 → 403')

    const c2 = await callFn('start-room-recording', host.token, { room_id: room.id, kind: 'bogus' })
    ok(c2.status === 400 && c2.json?.error === 'Invalid kind', '2) kind=bogus → 400 Invalid kind')

    const c3 = await callFn('start-room-recording', host.token, { room_id: room.id })
    ok(c3.status === 201 && c3.json?.kind === 'stage', '3a) kind 미지정 → 201 + 응답 kind=stage')
    ok((await kindOf(c3.json.recording_id))?.kind === 'stage', '3b) DB kind=stage (기존 호출부 무회귀)')
    // 방당 활성 녹화 1개 규칙 — 다음 케이스를 위해 취소로 비운다.
    await callFn('complete-room-recording', host.token, { recording_id: c3.json.recording_id, cancel: true })

    const c4 = await callFn('start-room-recording', host.token, { room_id: room.id, kind: 'voice' })
    ok(c4.status === 201 && c4.json?.kind === 'voice', '4a) kind=voice → 201 + 응답 kind=voice')
    const recId = c4.json.recording_id
    ok((await kindOf(recId))?.kind === 'voice', '4b) DB kind=voice')
    ok(c4.json?.all_consented === false, '4c) 2인 방이라 all_consented=false (호스트만 동의)')

    const c5 = await callFn('create-room-recording-upload', host.token, { recording_id: recId })
    ok(c5.status === 412 && c5.json?.code === 'consent_required', '5) 동의 전 업로드 발급 → 412')

    const c6 = await callFn('record-recording-consent', guest.token, { recording_id: recId, consented: true })
    ok(c6.status === 200 && c6.json?.all_consented === true, '6) 게스트 동의 → all_consented=true')

    const c7 = await callFn('create-room-recording-upload', host.token, { recording_id: recId })
    ok(c7.status === 200 && typeof c7.json?.upload_url === 'string', '7a) 업로드 발급 → 200')
    ok(String(c7.json?.storage_key || '').endsWith('.webm'), '7b) storage_key 가 .webm (컨테이너 동일 → 무변경 근거)')

    const c8 = await callFn('complete-room-recording', host.token, {
      recording_id: recId, duration_ms: 300000, file_size_bytes: 2_400_000,
    })
    ok(c8.status === 200 && c8.json?.status === 'ready', '8a) complete → ready')
    const after = await kindOf(recId)
    ok(after?.kind === 'voice' && after?.status === 'ready', '8b) complete 후에도 kind=voice 보존')

    const c9 = await callFn('get-recording-url', host.token, { recording_id: recId })
    ok(c9.status === 200 && typeof c9.json?.url === 'string', '9a) 멤버 재생 URL → 200')

    const c10 = await callFn('get-recording-url', outsider.token, { recording_id: recId })
    ok(c10.status === 403, '9b) 비멤버 → 403 (visibility 게이트 무회귀)')
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
