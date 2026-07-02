// 통합테스트 스캐폴드 — 슬라이스별로 복사·수정해서 scratch 에서 실행.
// 실행: set -a; . $SCRATCH/sb.env; set +a; export SUPABASE_URL="$API_URL"; cd $SCRATCH && node <this>.mjs
// 검증 대상: Edge Function 계약(200/403/409/400)·상태전이·RLS. HTTP+DB 만(브라우저 X).
import { createClient } from '@supabase/supabase-js'
// import { readFileSync } from 'node:fs'  // 실 파일 시드 필요 시

const URL = process.env.SUPABASE_URL, ANON = process.env.ANON_KEY, SERVICE = process.env.SERVICE_ROLE_KEY
const FN = `${URL}/functions/v1`
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)) }
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

async function mkUser(email) {
  await admin.auth.admin.createUser({ email, password: 'test1234!', email_confirm: true })
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data } = await c.auth.signInWithPassword({ email, password: 'test1234!' })
  return { client: c, token: data.session.access_token, uid: data.user.id }
}
const call = async (n, t, b) => {
  const r = await fetch(`${FN}/${n}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(b) })
  return { status: r.status, body: await r.json().catch(() => null) }
}
// auth_id → users.id (앱 유저 id)
const appId = async (uid) => (await admin.from('users').select('id').eq('auth_id', uid).single()).data.id

const s = Date.now()
const host = await mkUser(`slice-h-${s}@e.com`), guest = await mkUser(`slice-g-${s}@e.com`)
const hostAppId = await appId(host.uid), guestAppId = await appId(guest.uid)

// ── 셋업/시드 ─────────────────────────────────────────────────────
// 예: 방 생성 + 게스트 조인
const roomId = (await call('create-room', host.token, { title: `slice-${s}` })).body.room_id
await call('join-public-room', guest.token, { room_id: roomId })
// 외부 API(STT 등) 우회하려면 admin 으로 목표 상태 직접 시드:
//   await admin.storage.from('dub-assets').upload(`${roomId}/sources/x.mp4`, Buffer.from('...'), { contentType: 'video/mp4' })
//   const { data: sess } = await admin.from('dub_sessions').insert({ ... status: 'recording' }).select('id').single()
//   await admin.from('dub_tracks').insert([ ... status: 'synced' ])

// ── 단언 ─────────────────────────────────────────────────────────
// ok((await call('some-fn', guest.token, { ... })).status === 403, '비권한자 403')
// ok((await call('some-fn', host.token,  { ... })).status === 200, '정상 200')
// const row = (await admin.from('some_table').select('status').eq('id', id).single()).data
// ok(row.status === 'expected', '상태전이 확인')
// const rls = (await guest.client.from('some_table').select('id').eq('...', ...)).data
// ok(rls?.length >= 0, 'RLS 멤버 SELECT')

console.log(`\n== ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
