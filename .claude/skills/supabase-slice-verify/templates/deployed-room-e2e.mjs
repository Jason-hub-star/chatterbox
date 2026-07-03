// 배포판 2탭 룸 E2E — 프로덕션 프론트(CF Pages)+백엔드를 실 2탭으로 검증(로컬 dev 없이).
// room-2tab-e2e.mjs 의 "배포 URL 타겟 + 단언 채운" 완성 예. BASE 만 바꾸면 로컬/배포 겸용.
// 커버 예: 미인증 로그인게이트 · 2탭 입장·상호 프레즌스 · 아바타 렌더 · 채팅 A→B · 외부 CDN 로드 · 콘솔에러 스윕.
// 실행: BASE=https://chatterbox-7r8.pages.dev node deployed-room-e2e.mjs   (Bash timeout 넉넉히)
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(`${process.env.PROJ || '/Users/family/jason/ChatterBox'}/.env`, 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const SB = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.BASE || 'https://chatterbox-7r8.pages.dev'
const PW = 'Passw0rd!e2e'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)) }
const admin = createClient(SB, SERVICE, { auth: { persistSession: false } })
const benign = /XNNPACK|TensorFlow|tfjs|favicon|MediaPipe|Deprecation|Download the React/i
const errsA = [], errsB = []
let sawLoginGate = false

const s = Date.now()
const emails = [`e2e-a-${s}@e.com`, `e2e-b-${s}@e.com`]
for (const email of emails) await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
const call = async (email, fn, body) => {
  const c = createClient(SB, ANON, { auth: { persistSession: false } })
  const { data } = await c.auth.signInWithPassword({ email, password: PW })
  const r = await fetch(`${SB}/functions/v1/${fn}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(body),
  })
  return r.json()
}
// [함정 11] StrictMode 조인 경쟁 회피: A=create-room slot0, B=서버측 pre-join → 브라우저는 rejoin.
const roomId = (await call(emails[0], 'create-room', { title: `e2e-dep-${s}` })).room_id
await call(emails[1], 'join-public-room', { room_id: roomId })
console.log('방:', roomId, 'BASE:', BASE)

async function loginJoin(context, email, sink) {
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error' && !benign.test(m.text())) sink.push(m.text().slice(0, 160)) })
  page.on('pageerror', (e) => { if (!benign.test(String(e))) sink.push('PAGEERROR: ' + String(e).slice(0, 160)) })
  await page.goto(`${BASE}/rooms/${roomId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]', { timeout: 20000 })
  sawLoginGate = true // 미인증으로 보호 라우트 → 로그인 폼 노출
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PW)
  await page.click('button[type=submit]')
  await page.waitForFunction(() => document.body.innerText.includes('연결됨'), { timeout: 50000 })
  return page
}
const has = (page, sel) => page.evaluate((sel) => !!document.querySelector(sel), sel)
// [함정 12] 무거운 페이지 → DOM 직접(evaluate)으로 controlled input 값 set + input 이벤트 dispatch.
async function sendChat(page, text) {
  await page.evaluate((text) => {
    const inp = document.querySelector('input[aria-label="메시지 입력"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(inp, text); inp.dispatchEvent(new Event('input', { bubbles: true }))
    const form = inp.closest('form')
    if (form?.requestSubmit) form.requestSubmit()
    else inp.parentElement?.querySelector('button')?.click()
  }, text)
}

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
try {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext()
  await ctxA.grantPermissions(['camera', 'microphone'], { origin: BASE })
  await ctxB.grantPermissions(['camera', 'microphone'], { origin: BASE })
  const pageA = await loginJoin(ctxA, emails[0], errsA)
  const pageB = await loginJoin(ctxB, emails[1], errsB)
  ok(sawLoginGate, '미인증 보호라우트 → 로그인 게이트')
  ok(true, '2탭 입장·연결됨')
  await pageA.waitForTimeout(3000) // [함정 13] reliable 채널 warm-up + 아바타 마운트

  ok(await has(pageA, '[data-self-avatar]'), 'A self 아바타 마운트')
  ok(await has(pageA, '[data-remote-avatar]'), 'A가 B를 봄(원격 아바타)')
  ok(await has(pageB, '[data-remote-avatar]'), 'B가 A를 봄(원격 아바타)')

  const msg = `e2e-핑퐁-${s}`
  await sendChat(pageA, msg)
  const got = await pageB.waitForFunction((t) => document.querySelector('[aria-label="채팅 메시지"]')?.textContent?.includes(t), msg, { timeout: 20000 }).then(() => true).catch(() => false)
  ok(got, '채팅 A→B 실시간 동기')

  // 외부 CDN(예: ffmpeg.wasm 코어) 프로덕션 브라우저 로드 — 배포는 CDN 그대로(로컬 인터셉트 불필요).
  const ff = await pageA.evaluate(async () => {
    try { const r = await fetch('https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js'); return r.ok } catch (e) { return 'ERR:' + e.message }
  })
  ok(ff === true, `ffmpeg.wasm 코어 CDN 로드 (${ff})`)

  ok(errsA.length === 0 && errsB.length === 0, `콘솔에러 없음 (A:${errsA.length} B:${errsB.length})`)
  if (errsA.length) console.log('  A errs:', errsA.slice(0, 5))
  if (errsB.length) console.log('  B errs:', errsB.slice(0, 5))
} catch (e) {
  fail++; console.log('  FAIL 흐름:', e.message.split('\n')[0])
} finally {
  await browser.close()
  await admin.from('rooms').delete().eq('id', roomId) // .catch 금지: 쿼리빌더는 네이티브 Promise 아님(await 필요)
}
console.log(`\n== 배포판 2탭 룸 E2E: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
