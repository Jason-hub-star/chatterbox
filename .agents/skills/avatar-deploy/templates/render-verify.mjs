// 아바타 네이티브 렌더 검증 — 배포한 rig 가 실제로 그려지는지 헤드리스 실렌더(성역).
// 사전:
//   1) 병합 번들 same-origin 스테이징:
//      node -e '<character.json + mini_rig.json → public/<id>-test/{project.json,parts/}>'
//      (배포 스크립트가 만든 것과 동일 병합. 헤드리스는 외부 DNS 없어 프로덕션 URL 직접 로드 불가.)
//   2) vite dev 기동(VITE_SUPABASE_URL/ANON_KEY), playwright-core --no-save 설치.
// 실행: export AVATAR_ID=<id> SCRATCH=<dir>; node render-verify.mjs   (검증 후 vite/playwright/staging 정리)
import { chromium } from 'playwright-core'
const APP = 'http://localhost:5199'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ID = process.env.AVATAR_ID, SCRATCH = process.env.SCRATCH
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)) }

// same-origin 실파일 확인(vite SPA fallback HTML 아닌지)
const probe = await fetch(`${APP}/${ID}-test/project.json`)
ok(probe.status === 200 && /json/.test(probe.headers.get('content-type') || ''),
  `staging 실 JSON (${probe.status} ${probe.headers.get('content-type')})`)

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1100, height: 640 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)))
try {
  await page.goto(`${APP}/avatar-inspect?project=${encodeURIComponent(`/${ID}-test/project.json`)}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!(window.__rigAvatar), null, { timeout: 40000 })
  ok(true, '네이티브 로더 성공(__rigAvatar = project.json + parts 로드)')
  const st = await page.locator('figcaption', { hasText: '네이티브 이식' }).first().textContent()
  ok(/렌더 중/.test(st || ''), 'status ready')
  const drove = await page.evaluate(() => {
    try { window.__rigAvatar.setParams({ ParamMouthOpenY: 1, ParamAngleZ: 15, ParamEyeROpen: 0.2 }); return 'ok' }
    catch (e) { return String(e).slice(0, 120) }
  })
  ok(drove === 'ok', 'setParams 구동 무예외')
  await page.waitForTimeout(400)
  await page.locator('[aria-label="네이티브 아바타 캔버스"]').first().screenshot({ path: `${SCRATCH}/${ID}-native.png` })
  ok(true, `스크린샷 ${ID}-native.png — ⚠️ 반드시 열어 캐릭터 온전 렌더 육안 확인`)
} catch (e) {
  fail++; console.log('  FAIL 렌더:', e.message.split('\n')[0])
  await page.screenshot({ path: `${SCRATCH}/${ID}-fail.png` }).catch(() => {})
} finally {
  ok(errors.length === 0, `콘솔 에러 없음 (${errors.length}건)`)
  errors.slice(0, 5).forEach((e) => console.log('    [err]', e))
  await browser.close()
}
console.log(`\n== ${ID} 렌더 검증: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
