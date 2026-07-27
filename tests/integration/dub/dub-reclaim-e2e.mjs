// Z4 (테이크 회수) 실렌더 스팟 — 루프 완주 바퀴 보관: 경계 직후 중지=직전 완주 저장 · 한참 말한 뒤 중지=현재 바퀴 저장
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
const email = `e2e-dubz4-${s}@e.com`
await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
const anonC = createClient(SB, ANON, { auth: { persistSession: false } })
const { data: signin } = await anonC.auth.signInWithPassword({ email, password: PW })
const { data: prof } = await admin.from('users').select('id').eq('auth_id', signin.user.id).maybeSingle()
const A = { userId: prof.id, token: signin.session.access_token }

const roomId = (await fetch(`${SB}/functions/v1/create-room`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ title: `e2e-dubz4-${s}` }),
}).then((r) => r.json())).room_id

const srcBytes = readFileSync(new URL('./fixtures/dub-src.mp4', import.meta.url).pathname)
const up = await fetch(`${SB}/functions/v1/create-dub-upload`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ room_id: roomId, file_name: 'e2e.mp4', size_bytes: srcBytes.length, mime_type: 'video/mp4' }),
}).then((r) => r.json())
await fetch(up.uploadUrl, { method: 'PUT', body: srcBytes, headers: { 'Content-Type': 'video/mp4' } })

const SEGS = [
  { id: 1, start_ms: 1000, end_ms: 3000, text: '첫 번째 대사' }, // 유효창 1000~3600(핸들 600) = 2600ms
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
console.log('방:', roomId, 'BASE:', BASE)

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

  const rl = await page.evaluate(() => window.__dubStore.getState().recLoop)
  ok(rl === true, `루프 기본 ON(${rl})`)

  // 함정5: 룸 진입 후 waitForFunction 통째 불안정 — evaluate 수동 폴링으로 대체
  const pollStore = async (fn, tries = 200, iv = 100) => {
    for (let i = 0; i < tries; i++) { await sleep(iv); if (await page.evaluate(fn)) return true }
    return false
  }

  // 랩 감지(이벤트 기반): 헤드리스 첫 재생 스톨로 바퀴 벽시계가 늘어날 수 있어 sleep 자(尺)는 못 쓴다 —
  // currentTime 이 2.5s 를 넘었다가 1.6s 아래로 복귀하면 restartTake 발생으로 판정.
  const waitWrap = async () => {
    let seenHigh = false
    for (let i = 0; i < 300; i++) {
      await sleep(100)
      const ct = await page.evaluate(() => document.querySelector('video')?.currentTime ?? 0)
      if (ct > 2.5) seenHigh = true
      if (seenHigh && ct < 1.6) return true
    }
    return false
  }

  // ── ① 회수: 1바퀴 완주 직후(현재 바퀴 갓 시작) 중지 → 직전 완주 테이크 저장 + 토스트 ──
  // 랩 감지→즉시 중지를 페이지 안 단일 evaluate 로 — Node 왕복 지연이 임계 1.5s 를 잡아먹는 것 차단
  await page.evaluate((tid) => window.__dubStore.getState().recEngine?.start(tid), track1Id)
  ok(await pollStore(() => window.__dubStore.getState().recTrackId !== null), '녹음 시작(recTrackId)')
  const wrapped1 = await page.evaluate(() => new Promise((resolve) => {
    const v = document.querySelector('video')
    let seenHigh = false
    const iv = setInterval(() => {
      const ct = v?.currentTime ?? 0
      if (ct > 2.5) seenHigh = true
      if (seenHigh && ct < 1.6) {
        clearInterval(iv)
        // 스왑 창(~100ms)을 지나되 임계 안 최소 지연(60ms) 중지 — 회수 경로 확정
        setTimeout(() => { window.__dubStore.getState().recEngine?.stop(); resolve(true) }, 60)
      }
    }, 60)
    setTimeout(() => { clearInterval(iv); resolve(false) }, 60000)
  }))
  ok(wrapped1 === true, '1바퀴 완주 감지 → 60ms 뒤 in-page 중지')
  // 토스트(4s 소멸)와 프리뷰는 stop 핸들러 같은 틱에 발생 — 느린 페이지에서 순차 대기가 소멸창을 놓치지 않게 한 폴에서 동시 수집
  let p1 = null, toastSeen = false
  for (let i = 0; i < 100 && (!p1 || !toastSeen); i++) {
    await sleep(100)
    const r = await page.evaluate(() => ({
      prev: window.__dubStore.getState().recPreview,
      toast: document.body.innerText.includes('직전에 완주한 테이크를 저장했어요'),
    }))
    if (r.prev) p1 = r.prev
    if (r.toast) toastSeen = true
  }
  // 판정 규칙을 __dubTakeStats(DEV 훅)로 실측 — 과부하 머신의 타이밍 역추정 대신 결정 자체를 검증
  const st1 = await page.evaluate(() => window.__dubTakeStats)
  ok(!!st1 && st1.lastFullMs > 1500, `완주 바퀴 보관 실측(lastFull=${st1?.lastFullMs}ms·partial=${st1?.partialMs}ms·임계=${st1?.reclaimMs}ms)`)
  ok(!!st1 && st1.reclaimed === (st1.lastFullMs > 0 && st1.partialMs < st1.reclaimMs), `회수 규칙 판정 일치(reclaimed=${st1?.reclaimed})`)
  ok(!!p1 && !!st1 && p1.durationMs === (st1.reclaimed ? st1.lastFullMs : st1.partialMs), `저장본 = ${st1?.reclaimed ? '직전 완주분' : '현재 바퀴'}(${p1?.durationMs}ms)`)
  if (st1?.reclaimed) ok(toastSeen, '회수 토스트(takeReclaimed) 발화')
  else console.log(`  INFO 이번 런은 partial(${st1?.partialMs}ms) ≥ 임계라 비회수 경로 — 회수 토스트는 회수 런에서 검증`)

  // ── ② 의도적 새 테이크: 랩 후 1.9s(임계 1.5s 초과) 진행하고 중지 → 현재 바퀴 저장(회수 안 함) ──
  await sleep(4200) // 토스트 소멸 대기(4s) — ②에서 토스트 오검출 방지
  await page.evaluate(() => window.__dubStore.getState().setLocalMode(null))
  await sleep(300)
  await page.evaluate((tid) => window.__dubStore.getState().recEngine?.start(tid), track1Id)
  ok(await pollStore(() => window.__dubStore.getState().recTrackId !== null), '녹음 시작(recTrackId)')
  const wrapped2 = await page.evaluate(() => new Promise((resolve) => {
    const v = document.querySelector('video')
    let seenHigh = false
    const iv = setInterval(() => {
      const ct = v?.currentTime ?? 0
      if (ct > 2.5) seenHigh = true
      if (seenHigh && ct < 1.6) {
        clearInterval(iv)
        // 새 바퀴 1.9s(임계 1.5s 초과) 진행 후 중지 — 바퀴 wall ≥2.6s 라 2차 랩 전
        setTimeout(() => { window.__dubStore.getState().recEngine?.stop(); resolve(true) }, 1900)
      }
    }, 60)
    setTimeout(() => { clearInterval(iv); resolve(false) }, 60000)
  }))
  ok(wrapped2 === true, '2차: 랩 감지 → 1.9s 진행 후 in-page 중지')
  ok(await pollStore(() => window.__dubStore.getState().recPreview !== null), '2차 중지→프리뷰')
  const p2 = await page.evaluate(() => window.__dubStore.getState().recPreview)
  const st2 = await page.evaluate(() => window.__dubTakeStats)
  ok(!!st2 && st2.reclaimed === false && st2.partialMs >= st2.reclaimMs, `의도적 새 테이크 판정(partial=${st2?.partialMs}ms ≥ 임계 ${st2?.reclaimMs}ms·비회수)`)
  ok(!!p2 && !!st2 && p2.durationMs === st2.partialMs, `현재 바퀴 저장(duration=${p2?.durationMs}ms)`)

  ok(errs.length === 0, `콘솔에러 없음 (${errs.length})${errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''}`)
} catch (e) {
  fail++; console.log('  FAIL 흐름:', String(e.message || e).split('\n')[0])
  if (page) {
    console.log('  [진단] URL:', page.url())
    console.log('  [진단] BODY:', (await page.evaluate(() => document.body.innerText).catch(() => '?')).slice(0, 300).replace(/\n+/g, ' | '))
    console.log('  [진단] ERRS:', errs.slice(0, 6).join(' || ') || 'none')
  }
} finally {
  await browser.close()
  try { await admin.from('rooms').delete().eq('id', roomId) } catch { /* noop */ }
}
console.log(`\n== Z4 테이크 회수 실렌더 스팟: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
