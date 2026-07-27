// 배포 프론트 합성 E2E — Z2 유효구간 트림(atrim) 첫 실합성: 녹음→제출(솔로 자동확정)→[합성 시작]→산출 mp4 ffprobe
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const PROJ = process.env.PROJ || '/Users/family/jason/ChatterBox'
const env = Object.fromEntries(
  readFileSync(`${PROJ}/.env`, 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const SB = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.BASE || 'https://chatterbox-7r8.pages.dev'
const SCRATCH = process.env.SCRATCH || '.'
const PW = 'Passw0rd!e2e'
const admin = createClient(SB, SERVICE, { auth: { persistSession: false } })
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const s = Date.now()
const email = `e2e-comp-${s}@e.com`
await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
const anonC = createClient(SB, ANON, { auth: { persistSession: false } })
const { data: signin } = await anonC.auth.signInWithPassword({ email, password: PW })
const { data: prof } = await admin.from('users').select('id').eq('auth_id', signin.user.id).maybeSingle()
const A = { userId: prof.id, token: signin.session.access_token }

const roomId = (await fetch(`${SB}/functions/v1/create-room`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ title: `e2e-comp-${s}` }),
}).then((r) => r.json())).room_id

const srcBytes = readFileSync(new URL('./fixtures/dub-src.mp4', import.meta.url).pathname)
const up = await fetch(`${SB}/functions/v1/create-dub-upload`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ room_id: roomId, file_name: 'e2e.mp4', size_bytes: srcBytes.length, mime_type: 'video/mp4' }),
}).then((r) => r.json())
await fetch(up.uploadUrl, { method: 'PUT', body: srcBytes, headers: { 'Content-Type': 'video/mp4' } })

// 1세그만 — 제출 1번에 allSynced(합성 게이트 개방) 도달. 유효창 1000~3600(뒤 세그 없음 → +600 전부).
const SEGS = [{ id: 1, start_ms: 1000, end_ms: 3000, text: '합성 대사' }]
const { data: sess } = await admin.from('dub_sessions').insert({
  room_id: roomId, created_by: A.userId, source_video_url: up.path, source_type: 'mp4', status: 'recording',
  roles_locked_at: new Date().toISOString(), roles_locked_by: A.userId,
  diarization_result_json: { segments: SEGS },
  consent_json: { participants: { [A.userId]: { consented: true } }, all_consented: true },
}).select('id').single()
await admin.from('dub_tracks').insert([{
  dub_session_id: sess.id, participant_id: A.userId, speaker_name: 'Segment 1',
  start_time_ms: 1000, end_time_ms: 3000, transcript_text: '합성 대사', status: 'assigned',
}])
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
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PW)
  await page.click('button[type=submit]')
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('배우로 참여')), null, { timeout: 30000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('배우로 참여'))?.click())
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('합성 대사')), null, { timeout: 90000 })
  ok(true, '인룸(1세그 세션)')

  // 녹음: 🎙 → 1바퀴 완주 후 ■(루프 기본 ON — in-page 클릭)
  await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label')?.includes('이 대사 녹음'))?.click())
  const recDone = await page.evaluate(() => new Promise((resolve) => {
    const v = document.querySelector('video')
    let seenHigh = false
    const iv = setInterval(() => {
      const ct = v?.currentTime ?? 0
      if (ct > 2.5) seenHigh = true
      if (seenHigh && ct < 1.6) {
        clearInterval(iv)
        setTimeout(() => {
          const stop = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('■'))
          stop?.click(); resolve(!!stop)
        }, 60)
      }
    }, 60)
    setTimeout(() => { clearInterval(iv); resolve(false) }, 90000)
  }))
  ok(recDone === true, '녹음 1바퀴 → ■ 중지')
  let previewSeen = false
  for (let i = 0; i < 120 && !previewSeen; i++) { await sleep(150); previewSeen = await page.evaluate(() => document.body.innerText.includes('다시 미리보기')) }
  ok(previewSeen, '프리뷰 HUD')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '제출')?.click())

  // 솔로 자동확정 → allSynced → [합성 시작] 노출
  let compBtn = false
  for (let i = 0; i < 120 && !compBtn; i++) { await sleep(500); compBtn = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('합성 시작'))) }
  ok(compBtn, '제출→자동확정→[합성 시작] 노출')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('합성 시작'))?.click())

  // 산출 폴링(DB) — 분리(fal)+wasm 합성이라 넉넉히 6분
  let out = null
  for (let i = 0; i < 120 && !(out && (out.status === 'ready' || out.status === 'failed')); i++) {
    await sleep(3000)
    const { data } = await admin.from('dub_outputs').select('*').eq('dub_session_id', sess.id).maybeSingle()
    out = data
    if (i % 10 === 0) console.log(`  … 합성 폴링 ${i * 3}s status=${out?.status ?? '없음'}`)
  }
  ok(out?.status === 'ready', `합성 완료(status=${out?.status}${out?.error_message ? ' · ' + String(out.error_message).slice(0, 80) : ''})`)

  if (out?.status === 'ready') {
    const outUrl = await fetch(`${SB}/functions/v1/get-dub-output-url`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
      body: JSON.stringify({ dub_session_id: sess.id }),
    }).then((r) => r.json())
    const dl = await fetch(outUrl.url)
    const buf = Buffer.from(await dl.arrayBuffer())
    writeFileSync(`${SCRATCH}/composite-out.mp4`, buf)
    const probe = execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', `${SCRATCH}/composite-out.mp4`]).toString()
    const info = JSON.parse(probe)
    const dur = parseFloat(info.format.duration)
    const codecs = info.streams.map((st) => `${st.codec_type}:${st.codec_name}`).join(',')
    ok(dur > 18.5 && dur < 21.5, `산출 mp4 ffprobe 실측(duration=${dur.toFixed(2)}s ≈ 소스 20s · ${buf.length} bytes)`)
    ok(info.streams.some((st) => st.codec_type === 'audio') && info.streams.some((st) => st.codec_type === 'video'), `스트림 구성(${codecs})`)
  }

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
console.log(`\n== 배포 합성 E2E(Z2 트림 실합성): ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
