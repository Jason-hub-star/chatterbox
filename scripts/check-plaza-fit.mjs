// 광장 fit 게이트(GOAL-plaza-fit F5): 전 월드 × 뷰포트 6종에서 가게 7개와 호버 간판이
// 뷰포트 안에 온전히 담기는지 실렌더로 판정한다. 정적 짝은 tests/unit/plazaSafeArea.test.ts
// (좌표 계약) — 이 스크립트는 **좌표가 계약을 지켜도 CSS 프레이밍이 어긋나면** 잡는 쪽이다.
//
// 사용:
//   npm i --no-save playwright-core   (검증 후 npm uninstall --no-save playwright-core — 앱 의존 아님)
//   npm run dev  (5173)
//   npm run check:plaza
//   BASE=http://localhost:5173 WORLDS=eastern node scripts/check-plaza-fit.mjs
//
// 판정 3종: ①가게 7개 각각 가시면적 ≥99.5% ②호버 간판 4변이 뷰포트 안 ③가로 오버플로 0.
// 뷰포트는 프레이밍 분기(index.css `.plaza-fit`)의 세 갈래를 모두 덮는다 —
// 21:9(세로 contain)·16:9~16:10(cover)·4:3(가로 contain).
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const BASE = process.env.BASE || 'http://localhost:5173'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VIEWPORTS = [
  { width: 2560, height: 1080 }, // 21:9 — 세로 contain 분기
  { width: 1920, height: 1080 }, // 16:9 — cover 상한(잘림 8.3%/변)
  { width: 1512, height: 945 }, // MBP14 16:10
  { width: 1440, height: 900 }, // 16:10
  { width: 1366, height: 768 }, // 16:9 노트북
  { width: 1280, height: 720 }, // 16:9 최소창 — 간판 기준선(SIGN_BELOW_T)이 가장 빡빡한 조합
  { width: 1024, height: 768 }, // 4:3 — 가로 contain 분기 + lg 경계
]
const MIN_VISIBLE = 99.5 // %
const SETTLE_MS = 450 // 간판 펼침(0.22s) + 카메라 푸시(0.45s) 정착 대기

// 월드 목록은 매니페스트에서 뽑는다 — 새 월드가 늘면 게이트도 자동으로 커진다(수동 등재 금지).
function readWorldIds() {
  if (process.env.WORLDS) return process.env.WORLDS.split(',').map((s) => s.trim()).filter(Boolean)
  const src = readFileSync(join(ROOT, 'src/scenes/manifest.ts'), 'utf8')
  const start = src.indexOf('export const WORLDS')
  if (start < 0) throw new Error('manifest.ts 에서 WORLDS 를 못 찾았다 — 게이트가 무엇도 검사하지 않는다')
  const body = src.slice(start, src.indexOf('\n}\n', start))
  const ids = [...body.matchAll(/^ {2}([A-Za-z0-9_-]+): \{$/gm)].map((m) => m[1])
  if (ids.length === 0) throw new Error('WORLDS 파싱 0건 — 정규식이 매니페스트 형식과 어긋났다')
  return ids
}

const worlds = readWorldIds()
let fail = 0
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const world of worlds) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: vp })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/?world=${world}`, { waitUntil: 'networkidle' })
      // 입장 웨이브(평생 1회)는 간판을 임의로 펼쳐 측정을 오염시킨다 — 본 적 있는 상태로 고정.
      await page.evaluate(() => localStorage.setItem('cb.hubWaveSeen', '1'))
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(SETTLE_MS)

      const problems = []
      const shops = await page.evaluate(() => {
        const vw = window.innerWidth
        const vh = window.innerHeight
        return [...document.querySelectorAll('.hub-shop')].map((el) => {
          const r = el.getBoundingClientRect()
          const visW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0))
          const visH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
          const area = r.width * r.height
          return {
            dest: el.getAttribute('data-dest'),
            visible: area ? +(((visW * visH) / area) * 100).toFixed(1) : 0,
          }
        })
      })
      if (shops.length !== 7) problems.push(`가게 ${shops.length}개(기대 7) — 브레이크포인트/렌더 확인`)
      for (const s of shops) if (s.visible < MIN_VISIBLE) problems.push(`${s.dest} 가시 ${s.visible}%`)

      for (const s of shops) {
        await page.hover(`.hub-shop[data-dest="${s.dest}"]`, { force: true }).catch(() => {})
        await page.waitForTimeout(SETTLE_MS)
        const sign = await page.evaluate((dest) => {
          const el = document.querySelector(`.hub-shop[data-dest="${dest}"] .hub-sign`)
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { l: r.left, t: r.top, r: r.right, b: r.bottom, vw: window.innerWidth, vh: window.innerHeight }
        }, s.dest)
        if (!sign) {
          problems.push(`${s.dest} 간판 없음`)
          continue
        }
        const out = []
        if (sign.t < 0) out.push(`상 ${Math.round(-sign.t)}px`)
        if (sign.b > sign.vh) out.push(`하 ${Math.round(sign.b - sign.vh)}px`)
        if (sign.l < 0) out.push(`좌 ${Math.round(-sign.l)}px`)
        if (sign.r > sign.vw) out.push(`우 ${Math.round(sign.r - sign.vw)}px`)
        if (out.length) problems.push(`${s.dest} 간판 잘림(${out.join(' ')})`)
      }

      const sw = await page.evaluate(() => document.documentElement.scrollWidth)
      if (sw > vp.width) problems.push(`가로 오버플로 scrollWidth ${sw}`)

      const ok = problems.length === 0
      if (!ok) fail += problems.length
      console.log(`  ${ok ? 'PASS' : 'FAIL'} ${world} @${vp.width}×${vp.height}${ok ? '' : ` — ${problems.join(' · ')}`}`)
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}
console.log(`\n== 광장 fit 게이트(월드 ${worlds.length} × 뷰포트 ${VIEWPORTS.length}): ${fail === 0 ? 'PASS' : `FAIL ${fail}건`} ==`)
process.exit(fail ? 1 : 0)
