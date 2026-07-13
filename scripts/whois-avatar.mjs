#!/usr/bin/env node
// CS 조회 도구(ISS-04 창구 짝) — "이 유저가 어떤 아바타를 만들었나"를 한 명령으로.
// 유저를 찾아 아바타 잡·피드백 티켓을 나열하고, 각 잡에 **프로드 인스펙터 딥링크**를 붙인다
// (avatar-inspect 는 공개 라우트 — 링크 클릭 = 실제 렌더러로 실렌더, 별도 도구 불필요).
//
// 사용법: node scripts/whois-avatar.mjs <display_name | 이메일 | user-uuid | job-uuid>
//   --source   원본 업로드 그림의 서명 URL(1h)도 출력 — 유저가 올린 콘텐츠라 기본 미출력(프라이버시),
//              티켓 대응 등 필요할 때만. (조회 사실은 세션 로그에 남는다)
// 키: .env 자동 로드(service_role — 읽기 전용 조회만 수행).
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const SB = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
const APP = 'https://chatterbox-7r8.pages.dev'
const args = process.argv.slice(2)
const withSource = args.includes('--source')
const q = args.find((a) => !a.startsWith('--'))
if (!q) { console.error('사용법: node scripts/whois-avatar.mjs <이름|이메일|uuid> [--source]'); process.exit(1) }

const rest = async (path) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${path.split('?')[0]}: ${r.status}`)
  return r.json()
}
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

// 유저 해석: uuid 면 users.id → 실패 시 잡 id 로, 아니면 이름/이메일.
let user = null
if (isUuid(q)) {
  user = (await rest(`users?id=eq.${q}&select=id,display_name,avatar_url,created_at`))[0]
  if (!user) {
    const job = (await rest(`avatar_jobs?id=eq.${q}&select=user_id`))[0]
    if (job) user = (await rest(`users?id=eq.${job.user_id}&select=id,display_name,avatar_url,created_at`))[0]
  }
} else {
  const enc = encodeURIComponent(q)
  user = (await rest(`users?or=(display_name.eq.${enc},email.ilike.${enc}@%25)&select=id,display_name,avatar_url,created_at`))[0]
}
if (!user) { console.error(`유저를 못 찾았어요: ${q}`); process.exit(1) }

console.log(`\n== ${user.display_name ?? '(이름 없음)'} (users.id ${user.id}, 가입 ${user.created_at?.slice(0, 10)}) ==`)
if (user.avatar_url) {
  console.log(`현재 착용: ${APP}/avatar-inspect?project=${encodeURIComponent(user.avatar_url)}`)
}

const jobs = await rest(`avatar_jobs?user_id=eq.${user.id}&select=id,status,phase,error,created_at,result_project_url,input_object_key&order=created_at.desc`)
console.log(`\n아바타 잡 ${jobs.length}건:`)
for (const j of jobs) {
  const worn = j.result_project_url && j.result_project_url === user.avatar_url ? ' ★착용중' : ''
  console.log(`\n- [${j.status}${j.phase ? `/${j.phase}` : ''}] ${j.id} (${j.created_at?.slice(0, 16)})${worn}`)
  if (j.error) console.log(`  error: ${String(j.error).slice(0, 140)}`)
  if (j.result_project_url) {
    console.log(`  보기(실렌더): ${APP}/avatar-inspect?project=${encodeURIComponent(j.result_project_url)}`)
  }
  if (withSource && j.input_object_key) {
    const r = await fetch(`${SB}/storage/v1/object/sign/avatar-uploads/${j.input_object_key}?expiresIn=3600`, {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: '{}',
    })
    const d = await r.json().catch(() => null)
    console.log(d?.signedURL ? `  원본(1h 서명): ${SB}/storage/v1${d.signedURL}` : `  원본 서명 실패(${r.status})`)
  }
}

const tickets = await rest(`feedback?user_id=eq.${user.id}&select=id,category,status,description,diag,created_at&order=created_at.desc&limit=10`)
if (tickets.length) {
  console.log(`\n피드백 티켓 ${tickets.length}건:`)
  for (const f of tickets) {
    console.log(`- [${f.status}] ${f.id.slice(0, 8).toUpperCase()} ${f.category} (${f.created_at?.slice(0, 16)}) — ${String(f.description).slice(0, 60)}`)
    if (f.diag?.avatar_job_id) console.log(`  diag→잡: ${f.diag.avatar_job_id}`)
  }
}
console.log('')
