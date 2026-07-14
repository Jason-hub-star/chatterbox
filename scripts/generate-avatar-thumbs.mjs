// 아바타 정적 썸네일 생성·업로드 — 규약: Storage `avatars/<id>/thumb.png` (project.json 옆).
// 옷장 타일은 이 파일을 <img>로 직접 쓴다(런타임 rig 렌더 없음 — 아바타 수와 무관하게 즉시 페인트).
// 새 프리셋 배포(deploy-avatar.mjs) 후 이 스크립트를 1회 실행해 썸네일을 채운다.
// 커미션 아바타도 같은 규약(`avatars/<jobId>/project.json`)이라 jobId 를 인자로 주면 그대로 굽는다 —
// publish-avatar-job.mjs 가 발행 직후 이 스크립트를 jobId 로 자동 호출(best-effort). Modal 워커 자동화는 후속.
//
// 요구사항: dev 서버(localhost:5173) 실행 중 + playwright-core(임시 설치, check:responsive 와 동일 캐빗).
// 사용법: node scripts/generate-avatar-thumbs.mjs [id|jobId ...]   (생략 시 매니페스트 프리셋 전체)

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const { chromium } = require('playwright-core')

const THUMB_PX = 512 // 옷장 타일 ~140px(@2x=280) 대비 여유 — 레이아웃이 타일을 키워도 재생성 불필요

const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const SUPA_URL = env.VITE_SUPABASE_URL
const admin = createClient(SUPA_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const publicBase = `${SUPA_URL}/storage/v1/object/public/avatars`

// 대상 목록: 인자 id 우선, 없으면 매니페스트 전체.
let ids = process.argv.slice(2)
if (!ids.length) {
  const res = await fetch(`${publicBase}/manifest.json`, { cache: 'no-store' })
  if (!res.ok) { console.error('manifest.json 로드 실패:', res.status); process.exit(1) }
  ids = ((await res.json()).avatars ?? []).map((a) => a.id).filter(Boolean)
}
console.log('대상:', ids.join(', '))

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
const page = await (await browser.newContext()).newPage()
// vite dev 가 앱 모듈을 서빙 — 아무 라우트나 열고 rig 모듈을 동적 import 해 렌더한다(로그인 불필요).
await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' })

let fail = 0
for (const id of ids) {
  const projectUrl = `${publicBase}/${id}/project.json`
  try {
    const dataUrl = await page.evaluate(
      async ({ url, px }) => {
        const { RigAvatar } = await import('/src/lib/pixi/rig/index.ts')
        const holder = document.createElement('div') // DOM 미부착 — 화면 밖 1회 렌더
        // preserveDrawingBuffer + drawImage = 거울(티커 drawPixi)과 **동일 픽셀** 캡처.
        // extract() 경로는 클리핑/커버 스프라이트를 달리 그려 머리에 색 자국이 남았다(2026-07-10 주인님 실측 2회).
        const avatar = await RigAvatar.create(holder, { projectUrl: url, size: px, preserveDrawingBuffer: true })
        try {
          // 중립 정면 강제 + 물리/조립 안정 대기(avatarReference 패턴) — 생략하면 rig 기본값·
          // 미정착 상태가 찍혀 표정이 뒤섞인 썸네일이 나온다(2026-07-10 주인님 실측).
          avatar.setParams({
            ParamEyeLOpen: 1, ParamEyeROpen: 1, ParamEyeBallX: 0, ParamEyeBallY: 0,
            ParamMouthOpenY: 0, ParamMouthForm: 0,
            ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0, ParamBreath: 0.5,
          })
          await new Promise((r) => setTimeout(r, 800))
          const out = document.createElement('canvas')
          out.width = px
          out.height = px
          out.getContext('2d').drawImage(avatar.canvas, 0, 0, px, px)
          return out.toDataURL('image/png')
        } finally {
          avatar.destroy()
        }
      },
      { url: projectUrl, px: THUMB_PX },
    )
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64')
    const { error } = await admin.storage
      .from('avatars')
      .upload(`${id}/thumb.png`, buf, { contentType: 'image/png', upsert: true })
    if (error) throw new Error(`업로드 실패: ${error.message}`)
    // 공개 URL 실측 검증
    const head = await fetch(`${publicBase}/${id}/thumb.png?v=${Date.now()}`)
    if (!head.ok) throw new Error(`공개 URL ${head.status}`)
    console.log(`  OK ${id}/thumb.png (${(buf.length / 1024).toFixed(1)}KB)`)
  } catch (e) {
    fail++
    console.log(`  FAIL ${id}: ${e.message.split('\n')[0]}`)
  }
}
await browser.close()

// 캐시버스트: 매니페스트 thumbRev 갱신 — 프론트가 thumb.png?v=<rev> 로 읽어 재생성이 즉시 보인다.
// (같은 URL 재업로드는 브라우저/CDN 이 구본을 계속 서빙 — 2026-07-10 실측)
if (!fail) {
  const res = await fetch(`${publicBase}/manifest.json`, { cache: 'no-store' })
  const manifest = await res.json()
  manifest.thumbRev = Date.now()
  const { error } = await admin.storage
    .from('avatars')
    .upload('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)), {
      contentType: 'application/json',
      upsert: true,
    })
  console.log(error ? `thumbRev 갱신 실패: ${error.message}` : `thumbRev=${manifest.thumbRev} 갱신`)
}
console.log(fail ? `\n${fail}건 실패` : '\n전체 완료')
process.exit(fail ? 1 : 0)
