// 이모트 Lottie 인룸 E2E — 로컬 dev 프론트(변경분) + 프로덕션 백엔드. 단일탭.
// 검증: 이모트 콘솔 8슬롯 Lottie 실렌더 · 리액션 발사→좌석 플로트 Lottie · lottie 청크 지연로드 · 콘솔에러 스윕.
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('/Users/family/jason/ChatterBox/.env', 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const SB = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.BASE || 'http://localhost:5199'
const PW = 'Passw0rd!e2e'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)) }
const admin = createClient(SB, SERVICE, { auth: { persistSession: false } })
const benign = /XNNPACK|TensorFlow|tfjs|favicon|MediaPipe|Deprecation|Download the React|WebGL|swiftshader/i
const errs = []

const s = Date.now()
const email = `e2e-lottie-${s}@e.com`
const { data: created } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
const c = createClient(SB, ANON, { auth: { persistSession: false } })
const { data: auth } = await c.auth.signInWithPassword({ email, password: PW })
const r = await fetch(`${SB}/functions/v1/create-room`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.session.access_token}` },
  body: JSON.stringify({ title: `e2e-lottie-${s}` }),
})
const roomId = (await r.json()).room_id
console.log('방:', roomId, 'BASE:', BASE)

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.grantPermissions(['camera', 'microphone'], { origin: BASE })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error' && !benign.test(m.text())) errs.push(m.text().slice(0, 160)) })
  page.on('pageerror', (e) => { if (!benign.test(String(e))) errs.push('PAGEERROR: ' + String(e).slice(0, 160)) })

  await page.goto(`${BASE}/rooms/${roomId}`, { waitUntil: 'domcontentloaded' })
  // [함정 18] 소셜우선 로그인 — 이메일 폼은 [이메일로 로그인] 클릭 후 노출
  await page.waitForSelector('text=이메일로 로그인', { timeout: 20000 }).then((b) => b.click()).catch(() => {})
  await page.waitForSelector('input[type=email]', { timeout: 20000 })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', PW)
  await page.click('button[type=submit]')
  // '연결됨' 문구는 stale(현행 UI 는 품질 배지) — 인룸 신호는 이모트 콘솔 버튼 실렌더로 판정
  await page.waitForSelector('button[aria-label="좋아요"]', { timeout: 90000 })
  ok(true, '로그인·방 입장·이모트 콘솔 노출')

  const LABELS = ['좋아요', '웃음', '박수', '열정', '하트', '슬픔', '놀람', '핑']
  // 이모트 콘솔 8슬롯 전부 Lottie(svg) 마운트 대기
  const gotAll = await page.waitForFunction((labels) => {
    return labels.every((l) => document.querySelector(`button[aria-label="${l}"] svg`))
  }, LABELS, { timeout: 20000 }).then(() => true).catch(() => false)
  const svgCount = await page.evaluate((labels) => labels.filter((l) => document.querySelector(`button[aria-label="${l}"] svg`)).length, LABELS)
  ok(gotAll, `이모트 콘솔 Lottie 실렌더 ${svgCount}/8`)

  // lottie 렌더러 청크가 실제 지연 로드됐는가
  const chunkLoaded = await page.evaluate(() =>
    performance.getEntriesByType('resource').some((r) => /lottie/i.test(r.name)) ||
    Array.from(document.scripts).some((s) => /lottie/i.test(s.src)))
  ok(chunkLoaded, 'lottie_light 청크 지연 로드')

  // 리액션 발사 → 좌석 플로트에 Lottie. 버튼은 LiveKit 연결 전 disabled → 활성화 대기 후 발사.
  const enabled = await page.waitForFunction(() => {
    const b = document.querySelector('button[aria-label="좋아요"]')
    return b && !b.disabled
  }, null, { timeout: 60000 }).then(() => true).catch(() => false)
  ok(enabled, '이모트 버튼 활성화(LiveKit 연결)')
  await page.evaluate(() => document.querySelector('button[aria-label="좋아요"]')?.click())
  const float = await page.waitForFunction(() => {
    const el = Array.from(document.querySelectorAll('span')).find((sp) => (sp.getAttribute('style') || '').includes('reaction-rise'))
    if (!el) return null
    return { hasSvg: !!el.querySelector('svg') }
  }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null)
  ok(!!float, '리액션 발사 → 좌석 플로트 표시')
  ok(float?.hasSvg === true, '플로트 글리프 = Lottie(svg)')

  await page.screenshot({ path: '/private/tmp/claude-501/-Users-family-jason-ChatterBox/9b5a44dd-26d8-4973-bd4a-7ace01499560/scratchpad/e2e-room-lottie.png' })
  ok(errs.length === 0, `콘솔에러 없음 (${errs.length})`)
  if (errs.length) console.log('  errs:', errs.slice(0, 5))
} catch (e) {
  fail++; console.log('  FAIL 흐름:', e.message.split('\n')[0])
  try {
    const page = browser.contexts()[0]?.pages()[0]
    if (page) {
      await page.screenshot({ path: '/private/tmp/claude-501/-Users-family-jason-ChatterBox/9b5a44dd-26d8-4973-bd4a-7ace01499560/scratchpad/e2e-fail.png' })
      console.log('  body:', (await page.evaluate(() => document.body.innerText.slice(0, 300))).replace(/\n+/g, ' | '))
    }
  } catch { /* 진단 실패 무시 */ }
} finally {
  await browser.close()
  try {
    await admin.from('rooms').delete().eq('id', roomId)
    if (created?.user?.id) await admin.auth.admin.deleteUser(created.user.id)
  } catch (e) { console.log('cleanup warn:', e.message) }
}
console.log(`\n== 이모트 Lottie 인룸 E2E: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
