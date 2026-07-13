#!/usr/bin/env node
// 입 상태×각도 매트릭스 실렌더 — "발화 중 입술 소실"(ISS-04) 계열의 육안 판정 도구.
// qa-mouth-lips.mjs 가 정적 안료 게이트라면, 이 스크립트는 실제 렌더 ground truth(성역).
//
// 사전(avatar-deploy 스킬 render-verify 와 동일):
//   1) 번들을 public/<name>/{project.json,parts/} 로 same-origin 스테이징
//   2) vite dev 기동: npm run dev -- --port 5199 --strictPort
//   3) playwright-core 설치(npm i --no-save playwright-core)
// 사용법: node scripts/render-mouth-matrix.mjs <stagingName...>   # 예: poon995-test poon995-testB
//   OUT=<dir>  산출 디렉토리(기본 ./mouth-matrix-out) — 변형별 1행, 상태 7열 몽타주 1장 생성(ffmpeg)
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const APP = 'http://localhost:5199'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const variants = process.argv.slice(2)
if (!variants.length) { console.error('사용법: node scripts/render-mouth-matrix.mjs <public/ 스테이징 이름...>'); process.exit(1) }
const OUT = process.env.OUT || './mouth-matrix-out'
mkdirSync(OUT, { recursive: true })

// 상태 세트: 소실 재현 밴드(0.3~0.6)를 촘촘히 + 라이브 복합각(2026-07-11 커미션 실측 각)
const STATES = [
  ['closed', { ParamMouthOpenY: 0, ParamMouthForm: 0, ParamAngleX: 0, ParamAngleY: 0 }],
  ['o030', { ParamMouthOpenY: 0.3, ParamMouthForm: 0, ParamAngleX: 0, ParamAngleY: 0 }],
  ['o040', { ParamMouthOpenY: 0.4, ParamMouthForm: 0, ParamAngleX: 0, ParamAngleY: 0 }],
  ['o050', { ParamMouthOpenY: 0.5, ParamMouthForm: 0, ParamAngleX: 0, ParamAngleY: 0 }],
  ['o060', { ParamMouthOpenY: 0.6, ParamMouthForm: 0, ParamAngleX: 0, ParamAngleY: 0 }],
  ['o100', { ParamMouthOpenY: 1, ParamMouthForm: 0, ParamAngleX: 0, ParamAngleY: 0 }],
  ['live', { ParamMouthOpenY: 0.3, ParamMouthForm: 0, ParamAngleX: 20, ParamAngleY: -15 }],
]

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1100, height: 640 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)))

for (const v of variants) {
  await page.goto(`${APP}/avatar-inspect?project=${encodeURIComponent(`/${v}/project.json`)}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!(window.__rigAvatar), null, { timeout: 40000 })
  const canvas = page.locator('[aria-label="네이티브 아바타 캔버스"]').first()
  for (const [name, params] of STATES) {
    const r = await page.evaluate((p) => {
      try { window.__rigAvatar.setParams(p); return 'ok' } catch (e) { return String(e).slice(0, 120) }
    }, params)
    if (r !== 'ok') { console.log('FAIL setParams', v, name, r); continue }
    await page.waitForTimeout(300)
    await canvas.screenshot({ path: `${OUT}/${v}-${name}.png` })
  }
  console.log(`variant 촬영 완료: ${v}`)
}
await browser.close()
console.log(`콘솔 에러: ${errors.length}건`)
errors.slice(0, 5).forEach((e) => console.log('  [err]', e))

// 몽타주: 얼굴 크롭 후 행=변형, 열=상태 — 반드시 열어 육안 확인(성역)
try {
  const rows = []
  for (const v of variants) {
    const crops = STATES.map(([n]) => {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${OUT}/${v}-${n}.png`, '-vf', 'crop=iw*0.22:ih*0.28:iw*0.40:ih*0.06,scale=300:-1', `${OUT}/c-${v}-${n}.png`])
      return `${OUT}/c-${v}-${n}.png`
    })
    const inputs = crops.flatMap((c) => ['-i', c])
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', crops.map((_, i) => `[${i}]`).join('') + `hstack=${crops.length}`, `${OUT}/row-${v}.png`])
    rows.push(`${OUT}/row-${v}.png`)
  }
  const inputs = rows.flatMap((r) => ['-i', r])
  const filter = rows.length > 1 ? rows.map((_, i) => `[${i}]`).join('') + `vstack=${rows.length}` : 'copy'
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, `${OUT}/montage.png`])
  console.log(`몽타주: ${OUT}/montage.png — ⚠️ 반드시 열어 입술 가시성 육안 확인`)
} catch (e) {
  console.log(`몽타주 생략(ffmpeg 필요): ${String(e).slice(0, 120)} — ${OUT}/*.png 개별 확인`)
}
