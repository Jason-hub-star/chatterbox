// DUB-PART-LOOP E2E — seed-and-drive(프로드 백엔드 + 로컬 vite dev 5173 = 신규 프론트 코드).
// 검증: ①리허설 구간 반복+해제 ②녹음 루프=테이크 재시작(짧은 durationMs) ③구간 끝 자동 정지
//       ④제출→synced→recordings(endTimeMs=프로드 end_time_ms 실측) ⑤상시 레이어 스케줄+시크 재정렬
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
const email = `e2e-dubloop-${s}@e.com`
await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
const anonC = createClient(SB, ANON, { auth: { persistSession: false } })
const { data: signin } = await anonC.auth.signInWithPassword({ email, password: PW })
const { data: prof } = await admin.from('users').select('id').eq('auth_id', signin.user.id).maybeSingle()
const A = { userId: prof.id, token: signin.session.access_token }

const roomId = (await fetch(`${SB}/functions/v1/create-room`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ title: `e2e-dubloop-${s}` }),
}).then((r) => r.json())).room_id

// ── 시드: 소스 업로드(R2 실 presign 경로) + recording 세션 + assigned 트랙 3 ──
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
const { data: seededTracks, error: trkErr } = await admin.from('dub_tracks').insert(SEGS.map((g, i) => ({
  dub_session_id: sess.id, participant_id: A.userId, speaker_name: `Segment ${i + 1}`,
  start_time_ms: g.start_ms, end_time_ms: g.end_ms, transcript_text: g.text, status: 'assigned',
}))).select('id, start_time_ms')
if (trkErr) { console.log('트랙 시드 실패:', trkErr.message); process.exit(1) }
console.log('방:', roomId, '세션:', sess.id, '(recording·assigned×3) BASE:', BASE)

const errs = []
let page = null // 진단 덤프용 상위 스코프
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
    if (/separate-dub-audio/.test(url)) return // 베드 캐시 프로브 cache_only 미스 404 = 설계상 정상
    if (/XNNPACK|TensorFlow|favicon|MediaPipe|WebGL|livekit|room connection/i.test(m.text())) return
    errs.push(`${m.text().slice(0, 140)} @${url.slice(-60)}`)
  })
  page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 180)))

  await page.goto(`${BASE}/rooms/${roomId}`, { waitUntil: 'domcontentloaded' })
  // 게스트 관전 게이트(2026-07 룸 감사 신설): [로그인하고 참여하기] 선행 클릭
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('로그인하고 참여하기')), null, { timeout: 20000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('로그인하고 참여하기'))?.click())
  // 소셜우선 로그인(함정18): [이메일로 로그인] 클릭 후 폼 등장
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('이메일로 로그인')), null, { timeout: 20000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('이메일로 로그인'))?.click())
  await page.waitForSelector('input[type=email]', { timeout: 10000 })
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PW)
  await page.click('button[type=submit]')

  // 참여 방식 모달(룸 감사 신설): [배우로 참여] 선택
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('배우로 참여')), null, { timeout: 30000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('배우로 참여'))?.click())

  // 인룸 + 더빙 세션 로드(dubStore DEV 훅)
  await page.waitForFunction(() => window.__dubStore?.getState().activeSessionId, null, { timeout: 60000 })
  const segCount = await page.evaluate(() => window.__dubStore.getState().segments.length)
  ok(segCount === 3, `더빙 세션 로드(세그 ${segCount}/3)`)
  // 좌패널 대사 버튼 노출 대기(connected && dubActive)
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('첫 번째 대사')), null, { timeout: 60000 })

  // ── ① 리허설: 대사 클릭 = 구간 반복 · 재클릭 = 해제 ──
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('첫 번째 대사'))?.click())
  await sleep(600)
  const lm1 = await page.evaluate(() => window.__dubStore.getState().localMode)
  ok(lm1?.kind === 'rehearse' && lm1.startMs === 1000 && lm1.endMs === 3600, `리허설 진입(Z2 핸들 +600)(localMode=${lm1?.kind} ${lm1?.startMs}-${lm1?.endMs})`)
  // 반복 관찰: currentTime 이 구간 끝 근처까지 갔다가 시작으로 되감기(≥1회).
  // maxT 는 시크 적용 후(t≤2.2 최초 관측)부터 계측 — 첫 샘플이 시크 전 위치(페이지 바쁨)를 잡는 오탐 배제.
  let wraps = 0, prevT = 0, maxT = 0, anchored = false
  for (let i = 0; i < 45 && wraps < 1; i++) {
    await sleep(200)
    const t = await page.evaluate(() => document.querySelector('video')?.currentTime ?? 0)
    if (!anchored && t <= 2.2) anchored = true
    if (anchored && t > maxT) maxT = t
    if (anchored && prevT - t > 0.8 && t < 2.2) wraps++
    prevT = t
  }
  ok(wraps >= 1 && maxT < 4.0, `구간 반복 실측(wrap=${wraps}·구간 내 maxT=${maxT.toFixed(2)}s<4.0)`)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('첫 번째 대사'))?.click())
  await sleep(300)
  const lm2 = await page.evaluate(() => window.__dubStore.getState().localMode)
  ok(lm2 === null, `재클릭 해제(localMode=${lm2})`)

  // ── ② 녹음 루프 = 테이크 재시작: 2패스 이상 돌린 뒤 중지 → 마지막 테이크만(짧은 duration) ──
  const recLoopDefault = await page.evaluate(() => window.__dubStore.getState().recLoop)
  ok(recLoopDefault === true, `recLoop 기본 ON(${recLoopDefault})`)
  await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label')?.includes('이 대사 녹음'))?.click())
  await page.waitForFunction(() => window.__dubStore.getState().recTrackId !== null, null, { timeout: 15000 })
  await sleep(5600) // 카운트다운 후 세그 2s × ≥2패스 경과 — 루프 재시작이 녹음을 유지해야 함
  const stillRec = await page.evaluate(() => ({ rec: window.__dubStore.getState().recTrackId !== null, lm: window.__dubStore.getState().localMode?.kind }))
  ok(stillRec.rec && stillRec.lm === 'record', `루프 2패스+ 후에도 녹음 유지(rec=${stillRec.rec}·${stillRec.lm})`)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('■'))?.click())
  await page.waitForFunction(() => window.__dubStore.getState().recPreview !== null, null, { timeout: 10000 })
  const prev1 = await page.evaluate(() => window.__dubStore.getState().recPreview)
  ok(prev1.durationMs >= 300 && prev1.durationMs < 3200, `테이크 재시작 실측 — 마지막 테이크만(duration=${prev1.durationMs}ms < 3200)`)

  // ── ③ 제출 → 솔로 자동확정(synced) → recordings(endTimeMs 프로드 실측) ──
  await page.evaluate(() => window.__dubStore.getState().recEngine?.submit())
  let track1 = null
  for (let i = 0; i < 30 && track1?.status !== 'synced'; i++) {
    await sleep(1000)
    const { data } = await admin.from('dub_tracks').select('status, recording_url, recording_duration_ms').eq('dub_session_id', sess.id).eq('start_time_ms', 1000).maybeSingle()
    track1 = data
  }
  ok(track1?.status === 'synced' && !!track1.recording_url, `제출→자동확정 synced(rec=${track1?.recording_duration_ms}ms)`)
  await page.waitForFunction(() => window.__dubStore.getState().recordings.length >= 1, null, { timeout: 20000 })
  const recs = await page.evaluate(() => window.__dubStore.getState().recordings)
  ok(recs[0].endTimeMs === 3000, `recordings.endTimeMs=3000 (프로드 get-dub-recordings end_time_ms 실측: ${recs[0].endTimeMs})`)

  // ── ④ 상시 레이어: 일반 재생 스케줄 + 시크 재정렬 ──
  await page.evaluate(() => { const v = document.querySelector('video'); v.currentTime = 0.3; return v.play() })
  await page.waitForFunction(() => (window.__dubLayerStats?.scheduled ?? 0) >= 1, null, { timeout: 15000 })
  const st1 = await page.evaluate(() => window.__dubLayerStats)
  ok(st1.scheduled >= 1 && st1.ctxState === 'running', `상시 레이어 스케줄(scheduled=${st1.scheduled}·ctx=${st1.ctxState})`)
  await page.evaluate(() => { document.querySelector('video').currentTime = 0.1 })
  await sleep(800)
  const st2 = await page.evaluate(() => window.__dubLayerStats)
  ok(st2.reschedules > st1.reschedules, `시크 재정렬(reschedules ${st1.reschedules}→${st2.reschedules})`)

  // ── ⑤ 루프 OFF 자동 정지: 구간 끝 도달 시 손 안 대고 프리뷰 진입 ──
  await page.evaluate(() => window.__dubStore.getState().setRecLoop(false))
  await page.evaluate(() => window.__dubStore.getState().setLocalMode(null))
  await sleep(400)
  await page.evaluate((tid) => window.__dubStore.getState().recEngine?.start(tid),
    seededTracks.find((t) => t.start_time_ms === 5000).id)
  await page.waitForFunction(() => window.__dubStore.getState().recTrackId !== null, null, { timeout: 15000 })
  await page.waitForFunction(() => window.__dubStore.getState().recPreview !== null, null, { timeout: 15000 })
  const prev2 = await page.evaluate(() => window.__dubStore.getState().recPreview)
  ok(prev2.durationMs >= 1500 && prev2.durationMs < 3400, `구간 끝 자동 정지(duration=${prev2.durationMs}ms ≈ 세그 2000+오버슛)`)

  ok(errs.length === 0, `콘솔에러 없음 (${errs.length})${errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''}`)
} catch (e) {
  fail++; console.log('  FAIL 흐름:', String(e.message || e).split('\n')[0])
  if (page) {
    console.log('  [진단] URL:', page.url())
    console.log('  [진단] BODY:', (await page.evaluate(() => document.body.innerText).catch(() => '?')).slice(0, 500).replace(/\n+/g, ' | '))
    console.log('  [진단] dubStore:', await page.evaluate(() => { const s = window.__dubStore?.getState(); return s ? JSON.stringify({ sess: s.activeSessionId, status: s.status, segs: s.segments.length }) : 'no hook' }).catch(() => '?'))
    console.log('  [진단] ERRS:', errs.slice(0, 6).join(' || ') || 'none')
  }
} finally {
  await browser.close()
  try { await admin.from('rooms').delete().eq('id', roomId) } catch { /* noop */ }
  // R2 소스 객체는 presign DELETE 미노출 — 90d 보존정책 소멸(고아 1개·비치명)
}
console.log(`\n== DUB-PART-LOOP E2E: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
