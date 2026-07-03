// 배포된 CF Pages SPA 가 프로덕션에서 실제 부팅되는지 헤드리스 실렌더 검증(시스템 Chrome, 브라우저 다운로드 없음).
// 실행: BASE=https://chatterbox-7r8.pages.dev node render-check.mjs
// 준비: npm i playwright-core --no-save (scratch 에서; node_modules 심링크로 프로젝트 dep 재사용 가능)
import { chromium } from 'playwright-core'
const TARGET = process.env.BASE || 'https://chatterbox-7r8.pages.dev/'
const errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 200)))
try {
  const resp = await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500) // React 마운트 여유
  const info = await page.evaluate(() => {
    const root = document.getElementById('root')
    return {
      title: document.title,
      rootChildren: root ? root.children.length : -1,
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      url: location.href,
    }
  })
  console.log('HTTP status :', resp?.status())
  console.log('title       :', info.title)
  console.log('#root children:', info.rootChildren, info.rootChildren > 0 ? '(React 마운트 ✅)' : '(빈 ❌)')
  console.log('보이는 텍스트:', info.bodyText || '(없음)')
  console.log('콘솔/페이지 에러:', errors.length ? '\n  - ' + errors.join('\n  - ') : '없음 ✅')
  await page.screenshot({ path: 'deployed.png', fullPage: false })
  console.log('스크린샷: deployed.png')
  process.exit(info.rootChildren > 0 && errors.length === 0 ? 0 : 1)
} finally {
  await browser.close()
}
