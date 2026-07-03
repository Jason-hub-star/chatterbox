// seed-and-drive 패턴 — "이전 파이프라인 상태가 있어야 뜨는 UI"(합성·완성본 등)를 전체 흐름 재구동 없이 검증.
//   ① service_role 로 목표 DB 상태 직접 시드(여기: dub_session=recording + dub_track=synced + 소스/녹음 업로드)
//   ② 실브라우저에서 그 지점의 액션만 수행([합성] 클릭)
//   ③ 비동기 완료를 DB 폴링으로 감지(브라우저는 백그라운드 진행)
//   ④ 산출물을 다운로드해 ffprobe 로 ground-truth 검증
// 배포판/로컬 겸용(BASE). DUB-05 3b 는 이 패턴으로 배포판 실브라우저 5/5(fal 분리→ffmpeg.wasm→유효 mp4) 실증.
// 실행: SCRATCH=<dir> BASE=https://chatterbox-7r8.pages.dev node seed-drive-composite-e2e.mjs   (Bash timeout ~400s)
//   준비(SCRATCH): 합법 합성 미디어 — test.mp4(비디오+오디오)·dub.mp3(더빙 트랙). `ffmpeg -f lavfi`·`say`.
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const env = Object.fromEntries(
  readFileSync(`${process.env.PROJ || '/Users/family/jason/ChatterBox'}/.env`, 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const SB = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.BASE || 'https://chatterbox-7r8.pages.dev', PW = 'Passw0rd!e2e'
const SCRATCH = process.env.SCRATCH
const admin = createClient(SB, SERVICE, { auth: { persistSession: false } })
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ensureUser(email) {
  await admin.auth.admin.createUser({ email, password: PW, email_confirm: true }).catch(() => {})
  const c = createClient(SB, ANON, { auth: { persistSession: false } })
  const { data } = await c.auth.signInWithPassword({ email, password: PW })
  const { data: prof } = await admin.from('users').select('id').eq('auth_id', data.user.id).maybeSingle()
  return { userId: prof.id, token: data.session.access_token }
}

const s = Date.now()
const A = await ensureUser(`e2e-dub-${s}@e.com`)
const roomId = (await fetch(`${SB}/functions/v1/create-room`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A.token}` },
  body: JSON.stringify({ title: `e2e-dub-${s}` }),
}).then((r) => r.json())).room_id

// ── ① 시드: 소스+녹음 업로드, recording 세션 + synced 트랙 ──
const srcPath = `${roomId}/source/seed-${s}.mp4`, recPath = `${roomId}/recordings/seed-${s}.mp3`
await admin.storage.from('dub-assets').upload(srcPath, readFileSync(`${SCRATCH}/test.mp4`), { contentType: 'video/mp4', upsert: true })
await admin.storage.from('dub-assets').upload(recPath, readFileSync(`${SCRATCH}/dub.mp3`), { contentType: 'audio/mpeg', upsert: true })
const { data: sess } = await admin.from('dub_sessions').insert({
  room_id: roomId, created_by: A.userId, source_video_url: srcPath, source_type: 'mp4', status: 'recording',
}).select('id').single()
await admin.from('dub_tracks').insert({
  dub_session_id: sess.id, participant_id: A.userId, speaker_name: 'Segment 1',
  start_time_ms: 0, end_time_ms: 3000, transcript_text: 'seed line', recording_url: recPath, status: 'synced',
})
console.log('방:', roomId, '세션:', sess.id, '(recording·1 synced) BASE:', BASE)

const errs = []
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
try {
  const ctx = await browser.newContext()
  await ctx.grantPermissions(['camera', 'microphone'], { origin: BASE })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error' && !/XNNPACK|TensorFlow|favicon|MediaPipe/i.test(m.text())) errs.push(m.text().slice(0, 160)) })
  page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 160)))
  await page.goto(`${BASE}/rooms/${roomId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]', { timeout: 20000 })
  await page.fill('input[type=email]', `e2e-dub-${s}@e.com`); await page.fill('input[type=password]', PW)
  await page.click('button[type=submit]')
  await page.waitForFunction(() => document.body.innerText.includes('연결됨'), { timeout: 50000 })

  // ② 대상 액션: [합성 시작] (시드가 recording·allSynced·host 게이트를 채워 활성화)
  const btn = await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('합성 시작')), null, { timeout: 45000 }).then(() => true).catch(() => false)
  ok(btn, '[합성 시작] 버튼 노출')
  if (!btn) throw new Error('합성 버튼 미노출')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('합성 시작'))?.click())
  console.log('  [합성] 클릭 — 분리→ffmpeg.wasm 합성 진행…')

  // ③ 비동기 완료 폴링(브라우저 백그라운드 진행). 페이즈 텍스트도 흘려봄.
  let status = 'recording', lastPhase = ''
  for (let i = 0; i < 60; i++) { // 최대 300s
    await sleep(5000)
    const { data: cur } = await admin.from('dub_sessions').select('status, error_message').eq('id', sess.id).maybeSingle()
    status = cur?.status
    const phase = await page.evaluate(() => [...document.querySelectorAll('p')].find((p) => /분리|합성 중|업로드/.test(p.textContent))?.textContent?.trim() || '').catch(() => '')
    if (phase && phase !== lastPhase) { console.log('  ·', phase); lastPhase = phase }
    if (status === 'completed' || status === 'failed') { console.log('  → status=' + status + (cur?.error_message ? ' (' + cur.error_message + ')' : '')); break }
  }
  ok(status === 'completed', `합성 완료 (status=${status})`)

  // ④ 산출물 ffprobe 검증
  if (status === 'completed') {
    const { data: out } = await admin.from('dub_outputs').select('output_object_key, file_size_bytes')
      .eq('dub_session_id', sess.id).eq('status', 'ready').order('created_at', { ascending: false }).limit(1).maybeSingle()
    ok(!!out?.output_object_key, `dub_outputs ready (${out?.file_size_bytes ?? '?'}B)`)
    if (out?.output_object_key) {
      const { data: blob } = await admin.storage.from('dub-assets').download(out.output_object_key)
      writeFileSync(`${SCRATCH}/composed-out.mp4`, Buffer.from(await blob.arrayBuffer()))
      const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-show_entries', 'format=duration', '-of', 'default=nw=1', `${SCRATCH}/composed-out.mp4`]).toString()
      const dur = parseFloat(probe.match(/duration=([\d.]+)/)?.[1] || '0')
      console.log('  ffprobe:', probe.replace(/\n/g, ' '))
      ok(/codec_type=video/.test(probe) && /codec_type=audio/.test(probe) && dur > 0, `산출 mp4 유효(video+audio·${dur.toFixed(1)}s)`)
    }
  }
  ok(errs.length === 0, `콘솔에러 없음 (${errs.length})`)
} catch (e) {
  fail++; console.log('  FAIL 흐름:', e.message.split('\n')[0])
} finally {
  await browser.close()
  await admin.from('rooms').delete().eq('id', roomId) // cascade 세션·트랙
  await admin.storage.from('dub-assets').remove([srcPath, recPath])
}
console.log(`\n== seed-drive 합성 E2E: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
