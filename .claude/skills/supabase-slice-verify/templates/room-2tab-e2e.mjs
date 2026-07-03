// 2탭 LiveKit 룸 E2E 스캐폴드 — 실시간 룸 기능(DataChannel: chat·blendshape·script-cue, 참가자별 아바타,
// 호스트 제어, 리액션 등)이 2명 사이에서 실제로 동작·동기되는지 실 브라우저 2탭 + 실 LiveKit 으로 검증.
// 성공 사례: blendshape 멀티플레이어(B3), 대본 텔레프롬프터(cue 동기 12/12).
//
// 준비: npm install --no-save playwright-core; vite dev 기동(프로덕션 VITE_SUPABASE_URL/ANON/LIVEKIT_URL).
//   (LiveKit 클라우드 연결이 필요하므로 로컬 supabase 가 아니라 배포된 백엔드 대상이 편하다.)
// 실행: BASE=http://localhost:5173 node room-2tab-e2e.mjs   (Bash timeout 넉넉히 — 2탭 부팅+연결이 오래 걸림)
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// .env 파싱(값 미출력) — VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY·SUPABASE_SERVICE_ROLE_KEY 필요.
const env = Object.fromEntries(
  readFileSync(`${process.env.PROJ || '/Users/family/jason/ChatterBox'}/.env`, 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const URL = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.BASE || 'http://localhost:5173'
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PW = 'Passw0rd!e2e'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)) }
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

// ── 셋업: 2계정 생성 + 방 생성(A=host slot0) + B 서버측 pre-join ──
// [함정] StrictMode(dev)가 조인 effect를 2번 발화 → fresh 조인이 slot 인서트 경쟁 → 한쪽 409로 입장 실패.
//   A는 create-room으로 이미 slot0 보유(rejoin이라 무경쟁). B도 **서버측에서 미리 join**시켜 브라우저는 rejoin만.
const s = Date.now()
const emails = [`e2e-a-${s}@e.com`, `e2e-b-${s}@e.com`]
for (const email of emails) await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
const call = async (email, fn, body) => {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data } = await c.auth.signInWithPassword({ email, password: PW })
  const r = await fetch(`${URL}/functions/v1/${fn}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(body),
  })
  return r.json()
}
const roomId = (await call(emails[0], 'create-room', { title: `e2e-${s}` })).room_id
await call(emails[1], 'join-public-room', { room_id: roomId }) // B 서버측 pre-join
console.log('방:', roomId, '(A slot0·B pre-join)')

// ── 헬퍼: 로그인→입장→'연결됨' 대기 ──
async function loginJoin(context, email) {
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error' && !/XNNPACK|TensorFlow|favicon/.test(m.text())) console.log(`  [${email.slice(0, 6)} err] ${m.text().slice(0, 140)}`) })
  await page.goto(`${BASE}/rooms/${roomId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]', { timeout: 15000 })
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PW)
  await page.click('button[type=submit]')
  await page.waitForFunction(() => document.body.innerText.includes('연결됨'), { timeout: 40000 })
  return page
}
// [함정] 2탭 MediaPipe+아바타로 페이지가 무거워 playwright 액션어빌리티 체크가 타임아웃 → DOM 직접(evaluate) 조작/판독.
const readText = (page, sel) => page.evaluate((sel) => document.querySelector(sel)?.textContent || '', sel)
const clickByText = (page, text) => page.evaluate((text) => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(text)); b?.click(); return !!b
}, text)

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
try {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext()
  await ctxA.grantPermissions(['camera', 'microphone'], { origin: BASE })
  await ctxB.grantPermissions(['camera', 'microphone'], { origin: BASE })
  const pageA = await loginJoin(ctxA, emails[0]); console.log('A 연결')
  const pageB = await loginJoin(ctxB, emails[1]); console.log('B 연결')

  // [함정] reliable DataChannel 은 첫 publishData 로 개설되며 그 메시지가 유실될 수 있음(모든 세션 첫 액션 유실).
  //   앱이 연결/입장 시 현재 상태를 재브로드캐스트하거나, 테스트에서 첫 액션 전 2~3s warm-up 대기 + 넉넉한 timeout.
  await pageA.waitForTimeout(2500)

  // ── 여기부터 슬라이스별 단언 (예시: 호스트 A 액션 → 상대 B 동기) ──
  // await clickByText(pageA, '다음 대사')
  // ok(await pageB.waitForFunction((t) => document.querySelector('[data-testid=...]')?.textContent?.includes(t), '기대문구', { timeout: 25000 }).then(() => true).catch(() => false), 'A 액션 → B 실시간 동기')
  // ok((await readText(pageB, '[data-testid=...]')).includes('...'), 'B 상태 확인')
  // 참고: blendshape는 window.__room.sendBlendshapes 주입, 원격 반영은 window.__remoteAvatars 로 확인(B3 방식).

  console.log('  (단언부를 슬라이스에 맞게 채우세요 — DataChannel 동기·참가자별 렌더·호스트 권한 등)')
} catch (e) {
  fail++; console.log('  FAIL 흐름:', e.message.split('\n')[0])
} finally {
  await browser.close()
}
console.log(`\n== 2탭 룸 E2E: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
