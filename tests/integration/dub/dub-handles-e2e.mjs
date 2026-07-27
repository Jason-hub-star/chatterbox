// 사다리 Z (DUB-SMOOTH-TAKES) 실렌더 스팟 — seed-and-drive(프로드 백엔드 + vite dev 5173).
// Z2 핸들: record/rehearse endMs=구간+600 · 자동정지 duration 에 꼬리 포함 · Z1 재녹음 무리로드 즉시 반영
import { chromium } from 'playwright-core'
import { routeLiveKitLocal } from '../helpers/livekit-local.mjs'
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
const email = `e2e-dubz-${s}@e.com`
await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
const anonC = createClient(SB, ANON, { auth: { persistSession: false } })
const { data: signin } = await anonC.auth.signInWithPassword({ email, password: PW })
const { data: prof } = await admin.from('users').select('id').eq('auth_id', signin.user.id).maybeSingle()
const A = { userId: prof.id, token: signin.session.access_token }

const roomId = (await fetch(`${SB}/functions/v1/create-room`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ title: `e2e-dubz-${s}` }),
}).then((r) => r.json())).room_id

const srcBytes = readFileSync(new URL('./fixtures/dub-src.mp4', import.meta.url).pathname)
const up = await fetch(`${SB}/functions/v1/create-dub-upload`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ room_id: roomId, file_name: 'e2e.mp4', size_bytes: srcBytes.length, mime_type: 'video/mp4' }),
}).then((r) => r.json())
if (!up.uploadUrl) { console.log('업로드 URL 실패:', JSON.stringify(up)); process.exit(1) }
await fetch(up.uploadUrl, { method: 'PUT', body: srcBytes, headers: { 'Content-Type': 'video/mp4' } })

const SEGS = [
  { id: 1, start_ms: 1000, end_ms: 3000, text: '첫 번째 대사' },  // 다음 세그까지 갭 2000 → 핸들 600 전부
  { id: 2, start_ms: 5000, end_ms: 7000, text: '두 번째 대사' },
  { id: 3, start_ms: 9000, end_ms: 11000, text: '세 번째 대사' },
]
const { data: sess } = await admin.from('dub_sessions').insert({
  room_id: roomId, created_by: A.userId, source_video_url: up.path, source_type: 'mp4', status: 'recording',
  roles_locked_at: new Date().toISOString(), roles_locked_by: A.userId,
  diarization_result_json: { segments: SEGS },
  consent_json: { participants: { [A.userId]: { consented: true } }, all_consented: true },
}).select('id').single()
const { data: seededTracks } = await admin.from('dub_tracks').insert(SEGS.map((g, i) => ({
  dub_session_id: sess.id, participant_id: A.userId, speaker_name: `Segment ${i + 1}`,
  start_time_ms: g.start_ms, end_time_ms: g.end_ms, transcript_text: g.text, status: 'assigned',
}))).select('id, start_time_ms')
const track1Id = seededTracks.find((t) => t.start_time_ms === 1000).id
console.log('방:', roomId, '세션:', sess.id, 'BASE:', BASE)

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
  await routeLiveKitLocal(ctx)
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
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('로그인하고 참여하기')), null, { timeout: 20000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('로그인하고 참여하기'))?.click())
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('이메일로 로그인')), null, { timeout: 20000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('이메일로 로그인'))?.click())
  await page.waitForSelector('input[type=email]', { timeout: 10000 })
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PW)
  await page.click('button[type=submit]')
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('배우로 참여')), null, { timeout: 30000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('배우로 참여'))?.click())
  await page.waitForFunction(() => window.__dubStore?.getState().activeSessionId, null, { timeout: 60000 })
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('첫 번째 대사')), null, { timeout: 60000 })

  // ── Z2a: rehearse endMs = 3600(구간 3000 + 핸들 600) ──
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('첫 번째 대사'))?.click())
  await sleep(500)
  const lmR = await page.evaluate(() => window.__dubStore.getState().localMode)
  ok(lmR?.kind === 'rehearse' && lmR.endMs === 3600, `Z2 rehearse 핸들(endMs=${lmR?.endMs}, 기대 3600)`)
  await page.evaluate(() => window.__dubStore.getState().setLocalMode(null))
  await sleep(300)

  // ── Z2b: record endMs = 3600 + 루프 OFF 자동정지에 꼬리 포함 ──
  await page.evaluate(() => window.__dubStore.getState().setRecLoop(false))
  await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label')?.includes('이 대사 녹음'))?.click())
  await page.waitForFunction(() => window.__dubStore.getState().recTrackId !== null, null, { timeout: 20000 })
  const lmRec = await page.evaluate(() => window.__dubStore.getState().localMode)
  ok(lmRec?.kind === 'record' && lmRec.endMs === 3600, `Z2 record 핸들(endMs=${lmRec?.endMs}, 기대 3600)`)
  await page.waitForFunction(() => window.__dubStore.getState().recPreview !== null, null, { timeout: 40000 })
  const prev1 = await page.evaluate(() => window.__dubStore.getState().recPreview)
  ok(prev1.durationMs >= 2400 && prev1.durationMs < 3500, `Z2 자동정지에 말꼬리 포함(duration=${prev1.durationMs}ms ≈ 2600+오버슛)`)

  // ── Z1: 제출 → recordings pathname v1 → 확정 해제 → 재녹음 → 무리로드 반영 ──
  await page.evaluate(() => { void window.__dubStore.getState().recEngine?.submit() })
  await page.waitForFunction(() => window.__dubStore.getState().recordings.length >= 1, null, { timeout: 30000 })
  const path1 = await page.evaluate((tid) => {
    const r = window.__dubStore.getState().recordings.find((x) => x.trackId === tid)
    return r ? new URL(r.url).pathname : null
  }, track1Id)
  ok(!!path1, `제출 1차 → 레이어 재료 도착(pathname=${(path1 || '').slice(-24)})`)
  // 솔로 자동확정 완료 대기 후 확정 해제(DUB-RETAKE) — 재녹음 경로 개방
  let st1 = null
  for (let i = 0; i < 30 && st1 !== 'synced'; i++) { await sleep(1000); const { data } = await admin.from('dub_tracks').select('status').eq('id', track1Id).maybeSingle(); st1 = data?.status }
  ok(st1 === 'synced', `솔로 자동확정 synced(${st1})`)
  const undo = await fetch(`${SB}/functions/v1/confirm-dub-track`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
    body: JSON.stringify({ dub_track_id: track1Id, undo: true }),
  }).then((r) => r.status)
  ok(undo === 200, `확정 해제 undo(${undo})`)
  await page.waitForFunction((tid) => window.__dubStore.getState().myTurnRanges.some((r) => r.trackId === tid), track1Id, { timeout: 30000 })
  await page.evaluate((tid) => window.__dubStore.getState().recEngine?.start(tid), track1Id)
  await page.waitForFunction(() => window.__dubStore.getState().recTrackId !== null, null, { timeout: 20000 })
  await page.waitForFunction(() => window.__dubStore.getState().recPreview !== null, null, { timeout: 40000 })
  await page.evaluate(() => { void window.__dubStore.getState().recEngine?.submit() })
  let path2 = null
  for (let i = 0; i < 60 && (!path2 || path2 === path1); i++) {
    await sleep(500)
    path2 = await page.evaluate((tid) => {
      const r = window.__dubStore.getState().recordings.find((x) => x.trackId === tid)
      return r ? new URL(r.url).pathname : null
    }, track1Id)
  }
  ok(!!path2 && path2 !== path1, `Z1 재녹음 무리로드 즉시 반영(pathname 교체: ${(path2 || '').slice(-24)})`)

  ok(errs.length === 0, `콘솔에러 없음 (${errs.length})${errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''}`)
} catch (e) {
  fail++; console.log('  FAIL 흐름:', String(e.message || e).split('\n')[0])
  if (page) {
    console.log('  [진단] URL:', page.url())
    console.log('  [진단] BODY:', (await page.evaluate(() => document.body.innerText).catch(() => '?')).slice(0, 400).replace(/\n+/g, ' | '))
    console.log('  [진단] ERRS:', errs.slice(0, 6).join(' || ') || 'none')
  }
} finally {
  await browser.close()
  try { await admin.from('rooms').delete().eq('id', roomId) } catch { /* noop */ }
}
console.log(`\n== DUB-SMOOTH-TAKES 실렌더 스팟: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
