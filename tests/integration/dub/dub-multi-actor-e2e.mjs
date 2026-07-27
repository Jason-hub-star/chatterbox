// 다인 세션 분기 E2E — 솔로 아님: 제출=submitMoved 토스트(자동확정 아님)·착지 비정지·submitted 유지·1건 일괄확정
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const PROJ = process.env.PROJ || '/Users/family/jason/ChatterBox'
const env = Object.fromEntries(
  readFileSync(`${PROJ}/.env`, 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const SB = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.BASE || 'http://localhost:5173'
const SCRATCH = process.env.SCRATCH || '.'
const PW = 'Passw0rd!e2e'
const admin = createClient(SB, SERVICE, { auth: { persistSession: false } })
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const s = Date.now()
const mkUser = async (tag) => {
  const email = `e2e-multi-${tag}-${s}@e.com`
  await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  const anonC = createClient(SB, ANON, { auth: { persistSession: false } })
  const { data: signin } = await anonC.auth.signInWithPassword({ email, password: PW })
  const { data: prof } = await admin.from('users').select('id').eq('auth_id', signin.user.id).maybeSingle()
  return { email, userId: prof.id, token: signin.session.access_token }
}
const A = await mkUser('a'), B = await mkUser('b')

const roomId = (await fetch(`${SB}/functions/v1/create-room`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ title: `e2e-multi-${s}` }),
}).then((r) => r.json())).room_id
await fetch(`${SB}/functions/v1/join-public-room`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${B.token}` },
  body: JSON.stringify({ room_id: roomId }),
})

const srcBytes = readFileSync(new URL('./fixtures/dub-src.mp4', import.meta.url).pathname)
const up = await fetch(`${SB}/functions/v1/create-dub-upload`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ room_id: roomId, file_name: 'e2e.mp4', size_bytes: srcBytes.length, mime_type: 'video/mp4' }),
}).then((r) => r.json())
await fetch(up.uploadUrl, { method: 'PUT', body: srcBytes, headers: { 'Content-Type': 'video/mp4' } })

const SEGS = [
  { id: 1, start_ms: 1000, end_ms: 3000, text: '에이 첫 대사' },  // A
  { id: 2, start_ms: 5000, end_ms: 7000, text: '비의 대사' },    // B → solo=false
  { id: 3, start_ms: 9000, end_ms: 11000, text: '에이 둘 대사' }, // A(다음 이동 목적지)
]
const { data: sess } = await admin.from('dub_sessions').insert({
  room_id: roomId, created_by: A.userId, source_video_url: up.path, source_type: 'mp4', status: 'recording',
  roles_locked_at: new Date().toISOString(), roles_locked_by: A.userId,
  diarization_result_json: { segments: SEGS },
  consent_json: { participants: { [A.userId]: { consented: true }, [B.userId]: { consented: true } }, all_consented: true },
}).select('id').single()
const owners = [A.userId, B.userId, A.userId]
const { data: seededTracks } = await admin.from('dub_tracks').insert(SEGS.map((g, i) => ({
  dub_session_id: sess.id, participant_id: owners[i], speaker_name: `Segment ${i + 1}`,
  start_time_ms: g.start_ms, end_time_ms: g.end_ms, transcript_text: g.text, status: 'assigned',
}))).select('id, start_time_ms')
const t1id = seededTracks.find((t) => t.start_time_ms === 1000).id
console.log('방:', roomId, 'BASE:', BASE, '(다인 A2+B1)')

const errs = []
let page = null
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required'],
})
try {
  const ctx = await browser.newContext()
  await ctx.grantPermissions(['camera', 'microphone'], { origin: BASE })
  page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const url = m.location()?.url || ''
    if (/separate-dub-audio/.test(url)) return
    if (/XNNPACK|TensorFlow|favicon|MediaPipe|WebGL|livekit|room connection/i.test(m.text())) return
    errs.push(`${m.text().slice(0, 140)} @${url.slice(-60)}`)
  })
  page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 180)))

  await page.goto(`${BASE}/rooms/${roomId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('로그인하고 참여하기')), null, { timeout: 30000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('로그인하고 참여하기'))?.click())
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('이메일로 로그인')), null, { timeout: 20000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('이메일로 로그인'))?.click())
  await page.waitForSelector('input[type=email]', { timeout: 10000 })
  await page.fill('input[type=email]', A.email); await page.fill('input[type=password]', PW)
  await page.click('button[type=submit]')
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('배우로 참여')), null, { timeout: 30000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('배우로 참여'))?.click())
  await page.waitForFunction(() => window.__dubStore?.getState().activeSessionId, null, { timeout: 60000 })
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('에이 첫 대사')), null, { timeout: 60000 })

  const pollStore = async (fn, tries = 200, iv = 100) => {
    for (let i = 0; i < tries; i++) { await sleep(iv); if (await page.evaluate(fn)) return true }
    return false
  }

  // A 가 seg1 녹음(루프 OFF 자동정지) → 제출
  await page.evaluate(() => window.__dubStore.getState().setRecLoop(false))
  ok(await pollStore(() => !window.__dubStore.getState().recBusy), '시작 전 busy 해제')
  await page.evaluate((tid) => window.__dubStore.getState().recEngine?.start(tid), t1id)
  ok(await pollStore(() => window.__dubStore.getState().recTrackId !== null), '녹음 시작')
  ok(await pollStore(() => window.__dubStore.getState().recPreview !== null, 300), '자동정지→프리뷰')
  await sleep(500)
  await page.evaluate(() => { void window.__dubStore.getState().recEngine?.submit() })

  // 다인 분기: submitMoved 토스트("호스트 확정" + "다음 파트로 이동") · "자동 확정" 미출현
  let toastTxt = null
  for (let i = 0; i < 80 && !toastTxt; i++) {
    await sleep(150)
    toastTxt = await page.evaluate(() => {
      const t = document.body.innerText
      if (t.includes('제출 완료')) return t.match(/제출 완료[^\n]*/)?.[0] ?? '제출 완료'
      return null
    })
  }
  ok(!!toastTxt && toastTxt.includes('호스트 확정') && toastTxt.includes('다음 파트로 이동'), `다인 토스트 = submitMoved("${(toastTxt || '').slice(0, 60)}")`)
  ok(!!toastTxt && !toastTxt.includes('자동 확정'), '다인 토스트에 "자동 확정" 없음(솔로 분기 미발동)')

  // 다인 = 착지 비정지: seg3(9.0s) 근처로 이동하되 재생 유지
  let landing = null
  for (let i = 0; i < 40 && !landing; i++) {
    await sleep(300)
    const st = await page.evaluate(() => { const v = document.querySelector('video'); return v ? { t: v.currentTime, paused: v.paused } : null })
    if (st && st.t >= 8.7 && st.t < 12.5) landing = st
  }
  ok(!!landing && landing.paused === false, `다인 착지 비정지(t=${landing?.t?.toFixed(2)}s·paused=${landing?.paused})`)

  // DB: submitted 유지(자동확정 없음)
  let t1row = null
  for (let i = 0; i < 20 && t1row?.status !== 'submitted'; i++) { await sleep(500); const { data } = await admin.from('dub_tracks').select('status').eq('id', t1id).maybeSingle(); t1row = data }
  ok(t1row?.status === 'submitted', `DB submitted 유지(${t1row?.status} — 자동확정 미발동)`)

  // Y2: 제출 1건에도 호스트 일괄 확정 버튼 노출(>0)
  let confirmAllBtn = false
  for (let i = 0; i < 30 && !confirmAllBtn; i++) { await sleep(500); confirmAllBtn = await page.evaluate(() => [...document.querySelectorAll('[data-dub-confirm-all]')].length > 0) }
  ok(confirmAllBtn, 'Y2 일괄 확정 버튼 1건에도 노출(data-dub-confirm-all)')

  // 호스트 확정 → synced
  await page.evaluate(() => document.querySelector('[data-dub-confirm-all]')?.click())
  let syncedRow = null
  for (let i = 0; i < 30 && syncedRow?.status !== 'synced'; i++) { await sleep(1000); const { data } = await admin.from('dub_tracks').select('status').eq('id', t1id).maybeSingle(); syncedRow = data }
  ok(syncedRow?.status === 'synced', `호스트 일괄 확정 → synced(${syncedRow?.status})`)

  ok(errs.length === 0, `콘솔에러 없음 (${errs.length})${errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''}`)
} catch (e) {
  fail++; console.log('  FAIL 흐름:', String(e.message || e).split('\n')[0])
  if (page) {
    console.log('  [진단] URL:', page.url())
    console.log('  [진단] BODY:', (await page.evaluate(() => document.body.innerText).catch(() => '?')).slice(0, 300).replace(/\n+/g, ' | '))
  }
} finally {
  await browser.close()
  try { await admin.from('rooms').delete().eq('id', roomId) } catch { /* noop */ }
}
console.log(`\n== 다인 분기 E2E: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
