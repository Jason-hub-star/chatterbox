// 커미션 아바타 구조 발행 — Modal 발행(_publish_avatar) 실패 시 완성 리그를 재결제 없이 수동 발행.
// 계약은 워커와 동일: Storage avatars/<jobId>/{project.json,parts/*.webp} 업로드 + avatar_jobs PATCH(done).
//
// 선행 절차(Vtube 레포, 스킬 chatterbox-avatar-forge 참조):
//   1) 리그 회수: ~/.venvs/modal/bin/modal volume get rig-jobs-vol jobs/av-<jobId>/rig <작업dir>
//      (⚠️ 목적지에 같은 이름 폴더가 있으면 Errno 21 — 빈 부모 디렉토리로 받을 것)
//   2) 굽기: python3 scripts/bake_storage_avatar.py --project <작업dir>/rig --out <pubDir>
//   3) 발행: node scripts/publish-avatar-job.mjs <jobId> <pubDir>
//
// 사용법: node scripts/publish-avatar-job.mjs <jobId> <pubDir>
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleQaBypass } from './lib/qa-bypass-log.mjs'
import { dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')

const [jobId, pubArg] = process.argv.slice(2)
if (!jobId || !pubArg) {
  console.error('사용법: node scripts/publish-avatar-job.mjs <jobId> <pubDir>')
  process.exit(1)
}
const PUB = resolve(pubArg)

const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL = env.VITE_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(URL, KEY, { auth: { persistSession: false } })

// 발행 규약 검증(avatar-forge-pipeline.md 핵심 계약) — 깨진 채 올리면 로더가 조용히 실패한다.
const project = JSON.parse(readFileSync(join(PUB, 'project.json'), 'utf8'))
if (project._project_base_url !== '') throw new Error(`_project_base_url != "": ${project._project_base_url}`)
if (!project._mini_rig || !Object.keys(project._mini_rig).length) throw new Error('_mini_rig 미인라인')
const badPart = (project.parts ?? []).find((p) => !String(p.source_path).startsWith('parts/'))
if (badPart) throw new Error(`source_path 규약 위반: ${badPart.source_path}`)
console.log(`검증 OK — parts ${project.parts.length}`)

// 입 상태 QA 게이트(ISS-04 클래스) — 발화 중 입술 소실 자산을 발행 전 차단. 비상 우회: QA_MOUTH_SKIP=1
try {
  const { execFileSync } = await import('node:child_process')
  execFileSync('node', [join(root, 'scripts/qa-mouth-lips.mjs'), PUB], { stdio: 'inherit' })
} catch {
  handleQaBypass({ id: jobId, stage: 'publish' })
}

const up = async (local, path, contentType) => {
  const { error } = await admin.storage.from('avatars').upload(path, readFileSync(local), { contentType, upsert: true })
  if (error) throw new Error(`${path}: ${error.message}`)
}
await up(join(PUB, 'project.json'), `${jobId}/project.json`, 'application/json')
const webps = readdirSync(join(PUB, 'parts')).filter((f) => f.endsWith('.webp')).sort()
for (const f of webps) await up(join(PUB, 'parts', f), `${jobId}/parts/${f}`, 'image/webp')
console.log(`업로드 ${1 + webps.length}건 완료`)

const publicUrl = `${URL}/storage/v1/object/public/avatars/${jobId}/project.json`
// 내용 검증 — 200만 보면 안 된다: 같은 generated_at으로 재발행하면 CDN이 구본을 계속 서빙하는데
// 캐시버스트 쿼리 검증은 원본만 봐서 오판한다(2026-07-11 실측: 키폼 패치가 유저에게 미도달).
// ① 원본(캐시버스트)이 로컬과 일치하는지 ② 맨 URL(유저가 로드하는 그 URL)에 전파됐는지 둘 다 확인.
const localGen = project.generated_at
const origin = await (await fetch(`${publicUrl}?v=${Date.now()}`, { cache: 'no-store' })).json()
if (origin.generated_at !== localGen)
  throw new Error(`원본 불일치: 업로드본 generated_at=${origin.generated_at} ≠ 로컬 ${localGen} — generated_at을 범프하고 재발행할 것`)
let propagated = false
for (let i = 0; i < 12; i++) {
  const bare = await (await fetch(publicUrl, { cache: 'no-store' })).json()
  if (bare.generated_at === localGen) { propagated = true; break }
  await new Promise((r) => setTimeout(r, 5000))
}
console.log(propagated ? '맨 URL 전파 확인' : '⚠️ 맨 URL이 아직 구본 — CDN TTL 대기 필요(유저는 당분간 구본을 봄)')

// 잡 완결 — REST PATCH 직접 호출(supabase-js .update()가 무소음 행업한 전례, 2026-07-11).
const patch = await fetch(`${URL}/rest/v1/avatar_jobs?id=eq.${jobId}`, {
  method: 'PATCH',
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({
    status: 'done',
    error: null,
    result_project_url: publicUrl,
    completed_at: new Date().toISOString(),
  }),
})
const rows = await patch.json()
if (!patch.ok || !rows.length) throw new Error(`avatar_jobs PATCH 실패: ${patch.status} ${JSON.stringify(rows).slice(0, 200)}`)
console.log(`잡 done 처리 완료 — ${publicUrl}`)

// 썸네일 굽기(정적 thumb.png 규약 — 옷장 타일이 <img>로 직접 씀). rig 렌더가 필요(dev 서버 + playwright-core)
// 라 best-effort: 실패해도 발행은 유효(아바타는 이미 라이브, 타일은 onError 이름 폴백). dev 서버 없으면
// 안내만 남긴다 — 나중에 `node scripts/generate-avatar-thumbs.mjs <jobId>` 로 1회 수동 생성 가능.
try {
  const { execFileSync } = await import('node:child_process')
  // timeout: 헤드리스 WebGL 렌더가 드물게 스톨해도(컨텍스트 누적) 발행 스크립트가 무한 대기하지 않게 120s 캡.
  execFileSync('node', [join(root, 'scripts/generate-avatar-thumbs.mjs'), jobId], { stdio: 'inherit', timeout: 120_000 })
  console.log(`썸네일 생성 완료 — avatars/${jobId}/thumb.png`)
} catch {
  console.warn(`⚠️ 썸네일 자동생성 스킵(dev 서버 필요/타임아웃) — 수동: node scripts/generate-avatar-thumbs.mjs ${jobId}`)
}
