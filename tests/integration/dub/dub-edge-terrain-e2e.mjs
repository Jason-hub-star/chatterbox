// 험지 E2E — 일부러 만든 지형: 붙은 세그(갭0)·초단 세그(600ms)·영상 끝 세그 + 가드/연타/재녹음 내구
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
const email = `e2e-edge-${s}@e.com`
await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
const anonC = createClient(SB, ANON, { auth: { persistSession: false } })
const { data: signin } = await anonC.auth.signInWithPassword({ email, password: PW })
const { data: prof } = await admin.from('users').select('id').eq('auth_id', signin.user.id).maybeSingle()
const A = { userId: prof.id, token: signin.session.access_token }

const roomId = (await fetch(`${SB}/functions/v1/create-room`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ title: `e2e-edge-${s}` }),
}).then((r) => r.json())).room_id

const srcBytes = readFileSync(new URL('./fixtures/dub-src.mp4', import.meta.url).pathname)
const up = await fetch(`${SB}/functions/v1/create-dub-upload`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ room_id: roomId, file_name: 'e2e.mp4', size_bytes: srcBytes.length, mime_type: 'video/mp4' }),
}).then((r) => r.json())
await fetch(up.uploadUrl, { method: 'PUT', body: srcBytes, headers: { 'Content-Type': 'video/mp4' } })

// 험지: seg1·2 붙음(갭0 → 연장0) · seg3 초단 600ms(유효창 1200) · seg4 영상 끝(20s)에 붙음(유효끝 20600 > 영상)
const SEGS = [
  { id: 1, start_ms: 1000, end_ms: 3000, text: '붙은 대사 A' },
  { id: 2, start_ms: 3000, end_ms: 5000, text: '붙은 대사 B' },
  { id: 3, start_ms: 6000, end_ms: 6600, text: '초단 대사' },
  { id: 4, start_ms: 18000, end_ms: 20000, text: '마지막 대사' },
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
const trk = (ms) => seededTracks.find((t) => t.start_time_ms === ms).id
console.log('방:', roomId, 'BASE:', BASE, '(험지 4세그)')

const errs = []
const reqs = []
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
  page.on('request', (rq) => { if (rq.url().includes('/functions/v1/')) reqs.push(rq.url().split('/').pop()) })

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
  await page.waitForFunction(() => window.__dubStore?.getState().activeSessionId, null, { timeout: 60000 })
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('붙은 대사 A')), null, { timeout: 60000 })

  const pollStore = async (fn, tries = 200, iv = 100) => {
    for (let i = 0; i < tries; i++) { await sleep(iv); if (await page.evaluate(fn)) return true }
    return false
  }
  const clickLine = (text) => page.evaluate((tx) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(tx))?.click(), text)
  const lm = () => page.evaluate(() => window.__dubStore.getState().localMode)
  const cleanup = () => page.evaluate(() => { const st = window.__dubStore.getState(); st.setLocalMode(null); st.setRec({ recPreview: null }) })

  // ── E1: 붙은 세그 — 리허설 연장 0(endMs=3000, 다음 대사 무침범) ──
  await clickLine('붙은 대사 A'); await sleep(500)
  let m = await lm()
  ok(m?.kind === 'rehearse' && m.endMs === 3000, `E1 붙은 세그 리허설 연장 0(endMs=${m?.endMs}, 기대 3000)`)
  await clickLine('붙은 대사 A'); await sleep(300)

  // ── E2: 초단 세그 — 리허설 +600(endMs=7200) ──
  await clickLine('초단 대사'); await sleep(500)
  m = await lm()
  ok(m?.kind === 'rehearse' && m.endMs === 7200, `E2 초단 세그 리허설 핸들(endMs=${m?.endMs}, 기대 7200)`)
  await clickLine('초단 대사'); await sleep(300)

  // ── E3: 초단 세그 풀사이클 — 유효창 1200ms 자동정지 ──
  await page.evaluate(() => window.__dubStore.getState().setRecLoop(false))
  await page.evaluate((tid) => window.__dubStore.getState().recEngine?.start(tid), trk(6000))
  ok(await pollStore(() => window.__dubStore.getState().recTrackId !== null), 'E3 초단 녹음 시작')
  const d3 = await page.evaluate(() => ({ lm: window.__dubStore.getState().localMode, ct: document.querySelector('video')?.currentTime, rec: window.__dubStore.getState().recTrackId }))
  console.log('  [E3 진단]', JSON.stringify(d3))
  m = d3.lm
  ok((m?.kind === 'record' || m?.kind === 'preview') && m?.endMs === 7200, `E3 record 유효끝(kind=${m?.kind}·endMs=${m?.endMs}·ct=${d3.ct?.toFixed?.(2)})`)
  ok(await pollStore(() => window.__dubStore.getState().recPreview !== null, 300), 'E3 자동정지 도달')
  const p3 = await page.evaluate(() => window.__dubStore.getState().recPreview)
  ok(p3.durationMs >= 1000 && p3.durationMs < 2400, `E3 초단 테이크(duration=${p3.durationMs}ms ≈ 창 1200+오버슛)`)
  await cleanup(); await sleep(300)

  // ── E4/E5: 가드 — 녹음 중 대사 클릭 무동작 · 프리뷰 중 클릭 무동작 ──
  await page.evaluate((tid) => window.__dubStore.getState().recEngine?.start(tid), trk(1000))
  ok(await pollStore(() => window.__dubStore.getState().recTrackId !== null), 'E4 녹음 시작(seg1)')
  await clickLine('초단 대사'); await sleep(400)
  m = await lm()
  ok(m?.kind === 'record' && m.startMs === 1000, `E4 녹음 중 대사 클릭 무동작(kind=${m?.kind}·start=${m?.startMs})`)
  await page.evaluate(() => window.__dubStore.getState().recEngine?.stop())
  ok(await pollStore(() => window.__dubStore.getState().recPreview !== null), 'E4 중지→프리뷰')
  await clickLine('초단 대사'); await sleep(400)
  m = await lm()
  ok(m?.kind === 'preview', `E5 프리뷰 중 대사 클릭 무동작(kind=${m?.kind})`)
  await cleanup(); await sleep(300)

  // ── E6: 리허설 중 녹음 시작 → record 가 자연 전환 ──
  await clickLine('붙은 대사 B'); await sleep(400)
  await page.evaluate((tid) => window.__dubStore.getState().recEngine?.start(tid), trk(3000))
  ok(await pollStore(() => window.__dubStore.getState().recTrackId !== null), 'E6 리허설→녹음 전환 시작')
  m = await lm()
  ok(m?.kind === 'record' && m.startMs === 3000, `E6 record 전환(kind=${m?.kind}·start=${m?.startMs}·endMs=${m?.endMs} — 갭0 연장0=5000 기대: ${m?.endMs === 5000})`)
  ok(await pollStore(() => window.__dubStore.getState().recPreview !== null, 300), 'E6 자동정지')

  // ── E7: [제출] 더블클릭 — busy 가드 → 최종 synced 1건 ──
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '제출')
    btn?.click(); btn?.click() // 연타
  })
  let t2 = null
  for (let i = 0; i < 40 && t2?.status !== 'synced'; i++) { await sleep(1000); const { data } = await admin.from('dub_tracks').select('status').eq('id', trk(3000)).maybeSingle(); t2 = data }
  ok(t2?.status === 'synced', `E7 더블클릭에도 정상 synced(${t2?.status})`)
  const recCount = await admin.from('dub_tracks').select('id').eq('dub_session_id', sess.id).eq('status', 'synced')
  ok(recCount.data.length === 1, `E7 synced 1건(중복 없음: ${recCount.data.length})`)

  // ── E8: 재녹음 2사이클 내구(Z1) — pathname 매번 교체 ──
  const recPath = async (tid) => page.evaluate((t) => {
    const r = window.__dubStore.getState().recordings.find((x) => x.trackId === t)
    return r ? new URL(r.url).pathname : null
  }, tid)
  const t1id = trk(1000)
  await page.evaluate(() => {
    window.__evt = []
    window.__dubStore.subscribe((st) => {
      const e = { t: Date.now() % 1000000, eng: !!st.recEngine, prev: st.recPreview?.trackId?.slice(0, 6) ?? null, status: st.status, lm: st.localMode?.kind ?? null }
      const last = window.__evt[window.__evt.length - 1]
      if (!last || last.eng !== e.eng || last.prev !== e.prev || last.status !== e.status || last.lm !== e.lm) window.__evt.push(e)
    })
  })
  const paths = []
  for (let cycle = 0; cycle < 2; cycle++) {
    if (cycle > 0 || true) {
      // 확정 상태면 해제(첫 사이클: E4 프리뷰는 미제출이라 신규 제출부터)
      const { data: t1row } = await admin.from('dub_tracks').select('status').eq('id', t1id).maybeSingle()
      if (t1row.status === 'synced') {
        await fetch(`${SB}/functions/v1/confirm-dub-track`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
          body: JSON.stringify({ dub_track_id: t1id, undo: true }),
        })
        await page.waitForFunction((t) => window.__dubStore.getState().myTurnRanges.some((r) => r.trackId === t), t1id, { timeout: 30000 }).catch(() => {})
      }
    }
    // startById 가드(내 트랙·비녹음·비busy)가 busy 중 무음 no-op — 직전 제출 onChanged 체인 종료를 먼저 기다린다
    ok(await pollStore(() => !window.__dubStore.getState().recBusy, 300), `E8 c${cycle} 시작 전 busy 해제`)
    await page.evaluate((tid) => window.__dubStore.getState().recEngine?.start(tid), t1id)
    ok(await pollStore(() => window.__dubStore.getState().recTrackId !== null), `E8 c${cycle} 녹음 시작`)
    ok(await pollStore(() => window.__dubStore.getState().recPreview !== null, 300), `E8 c${cycle} 프리뷰`)
    // busy 가드: 직전 제출의 onChanged 체인이 진행 중이면 recBusy=true → 엔진 submit 무음 리턴(UI는 disabled 등가)
    ok(await pollStore(() => !window.__dubStore.getState().recBusy, 300), `E8 c${cycle} recBusy 해제 대기`)
    await sleep(400) // 엔진 재등록 여유
    const subCtx = await page.evaluate(() => {
      const st = window.__dubStore.getState()
      const r = { engine: !!st.recEngine, busy: st.recBusy, prevTrack: st.recPreview?.trackId?.slice(0, 8) ?? null }
      void st.recEngine?.submit()
      return r
    })
    console.log(`  [E8 c${cycle} submit ctx] ${JSON.stringify(subCtx)}`)
    const reqMark = reqs.length
    let p = null
    for (let i = 0; i < 60 && (!p || paths.includes(p)); i++) {
      await sleep(500)
      p = await recPath(t1id)
      if (i === 16 && !p) {
        const { data: chk } = await admin.from('dub_tracks').select('status').eq('id', t1id).maybeSingle()
        if (chk?.status === 'assigned') {
          console.log(`  [E8 c${cycle}] 제출 무반영 감지 → 재시도(사용자 재클릭 등가)`)
          await page.evaluate(() => { void window.__dubStore.getState().recEngine?.submit() })
        }
      }
    }
    if (!p) {
      const { data: t1dbg } = await admin.from('dub_tracks').select('status, recording_url').eq('id', t1id).maybeSingle()
      const storeRecs = await page.evaluate(() => window.__dubStore.getState().recordings.map((r) => r.trackId.slice(0, 8)))
      const recErrDbg = await page.evaluate(() => window.__dubStore.getState().recError)
      console.log(`  [E8 fn호출] ${reqs.slice(reqMark).join(',') || '없음'}`)
      console.log('  [E8 store 변천]', JSON.stringify(await page.evaluate(() => window.__evt.slice(-20))))
      console.log(`  [E8 진단 c${cycle}] DB=${t1dbg?.status}·url=${(t1dbg?.recording_url || '').slice(-16)} storeRecs=${JSON.stringify(storeRecs)} recError=${recErrDbg}`)
    }
    paths.push(p)
  }
  ok(paths[0] && paths[1] && paths[0] !== paths[1], `E8 재녹음 2사이클 pathname 교체(…${(paths[0] || '').slice(-14)} → …${(paths[1] || '').slice(-14)})`)

  // ── E9: 마지막 세그(영상 끝) — 유효끝 20600 > 영상 20000: 자동정지 실측 + 수동 복구 ──
  await cleanup(); await sleep(300)
  await page.evaluate(() => window.__dubStore.getState().setRecLoop(false))
  await page.evaluate((tid) => window.__dubStore.getState().recEngine?.start(tid), trk(18000))
  ok(await pollStore(() => window.__dubStore.getState().recTrackId !== null), 'E9 마지막 세그 녹음 시작')
  const endedSeen = await pollStore(() => { const v = document.querySelector('video'); return v && v.ended === true }, 600)
  await sleep(2500)
  const stillRec = await page.evaluate(() => window.__dubStore.getState().recTrackId !== null)
  if (endedSeen && stillRec) console.log('  FINDING 영상 ended 후에도 자동정지 미발동(유효끝>영상길이 — timeupdate 사망) → 수동 중지만 가능')
  else if (endedSeen && !stillRec) console.log('  INFO 영상 ended 시점에 자동정지 동작(버그 미재현)')
  else console.log('  INFO ended 미도달(폴 타임아웃) — 판정 불가')
  await page.evaluate(() => window.__dubStore.getState().recEngine?.stop())
  ok(await pollStore(() => window.__dubStore.getState().recPreview !== null), 'E9 수동 중지 복구(프리뷰 도달)')

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
console.log(`\n== 험지 E2E: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
