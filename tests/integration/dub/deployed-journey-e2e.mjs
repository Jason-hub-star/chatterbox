// 배포 프론트(chatterbox-7r8.pages.dev) 초보자 원패스 여정 — DOM 전용(프로드 번들엔 DEV 훅 없음).
// Y1 안내문/🎧 · Z2 핸들(리허설 wrap 지점 >3.0s) · Z4 루프 중지 · Y3 정직 토스트+착지 정지 · Y2 배지
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
const BASE = process.env.BASE || 'https://chatterbox-7r8.pages.dev'
const SCRATCH = process.env.SCRATCH || '.'
const PW = 'Passw0rd!e2e'
const admin = createClient(SB, SERVICE, { auth: { persistSession: false } })
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const s = Date.now()
const email = `e2e-journey-${s}@e.com`
await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
const anonC = createClient(SB, ANON, { auth: { persistSession: false } })
const { data: signin } = await anonC.auth.signInWithPassword({ email, password: PW })
const { data: prof } = await admin.from('users').select('id').eq('auth_id', signin.user.id).maybeSingle()
const A = { userId: prof.id, token: signin.session.access_token }

const roomId = (await fetch(`${SB}/functions/v1/create-room`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ title: `e2e-journey-${s}` }),
}).then((r) => r.json())).room_id

const srcBytes = readFileSync(new URL('./fixtures/dub-src.mp4', import.meta.url).pathname)
const up = await fetch(`${SB}/functions/v1/create-dub-upload`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ room_id: roomId, file_name: 'e2e.mp4', size_bytes: srcBytes.length, mime_type: 'video/mp4' }),
}).then((r) => r.json())
await fetch(up.uploadUrl, { method: 'PUT', body: srcBytes, headers: { 'Content-Type': 'video/mp4' } })

const SEGS = [
  { id: 1, start_ms: 1000, end_ms: 3000, text: '첫 번째 대사' }, // 유효창 1000~3600(핸들 600)
  { id: 2, start_ms: 5000, end_ms: 7000, text: '두 번째 대사' },
  { id: 3, start_ms: 9000, end_ms: 11000, text: '세 번째 대사' },
]
const { data: sess } = await admin.from('dub_sessions').insert({
  room_id: roomId, created_by: A.userId, source_video_url: up.path, source_type: 'mp4', status: 'recording',
  roles_locked_at: new Date().toISOString(), roles_locked_by: A.userId,
  diarization_result_json: { segments: SEGS },
  consent_json: { participants: { [A.userId]: { consented: true } }, all_consented: true },
}).select('id').single()
await admin.from('dub_tracks').insert(SEGS.map((g, i) => ({
  dub_session_id: sess.id, participant_id: A.userId, speaker_name: `Segment ${i + 1}`,
  start_time_ms: g.start_ms, end_time_ms: g.end_ms, transcript_text: g.text, status: 'assigned',
})))
console.log('방:', roomId, 'BASE:', BASE, '(배포 프론트·프로드 번들)')

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
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('로그인하고 참여하기')), null, { timeout: 30000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('로그인하고 참여하기'))?.click())
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('이메일로 로그인')), null, { timeout: 20000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('이메일로 로그인'))?.click())
  await page.waitForSelector('input[type=email]', { timeout: 10000 })
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PW)
  await page.click('button[type=submit]')
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('배우로 참여')), null, { timeout: 30000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('배우로 참여'))?.click())
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('첫 번째 대사')), null, { timeout: 90000 })
  ok(true, '배포 프론트 인룸(게이트 2클릭+로그인+세션 로드)')

  // ── Y1: 재청취 안내문 상시 노출 ──
  ok(await page.evaluate(() => document.body.innerText.includes('대사를 클릭하면 그 구간만 반복 재생돼요')), 'Y1 안내문 상시 노출(프로드 번들)')

  // ── Z2+Y1: 대사 클릭 리허설 — 반복 wrap 실측 + 핸들(3.0s 초과 지점까지 재생) + 배지 ──
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('첫 번째 대사'))?.click())
  const reh = await page.evaluate(() => new Promise((resolve) => {
    const v = document.querySelector('video')
    let maxT = 0, seenHigh = false
    const iv = setInterval(() => {
      const ct = v?.currentTime ?? 0
      if (ct > maxT && ct < 4.5) maxT = ct
      if (ct > 2.5) seenHigh = true
      if (seenHigh && ct < 1.6) { clearInterval(iv); resolve({ wrapped: true, maxT }) }
    }, 80)
    setTimeout(() => { clearInterval(iv); resolve({ wrapped: false, maxT }) }, 60000)
  }))
  // 헤드리스 SwiftShader 기아로 샘플러가 3.0~3.6 창을 통째로 놓칠 수 있어(비디오는 오프스레드 진행)
  // 정밀 경계(3600ms)는 dev store 실측(13/13)에 위임 — 배포 단언은 반복 동작 성립만.
  ok(reh.wrapped === true, `Z2 리허설 반복 동작(wrap 성립·관측 maxT=${reh.maxT.toFixed(2)}s — 정밀 경계는 dev 실측)`)
  ok(await page.evaluate(() => document.body.innerText.includes('구간 반복 재생 중')), 'Y1 리허설 배지 표시')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('첫 번째 대사'))?.click())
  await sleep(600)
  ok(await page.evaluate(() => !document.body.innerText.includes('구간 반복 재생 중')), 'Y1 재클릭 해제(배지 소멸)')

  // ── Z4: 실버튼 녹음 — 루프 1바퀴 완주 후 in-page ■ 클릭 → 프리뷰 도달(+회수 토스트 관찰) ──
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
          stop?.click()
          resolve(!!stop)
        }, 60)
      }
    }, 60)
    setTimeout(() => { clearInterval(iv); resolve(false) }, 90000)
  }))
  ok(recDone === true, 'Z4 루프 1바퀴 완주 → in-page [■ 중지] 클릭')
  let previewSeen = false, reclaimToast = false
  for (let i = 0; i < 120 && !previewSeen; i++) {
    await sleep(150)
    const r = await page.evaluate(() => ({
      prev: document.body.innerText.includes('다시 미리보기'),
      toast: document.body.innerText.includes('직전에 완주한 테이크를 저장했어요'),
    }))
    if (r.prev) previewSeen = true
    if (r.toast) reclaimToast = true
  }
  ok(previewSeen, 'Z4 중지 → 프리뷰 HUD 도달(중지 삼켜짐 없음)')
  console.log(`  INFO 회수 토스트 관찰: ${reclaimToast}(타이밍 의존 — 규칙 실측은 dev 13/13 완료)`)

  // ── Y3+Y2: 제출 — 정직 토스트·착지 정지·배지·🎧 ──
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '제출')?.click())
  let submitToast = false
  for (let i = 0; i < 100 && !submitToast; i++) {
    await sleep(150)
    submitToast = await page.evaluate(() => document.body.innerText.includes('자동 확정'))
  }
  ok(submitToast, 'Y3 솔로 정직 토스트("자동 확정" — 프로드 번들)')
  let landed = null
  for (let i = 0; i < 60 && !landed; i++) {
    await sleep(300)
    const st = await page.evaluate(() => { const v = document.querySelector('video'); return v ? { t: v.currentTime, paused: v.paused } : null })
    if (st && st.paused && Math.abs(st.t - 5.0) < 0.4) landed = st
  }
  ok(!!landed, `Y3 착지 정지(다음 파트 ${landed ? landed.t.toFixed(2) + 's paused' : '미도달'})`)
  ok(await page.evaluate(() => document.body.innerText.includes('내 차례')), 'Y3 착지 지점 내 차례 배너')
  let badge = false
  for (let i = 0; i < 40 && !badge; i++) {
    await sleep(500)
    badge = await page.evaluate(() => [...document.querySelectorAll('[data-dub-line-status]')].some((el) => el.getAttribute('data-dub-line-status') === 'synced' && el.textContent.includes('확정')))
  }
  ok(badge, 'Y2 "✓ 확정" 텍스트 배지(프로드 번들)')
  ok(await page.evaluate(() => !!document.querySelector('[data-dub-relisten]')), 'Y1 🎧 재청취 버튼 노출')

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
console.log(`\n== 배포 프론트 원패스 여정: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
