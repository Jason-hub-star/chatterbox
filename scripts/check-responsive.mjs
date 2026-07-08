// 반응형 DoD 게이트: 라우트×뷰포트(360/768/1440)에서 가로 오버플로(scrollWidth > viewport)를 fail 로 판정.
// 다국어 게이트(lint 한글금지 + i18nCoverage 완역 테스트)와 한 쌍 — "화면 완성 = 3뷰포트 통과"를 강제한다.
//
// 사용:
//   npm i --no-save playwright-core   (검증 후 npm uninstall --no-save playwright-core — 앱 의존 아님)
//   npm run dev  (5173)
//   node scripts/check-responsive.mjs                      # 공개 라우트 기본셋
//   ROUTES=/login,/lobby BASE=http://localhost:5173 node scripts/check-responsive.mjs
// 인증 라우트(로비·룸)는 로그인 세션이 필요 — 기능 검증 스크립트(supabase-slice-verify 템플릿)에서
// join 후 같은 판정식(document.documentElement.scrollWidth <= viewport)을 재사용한다.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const BASE = process.env.BASE || 'http://localhost:5173'
const ROUTES = (process.env.ROUTES || '/login,/register,/reset').split(',')
const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]

let fail = 0
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp })
    const page = await ctx.newPage()
    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
      const sw = await page.evaluate(() => document.documentElement.scrollWidth)
      const ok = sw <= vp.width
      if (!ok) fail++
      console.log(`  ${ok ? 'PASS' : 'FAIL'} ${route} @${vp.width}px (scrollWidth ${sw})`)
    }
    await ctx.close()
  }
} finally {
  await browser.close()
}
console.log(`\n== 반응형 게이트: ${fail === 0 ? 'PASS' : `FAIL ${fail}건`} ==`)
process.exit(fail ? 1 : 0)
