// 헤드리스 브라우저 E2E 스캐폴드 — 실제 컴포넌트가 실 브라우저에서 동작하는지 ground-truth.
// 준비: npm install --no-save playwright-core; vite dev(로컬 supabase) 기동.
// 실행: set -a; . $SCRATCH/sb.env; set +a;
//   export SUPABASE_URL="$API_URL" APP_URL="http://localhost:5199" \
//     CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" SCRATCH
//   cd $SCRATCH && node <this>.mjs   (Bash timeout 을 넉넉히 — 브라우저 부팅+작업이 2분 초과 가능)
import { createClient } from '@supabase/supabase-js'
// import { readFileSync, writeFileSync } from 'node:fs'
// import { execFileSync } from 'node:child_process'   // ffprobe 등 산출물 실측
import { chromium } from 'playwright-core'

const URL = process.env.SUPABASE_URL, ANON = process.env.ANON_KEY, SERVICE = process.env.SERVICE_ROLE_KEY
const APP = process.env.APP_URL, CHROME = process.env.CHROME_PATH, SCRATCH = process.env.SCRATCH
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)) }
async function mkUser(email) {
  await admin.auth.admin.createUser({ email, password: 'test1234!', email_confirm: true })
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  await c.auth.signInWithPassword({ email, password: 'test1234!' })
  return c
}

const s = Date.now()
const email = `e2e-${s}@e.com`
await mkUser(email)
// ── admin 으로 목표 상태 시드(실 파일 포함) ──
// await admin.storage.from('dub-assets').upload(path, readFileSync(`${SCRATCH}/media.mp4`), { contentType: 'video/mp4' })
// ...

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
// 마이크가 필요하면: '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${SCRATCH}/mic.wav`
const page = await browser.newPage()

// [필수] 로컬 서명 URL 은 kong:8000 호스트로 나옴 → 헤드리스가 DNS 못 풂. 127.0.0.1 로 재작성.
await page.route('**kong:8000/**', (route) =>
  route.continue({ url: route.request().url().replace('http://kong:8000', 'http://127.0.0.1:54321') }))

// [선택] 외부 CDN 자원(예: ffmpeg.wasm 코어)을 쓰면: bash 로 미리 받아 두고 로컬 파일로 fulfill.
//   (배포는 CDN URL 그대로 — 테스트에서만 인터셉트해 실 로직을 검증)
// await page.route('**/unpkg.com/**', (route) => {
//   const u = route.request().url()
//   if (u.endsWith('ffmpeg-core.js')) return route.fulfill({ path: `${SCRATCH}/core/ffmpeg-core.js`, contentType: 'text/javascript' })
//   if (u.endsWith('ffmpeg-core.wasm')) return route.fulfill({ path: `${SCRATCH}/core/ffmpeg-core.wasm`, contentType: 'application/wasm' })
//   return route.continue()
// })

page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser err]', m.text().slice(0, 160)) })
page.on('requestfailed', (r) => console.log('  [REQFAIL]', r.failure()?.errorText, r.url().slice(0, 90)))

try {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', 'test1234!')
  await page.click('button[type=submit]')
  await page.waitForURL('**/lobby', { timeout: 15000 })
  ok(true, '로그인 → 로비')

  // await page.goto(`${APP}/rooms/${roomId}`, { waitUntil: 'domcontentloaded' })
  // const btn = page.getByRole('button', { name: '...' }).first()
  // await btn.waitFor({ state: 'visible', timeout: 20000 }); await btn.click()
  // await page.getByText('...').first().waitFor({ state: 'visible', timeout: 90000 })
  // ok(true, '동작 완료')
} catch (e) {
  fail++; console.log('  FAIL 브라우저 흐름:', e.message.split('\n')[0])
  await page.screenshot({ path: `${SCRATCH}/e2e-fail.png` }).catch(() => {})
} finally {
  await browser.close()
}

// ── DB·스토리지·산출물 실측 (ground truth) ──
// const row = (await admin.from('...').select('...').eq('...', ...).maybeSingle()).data
// ok(!!row, 'DB 상태 실측')
// const dl = await admin.storage.from('bucket').download(key); const bytes = Buffer.from(await dl.data.arrayBuffer())
// writeFileSync(`${SCRATCH}/out`, bytes)
// const probe = JSON.parse(execFileSync('ffprobe', ['-v','quiet','-print_format','json','-show_streams','-show_format', `${SCRATCH}/out`]))
// ok(probe.streams.some(x => x.codec_type === 'video'), 'ffprobe 실측')

console.log(`\n== 브라우저 E2E: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
