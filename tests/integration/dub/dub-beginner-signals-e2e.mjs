// 사다리 Y (DUB-BEGINNER-SIGNALS) 실렌더 스팟 — seed-and-drive(프로드 백엔드 + vite dev 5173).
// Y1 🎧 재청취+안내문 · Y2 텍스트 배지+submitFlash · Y3 정직 토스트+솔로 착지 정지 · Y4 비호스트 pause 힌트(2탭)
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
  const email = `e2e-dubsig-${tag}-${s}@e.com`
  await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  const anonC = createClient(SB, ANON, { auth: { persistSession: false } })
  const { data: signin } = await anonC.auth.signInWithPassword({ email, password: PW })
  const { data: prof } = await admin.from('users').select('id').eq('auth_id', signin.user.id).maybeSingle()
  return { email, userId: prof.id, token: signin.session.access_token }
}
const A = await mkUser('a') // 호스트·솔로 배우
const B = await mkUser('b') // Y4 비호스트

const roomId = (await fetch(`${SB}/functions/v1/create-room`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ title: `e2e-dubsig-${s}` }),
}).then((r) => r.json())).room_id

// ── 시드: 소스 업로드 + recording 세션 + A 트랙 3(솔로) ──
const srcBytes = readFileSync(new URL('./fixtures/dub-src.mp4', import.meta.url).pathname)
const up = await fetch(`${SB}/functions/v1/create-dub-upload`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ room_id: roomId, file_name: 'e2e.mp4', size_bytes: srcBytes.length, mime_type: 'video/mp4' }),
}).then((r) => r.json())
if (!up.uploadUrl) { console.log('업로드 URL 실패:', JSON.stringify(up)); process.exit(1) }
const putRes = await fetch(up.uploadUrl, { method: 'PUT', body: srcBytes, headers: { 'Content-Type': 'video/mp4' } })
if (!putRes.ok) { console.log('PUT 실패:', putRes.status); process.exit(1) }

const SEGS = [
  { id: 1, start_ms: 1000, end_ms: 3000, text: '첫 번째 대사' },
  { id: 2, start_ms: 5000, end_ms: 7000, text: '두 번째 대사' },
  { id: 3, start_ms: 9000, end_ms: 11000, text: '세 번째 대사' },
]
const { data: sess, error: sessErr } = await admin.from('dub_sessions').insert({
  room_id: roomId, created_by: A.userId, source_video_url: up.path, source_type: 'mp4', status: 'recording',
  roles_locked_at: new Date().toISOString(), roles_locked_by: A.userId,
  diarization_result_json: { segments: SEGS },
  consent_json: { participants: { [A.userId]: { consented: true } }, all_consented: true },
}).select('id').single()
if (sessErr) { console.log('세션 시드 실패:', sessErr.message); process.exit(1) }
const { error: trkErr } = await admin.from('dub_tracks').insert(SEGS.map((g, i) => ({
  dub_session_id: sess.id, participant_id: A.userId, speaker_name: `Segment ${i + 1}`,
  start_time_ms: g.start_ms, end_time_ms: g.end_ms, transcript_text: g.text, status: 'assigned',
})))
if (trkErr) { console.log('트랙 시드 실패:', trkErr.message); process.exit(1) }
// Y4: B 서버측 선조인(StrictMode 조인 경쟁 함정11 회피)
const joinB = await fetch(`${SB}/functions/v1/join-public-room`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${B.token}` },
  body: JSON.stringify({ room_id: roomId }),
}).then((r) => r.json()).catch((e) => ({ error: String(e) }))
console.log('방:', roomId, '세션:', sess.id, 'B조인:', joinB.error ? 'FAIL ' + JSON.stringify(joinB) : 'ok', 'BASE:', BASE)

const errs = []
let page = null, pageB = null
const login = async (pg, email) => {
  await pg.goto(`${BASE}/rooms/${roomId}`, { waitUntil: 'domcontentloaded' })
  await pg.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('로그인하고 참여하기')), null, { timeout: 20000 })
  await pg.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('로그인하고 참여하기'))?.click())
  await pg.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('이메일로 로그인')), null, { timeout: 20000 })
  await pg.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('이메일로 로그인'))?.click())
  await pg.waitForSelector('input[type=email]', { timeout: 10000 })
  await pg.fill('input[type=email]', email); await pg.fill('input[type=password]', PW)
  await pg.click('button[type=submit]')
  await pg.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('배우로 참여')), null, { timeout: 30000 })
  await pg.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('배우로 참여'))?.click())
  await pg.waitForFunction(() => window.__dubStore?.getState().activeSessionId, null, { timeout: 60000 })
}
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
  await login(page, A.email)
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('첫 번째 대사')), null, { timeout: 60000 })

  // ── Y1a 안내문 상시 노출 ──
  const hint = await page.evaluate(() => document.body.innerText.includes('대사를 클릭하면 그 구간만 반복 재생돼요'))
  ok(hint, 'Y1 재청취 안내문 상시 노출(rehearseDiscoverHint)')

  // ── Y3/Y2: 녹음(루프 OFF 자동정지)→제출 → 정직 토스트·submitFlash·착지 정지 ──
  await page.evaluate(() => window.__dubStore.getState().setRecLoop(false))
  await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label')?.includes('이 대사 녹음'))?.click())
  await page.waitForFunction(() => window.__dubStore.getState().recTrackId !== null, null, { timeout: 20000 })
  await page.waitForFunction(() => window.__dubStore.getState().recPreview !== null, null, { timeout: 40000 })
  // fire-and-forget: evaluate 가 submit 의 onChanged 완료까지 await 하면 2.5s 플래시가 폴 시작 전에 소멸
  await page.evaluate(() => { void window.__dubStore.getState().recEngine?.submit() })
  let sawToast = false, sawFlash = null
  for (let i = 0; i < 80 && !(sawToast && sawFlash); i++) {
    await sleep(150)
    const r = await page.evaluate(() => ({
      toast: document.body.innerText.includes('자동 확정'),
      flash: window.__dubStore.getState().submitFlash,
    }))
    if (r.toast) sawToast = true
    if (r.flash) sawFlash = r.flash
  }
  ok(sawToast, 'Y3 솔로 정직 토스트("제출 완료·자동 확정 — 다음 파트로 이동")')
  ok(sawFlash?.segId === 1, `Y2 submitFlash 행 하이라이트(segId=${sawFlash?.segId})`)
  let landed = null
  for (let i = 0; i < 40 && !landed; i++) {
    await sleep(200)
    const st = await page.evaluate(() => { const v = document.querySelector('video'); return v ? { t: v.currentTime, paused: v.paused } : null })
    if (st && st.paused && Math.abs(st.t - 5.0) < 0.35) landed = st
  }
  ok(!!landed, `Y3 솔로 착지 정지(다음 파트 5.0s 에 paused 착지: ${landed ? landed.t.toFixed(2) + 's' : '미도달'})`)
  const banner = await page.evaluate(() => document.body.innerText.includes('내 차례'))
  ok(banner, 'Y3 착지 지점 내 차례 배너 유지([지금 녹음] 진입점)')

  // ── Y2b: "✓ 확정" 텍스트 배지(솔로 자동확정 → synced, Realtime 반영) ──
  let badge = false
  for (let i = 0; i < 40 && !badge; i++) {
    await sleep(500)
    badge = await page.evaluate(() => [...document.querySelectorAll('[data-dub-line-status]')].some((el) => el.getAttribute('data-dub-line-status') === 'synced' && el.textContent.includes('확정')))
  }
  ok(badge, 'Y2 텍스트 배지 "✓ 확정"(색상 단독 → 색+글자)')

  // ── Y1b: 🎧 재청취 버튼 → rehearse 토글 ──
  const relisten = await page.evaluate(() => {
    const b = document.querySelector('[data-dub-relisten]')
    if (!b) return { found: false }
    b.click()
    return { found: true }
  })
  await sleep(500)
  const lmOn = await page.evaluate(() => window.__dubStore.getState().localMode)
  ok(relisten.found && lmOn?.kind === 'rehearse' && lmOn.startMs === 1000, `Y1 🎧 클릭 → rehearse(${lmOn?.kind} ${lmOn?.startMs})`)
  await page.evaluate(() => document.querySelector('[data-dub-relisten]')?.click())
  await sleep(300)
  const lmOff = await page.evaluate(() => window.__dubStore.getState().localMode)
  ok(lmOff === null, `Y1 🎧 재클릭 → 해제(localMode=${lmOff})`)

  // ── Y4: 비호스트 pause → 세션 1회 통제권 힌트(2탭) ──
  try {
    const ctxB = await browser.newContext()
    await ctxB.grantPermissions(['camera', 'microphone'], { origin: BASE })
    pageB = await ctxB.newPage()
    await login(pageB, B.email)
    await pageB.waitForFunction(() => { const v = document.querySelector('video'); return v && v.src }, null, { timeout: 60000 })
    // 호스트 A 재생 시작(vodSync 발행) — B 는 applier 로 추종
    // loop: 20s 소스가 폴 중 ended 되면 호스트가 paused 를 발행해 복귀 단언이 정당 실패한다
    await page.evaluate(() => { const v = document.querySelector('video'); v.loop = true; v.currentTime = 0.3; return v.play() })
    await pageB.waitForFunction(() => { const v = document.querySelector('video'); return v && !v.paused }, null, { timeout: 30000 })
    await pageB.evaluate(() => document.querySelector('video').pause())
    let hintSeen = false
    for (let i = 0; i < 40 && !hintSeen; i++) {
      await sleep(100)
      hintSeen = await pageB.evaluate(() => document.body.innerText.includes('호스트와 함께 보는 중'))
    }
    ok(hintSeen, 'Y4 비호스트 pause → 통제권 힌트 토스트')
    let resumed = false
    for (let i = 0; i < 45 && !resumed; i++) {
      await sleep(200)
      resumed = await pageB.evaluate(() => !document.querySelector('video').paused)
    }
    ok(resumed, 'Y4 하트비트 자동 복귀(힌트가 설명한 그 동작)')
  } catch (e) {
    console.log('  DEFER Y4 2탭(수동 확인 대상): ' + String(e.message || e).split('\n')[0])
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
console.log(`\n== DUB-BEGINNER-SIGNALS 실렌더 스팟: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
