#!/usr/bin/env node
// 아바타 원터치 배포 — Vtube rig 를 ChatterBox 에 "슬롯에 꼽기".
//
// 사용법:
//   node scripts/deploy-avatar.mjs <rigDir> <id> <name>
//   예) node scripts/deploy-avatar.mjs ~/jason/Vtube/experiments/autorig-character-010/rig_v0_project ruby 루비
//
// 하는 일:
//   1) rigDir 의 character.json + mini_rig.json → project.json (_mini_rig 인라인, 렌더 필수)
//   2) 모든 parts(source_path) 존재 검증
//   3) Storage avatars/<id>/ 에 project.json + parts 업로드(upsert)
//   4) avatars/manifest.json 에 {id, name} 추가/갱신 → 코드 수정·프론트 재배포 없이 앱 선택지에 등장
//   5) 원격에서 project.json + 전체 parts 200 검증
//
// 키: 환경변수 SUPABASE_URL·SERVICE_ROLE_KEY, 없으면 프로젝트 .env(VITE_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY) 자동 로드.
// ⚠️ 프로덕션 Storage 에 씀. service_role 키 필요.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const [rigDir, id, name] = process.argv.slice(2)
if (!rigDir || !id || !name) {
  console.error('사용법: node scripts/deploy-avatar.mjs <rigDir> <id> <name>')
  process.exit(1)
}
if (!/^[a-z0-9-]+$/.test(id)) {
  console.error(`id 는 소문자·숫자·하이픈만: "${id}"`); process.exit(1)
}

// 키 로드: env 우선, 없으면 .env 파싱
function fromEnvFile(key) {
  const envPath = join(dirname(dirname(fileURLToPath(import.meta.url))), '.env')
  if (!existsSync(envPath)) return undefined
  const line = readFileSync(envPath, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`))
  return line ? line.slice(key.length + 1) : undefined
}
const SB_URL = process.env.SUPABASE_URL || fromEnvFile('VITE_SUPABASE_URL')
const SERVICE = process.env.SERVICE_ROLE_KEY || fromEnvFile('SUPABASE_SERVICE_ROLE_KEY')
if (!SB_URL || !SERVICE) { console.error('SUPABASE_URL·SERVICE_ROLE_KEY(또는 .env) 필요'); process.exit(1) }
const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } })

// 1) 병합
const charPath = join(rigDir, 'character.json'), miniPath = join(rigDir, 'mini_rig.json')
if (!existsSync(charPath)) { console.error(`character.json 없음: ${charPath}`); process.exit(1) }
const character = JSON.parse(readFileSync(charPath, 'utf8'))
const miniRig = existsSync(miniPath) ? JSON.parse(readFileSync(miniPath, 'utf8')) : null
if (!miniRig) console.warn('⚠️ mini_rig.json 없음 — _mini_rig 미인라인 시 렌더 부정확(아리아형 fallback). 계속하려면 확인.')
const project = { ...character, ...(miniRig ? { _mini_rig: miniRig } : {}) }
const renderMode = miniRig?.render_mode ?? '(none)'
console.log(`[${id}] project_kind=${project.project_kind} parts=${project.parts.length} render_mode=${renderMode}`)

// 2) parts 검증
const paths = [...new Set(project.parts.map((p) => p.source_path))]
const missing = paths.filter((rel) => !existsSync(join(rigDir, rel)))
if (missing.length) { console.error(`❌ 누락 parts: ${missing.slice(0, 8).join(', ')}`); process.exit(1) }
console.log(`parts 검증: ${paths.length}개 존재 ✓`)

// 3) 업로드
const up = async (key, body, ct) => {
  const { error } = await admin.storage.from('avatars').upload(key, body, { contentType: ct, upsert: true })
  if (error) throw new Error(`${key}: ${error.message}`)
}
await up(`${id}/project.json`, Buffer.from(JSON.stringify(project)), 'application/json')
let n = 0
for (const rel of paths) {
  const ext = rel.split('.').pop().toLowerCase()
  const ct = ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
  await up(`${id}/${rel}`, readFileSync(join(rigDir, rel)), ct)
  if (++n % 20 === 0) console.log(`  parts ${n}/${paths.length}`)
}
console.log(`업로드: avatars/${id}/project.json + parts ${n}개 ✓`)

// 4) 매니페스트 갱신
const manifestUrl = `${SB_URL}/storage/v1/object/public/avatars/manifest.json`
let manifest = { avatars: [] }
try {
  const r = await fetch(`${manifestUrl}?t=${Date.now()}`)
  if (r.ok) manifest = await r.json()
} catch { /* 없으면 새로 */ }
manifest.avatars = (manifest.avatars ?? []).filter((a) => a.id !== id)
manifest.avatars.push({ id, name })
manifest.avatars.sort((a, b) => a.id.localeCompare(b.id))
await up('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json')
console.log(`매니페스트: ${manifest.avatars.map((a) => a.id).join(', ')} ✓`)

// 5) 원격 검증
const base = `${SB_URL}/storage/v1/object/public/avatars/${id}`
let ok = (await fetch(`${base}/project.json?t=${Date.now()}`)).status === 200 ? 1 : 0
const bad = []
for (const rel of paths) {
  ;(await fetch(`${base}/${rel}`)).status === 200 ? ok++ : bad.push(rel)
}
console.log(`원격 검증: ${ok}/${paths.length + 1} 200` + (bad.length ? ` ❌ ${bad.slice(0, 5)}` : ' ✓'))
console.log(bad.length ? '\n배포 불완전 — 위 실패 확인.' : `\n✅ "${name}"(${id}) 배포 완료 — 설정에서 바로 선택 가능.`)
process.exit(bad.length ? 1 : 0)
