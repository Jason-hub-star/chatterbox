// 통합테스트: create-avatar-job 콘텐츠-해시 디덥(레버 ④). supabase-slice-verify 하네스용 — vitest 아님.
// 실행(권장: MODAL_ENDPOINT_URL 미설정 상태 — 그래야 캐시 히트만 200 이 되어 "Modal 미호출"이 증명된다):
//   `supabase functions serve` (create-avatar-job) 후
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//   HOST_EMAIL=... HOST_PASSWORD=... \
//   node tests/integration/avatar-job-dedup.mjs
//
// 검증:
//   1) 캐시 히트: 시드된 done 행과 같은 hash → 즉시 status='done' + provider='cache' + 동일 result_project_url
//        (Modal env 미설정에도 200 done = 연산·spawn 미경유 증명)
//   2) force_regen=true: 같은 hash 라도 캐시 무시 → 캐시 응답 아님(정상 경로 진입)
//   3) 다른 hash: 히트 없음 → 캐시 응답 아님
//   4) hash 없음(구 클라): 하위호환 → 캐시 응답 아님
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const FN = `${URL}/functions/v1`

const H = 'a'.repeat(64) // 시드/히트용 가짜 png sha256(64-hex)
const H2 = 'b'.repeat(64) // 미스용(시드 없음)
const CACHE_KEY = `${H}:v1` // RIG_CACHE_VERSION=1 접두 — Edge 조합 키와 일치해야 함
const SEED_URL = 'avatars/dedup-seed/project.json'

let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('  ✗', m)) }

async function signIn(email, password) {
  const c = createClient(URL, ANON)
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn ${email}: ${error.message}`)
  return data.session.access_token
}
async function callFn(name, token, body) {
  const res = await fetch(`${FN}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}
const isCacheResult = (r) => r.status === 200 && r.json?.status === 'done' && r.json?.result_project_url === SEED_URL

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

async function main() {
  const tok = await signIn(process.env.HOST_EMAIL, process.env.HOST_PASSWORD)
  const authId = (await createClient(URL, ANON).auth.getUser(tok)).data.user.id
  const { data: u } = await svc.from('users').select('id').eq('auth_id', authId).single()
  const userId = u.id
  const objKey = `${authId}/uploads/dedup.png` // isSafeObjectKey 형식만 통과하면 됨(히트는 스토리지 미접근)

  // 정리 후 시드: 이전 잔여 제거 → 캐시 대상 done 행 1개 심기
  await svc.from('avatar_jobs').delete().eq('user_id', userId).in('input_hash', [CACHE_KEY, `${H2}:v1`])
  await svc.from('avatar_jobs').insert({
    user_id: userId, status: 'done', phase: 'finishing',
    input_hash: CACHE_KEY, result_project_url: SEED_URL, provider: 'modal',
    completed_at: new Date().toISOString(),
  })

  console.log('avatar-job-dedup integration')

  // 1) 캐시 히트
  const r1 = await callFn('create-avatar-job', tok, { object_key: objKey, input_hash: H })
  ok(isCacheResult(r1), `캐시 히트 → 200 done + 동일 result_project_url (status=${r1.status}, url=${r1.json?.result_project_url})`)
  const { data: cacheRows } = await svc.from('avatar_jobs')
    .select('id, provider').eq('user_id', userId).eq('input_hash', CACHE_KEY).eq('provider', 'cache')
  ok((cacheRows?.length ?? 0) >= 1, `provider='cache' done-row 생성됨 (${cacheRows?.length ?? 0}건)`)

  // 2) force_regen → 캐시 무시(정상 경로). Modal 미설정이면 500 미설정, 설정이면 running — 어느 쪽이든 캐시 아님.
  const r2 = await callFn('create-avatar-job', tok, { object_key: objKey, input_hash: H, force_regen: true })
  ok(!isCacheResult(r2), `force_regen → 캐시 응답 아님 (status=${r2.status})`)

  // 3) 다른 hash(시드 없음) → 히트 없음
  const r3 = await callFn('create-avatar-job', tok, { object_key: objKey, input_hash: H2 })
  ok(!isCacheResult(r3), `미스(다른 hash) → 캐시 응답 아님 (status=${r3.status})`)

  // 4) hash 없음(구 클라) → 하위호환(캐시 미참여)
  const r4 = await callFn('create-avatar-job', tok, { object_key: objKey })
  ok(!isCacheResult(r4), `hash 없음 → 캐시 응답 아님·하위호환 (status=${r4.status})`)

  // cleanup: 시드 + 캐시-히트 + (Modal 목이 있었다면)정상경로 큐 행까지 hash 로 일괄 제거
  await svc.from('avatar_jobs').delete().eq('user_id', userId).in('input_hash', [CACHE_KEY, `${H2}:v1`])

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
