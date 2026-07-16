#!/usr/bin/env node
// 입 상태 "검정 캐비티" 자동 폴백 — ISS-04 형제 결함(입안이 치아·혀 없이 어두운 구강으로 생성).
//
// 결함 클래스: AUTORIG 가 특정 mouth_state_* 의 입안을 near-black 캐비티로 합성한다(더 벌린 state
//   보다 mid 가 더 검정인 "역전"이 신호). qa-mouth-lips 는 립 안료 연속성만 봐서 못 잡는다 — 입술은
//   멀쩡하고 입안만 검으니까. 이 스크립트는 입안 암부율을 재서 나쁜 state 를 검출하고, 그 state 를
//   렌더에서 빼고 이웃 정상 state 로 크로스페이드하도록 part_opacity_keyframes 를 재작성한다.
//   자산을 새로 만들지 않는다(콘텐츠 의존 아트 리페어는 불가·과설계) — "알려진 나쁜 상태를 안 그리기".
//
// 정공 근본수정은 Vtube AUTORIG 입상태 재생성(ISS-04). 이건 그 사이의 결정적 폴백이다.
//
// 사용법:
//   node scripts/fix-mouth-crossfade.mjs --project <project.json> [--out <path>] [--report]
//   node scripts/fix-mouth-crossfade.mjs --id <storageId> [--upload]   # 프로드에서 받아 폴백, --upload 시 재업로드(백업)
//   옵션: --dark <0.40> 임계 · --report 검출만(재작성 안 함)
// 의존: ffmpeg/ffprobe(PATH). --id/--upload 는 .env(VITE_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY).
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const has = (k) => args.includes(k)
const DARK_MAX = Number(opt('--dark', '0.40')) // 입안 near-black 허용 상한 — 초과 시 나쁜 state
//   ponytail: 결함 표본 1개(4909f992 mid 0.588) vs 정상(mimi mid 0.025·wide 0.251) 사이값. 정상 states
//   표본 늘면 재캘리브레이션. 상대 신호(더 벌린 state 보다 검정 = 역전)도 병행 판정.
const NEAR_BLACK = 80 // max(r,g,b) < 이 값 = 거의 검정(구강 캐비티)
const SUPPRESS = (opt('--suppress', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
//   게이트가 지목한 결함 state 를 강제 억제(암부 검출 스킵). 립소실 등 "캐비티 외" 결함도 이 폴백으로
//   복구 — qa-mouth-lips 실패 stderr 의 mouth_state_* 를 그대로 넘기면 그 상태를 빼고 이웃 크로스페이드.

const root = dirname(dirname(fileURLToPath(import.meta.url)))
function fromEnv(key) {
  const p = join(root, '.env')
  if (!existsSync(p)) return undefined
  const l = readFileSync(p, 'utf8').split('\n').find((x) => x.startsWith(`${key}=`))
  return l ? l.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : undefined
}

// ── 1) project.json + parts 확보 (로컬 --project 또는 프로드 --id 다운로드) ────────────────
let project, bundleDir, storageId
const SB = fromEnv('VITE_SUPABASE_URL'), KEY = fromEnv('SUPABASE_SERVICE_ROLE_KEY')
if (has('--id')) {
  storageId = opt('--id')
  if (!SB || !KEY) { console.error('.env(VITE_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY) 필요'); process.exit(1) }
  const base = `${SB}/storage/v1/object/public/avatars/${storageId}`
  const res = await fetch(`${base}/project.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) { console.error(`project.json 다운로드 실패: ${res.status}`); process.exit(1) }
  project = await res.json()
  bundleDir = mkdtempSync(join(tmpdir(), 'mouthfix-'))
  // 검출에 필요한 파트만 받는다(입 상태 + closed + face_base).
  const need = project.parts.filter((p) => /^(mouth_|face_base$)/.test(p.id))
  const { mkdirSync } = await import('node:fs')
  for (const p of need) {
    const r = await fetch(`${base}/${p.source_path}`)
    if (!r.ok) continue
    const dst = join(bundleDir, p.source_path)
    mkdirSync(dirname(dst), { recursive: true })
    writeFileSync(dst, Buffer.from(await r.arrayBuffer()))
  }
} else {
  const pj = opt('--project')
  if (!pj) { console.error('사용법: --project <project.json> | --id <storageId>'); process.exit(1) }
  project = JSON.parse(readFileSync(pj, 'utf8'))
  bundleDir = dirname(pj)
}

if (project.mouth_mode !== 'states') { console.log(`mouth_mode=${project.mouth_mode ?? '(none)'} — states 아님, 폴백 불필요`); process.exit(0) }
const states = project.parts.filter((p) => p.id.startsWith('mouth_state_'))
const closed = project.parts.find((p) => p.id === 'mouth_closed_master') ?? project.parts.find((p) => /mouth.*closed/.test(p.id))
if (!states.length) { console.log('mouth_state 파츠 없음 — 스킵'); process.exit(0) }

// ── 2) 입안 암부율 검출 ──────────────────────────────────────────────────────────
const boxes = [closed, ...states].map((p) => p.bbox).filter(Boolean)
const rx = Math.min(...boxes.map((b) => b[0])) - 8, ry = Math.min(...boxes.map((b) => b[1])) - 8
const rw = Math.max(...boxes.map((b) => b[0] + b[2])) + 8 - rx, rh = Math.max(...boxes.map((b) => b[1] + b[3])) + 8 - ry
function darkPct(part) {
  const file = join(bundleDir, part.source_path)
  if (!existsSync(file)) return null
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `crop=${rw}:${rh}:${rx}:${ry}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 })
  let n = 0, dark = 0
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] < 128) continue
    n++
    if (Math.max(buf[i], buf[i + 1], buf[i + 2]) < NEAR_BLACK) dark++
  }
  return n > 50 ? dark / n : null
}

// plateau(opacity 1 구간)로 state 를 벌림 순서 정렬 — 밴드 [lo,hi]
function plateau(partId) {
  const kf = (project.part_opacity_keyframes || []).find((k) => k.part_id === partId && k.parameter_id === 'ParamMouthOpenY')
  if (!kf) return null
  const on = kf.keyframes.filter((p) => p.opacity >= 0.99).map((p) => p.value)
  return on.length ? [Math.min(...on), Math.max(...on)] : null
}
const ranked = states.map((s) => ({ s, band: plateau(s.id), dark: SUPPRESS.length ? null : darkPct(s) }))
  .filter((r) => r.band).sort((a, b) => a.band[0] - b.band[0])

let bad = []
if (SUPPRESS.length) {
  bad = ranked.filter((r) => SUPPRESS.includes(r.s.id))
  console.log(`강제 억제(--suppress ${SUPPRESS.join(',')}): ${bad.map((r) => r.s.id).join(', ') || '(매칭 없음)'}`)
  if (!bad.length) { console.log('억제 대상 매칭 없음 — 스킵.'); process.exit(0) }
} else {
  console.log(`입 상태 암부율(임계 ${DARK_MAX}):`)
  for (const r of ranked) {
    const isBad = r.dark != null && r.dark > DARK_MAX
    console.log(`  ${r.s.id.padEnd(18)} band[${r.band[0]},${r.band[1]}] 암부=${r.dark == null ? 'n/a' : (r.dark * 100).toFixed(1) + '%'}${isBad ? ' ❌' : ' ✓'}`)
    if (isBad) bad.push(r)
  }
  if (!bad.length) { console.log('검정 캐비티 없음 — 폴백 불필요.'); process.exit(0) }
  if (has('--report')) { console.log(`\n검출만(--report): 나쁜 상태 ${bad.map((r) => r.s.id).join(', ')}`); process.exit(1) }
}

// ── 3) 크로스페이드 재작성 ─────────────────────────────────────────────────────────
// 나쁜 state S(밴드 [a,b])를 억제하고, 바로 아래/위 정상 state 를 [a,b]에서 dissolve.
const kfByPart = Object.fromEntries((project.part_opacity_keyframes || []).map((k) => [`${k.part_id}|${k.parameter_id}`, k]))
const setKf = (partId, keyframes) => {
  const key = `${partId}|ParamMouthOpenY`
  if (kfByPart[key]) kfByPart[key].keyframes = keyframes
}
for (const { s, band } of bad) {
  const [a, b] = band
  const lower = ranked.filter((r) => !bad.includes(r) && r.band[1] <= a).sort((x, y) => y.band[1] - x.band[1])[0]
  const upper = ranked.filter((r) => !bad.includes(r) && r.band[0] >= b).sort((x, y) => x.band[0] - y.band[0])[0]
  const lowerId = lower?.s.id ?? closed?.id
  // 나쁜 state 억제
  setKf(s.id, [{ value: 0, opacity: 0 }, { value: 1, opacity: 0 }])
  // 아래 이웃: plateau 유지하다 [a→b] 페이드아웃
  if (lowerId) {
    const lb = lower?.band ?? plateau(lowerId) ?? [0, a]
    setKf(lowerId, [
      { value: 0, opacity: lowerId === closed?.id ? 1 : 0 },
      { value: Math.max(0, lb[0] - 0.005), opacity: lowerId === closed?.id ? 1 : 0 },
      { value: lb[0], opacity: 1 }, { value: a, opacity: 1 }, { value: b, opacity: 0 }, { value: 1, opacity: 0 },
    ])
  }
  // 위 이웃: [a→b] 페이드인 후 plateau 유지
  if (upper) {
    const ub = upper.band
    setKf(upper.s.id, [{ value: 0, opacity: 0 }, { value: a, opacity: 0 }, { value: b, opacity: 1 }, { value: ub[1], opacity: 1 }])
  }
  console.log(`재작성: ${s.id} 억제, ${lowerId ?? '(none)'}→${upper?.s.id ?? '(none)'} [${a}→${b}] 크로스페이드`)
}
project.generated_at = new Date().toISOString()

// ── 4) 출력/업로드 ────────────────────────────────────────────────────────────────
if (has('--upload')) {
  if (!storageId || !SB || !KEY) { console.error('--upload 은 --id + .env 필요'); process.exit(1) }
  const base = `${SB}/storage/v1/object/public/avatars/${storageId}`
  const cur = await (await fetch(`${base}/project.json?t=${Date.now()}`, { cache: 'no-store' })).json()
  const put = async (path, body) => {
    const r = await fetch(`${SB}/storage/v1/object/avatars/${path}`, {
      method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
      body,
    })
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  }
  await put(`${storageId}/project.pre-mouthfix.json`, JSON.stringify(cur)) // 백업(롤백용)
  await put(`${storageId}/project.json`, JSON.stringify(project))
  const remote = await (await fetch(`${base}/project.json?t=${Date.now()}`, { cache: 'no-store' })).json()
  console.log(remote.generated_at === project.generated_at
    ? `업로드 ✓ (백업 project.pre-mouthfix.json, rev ${project.generated_at})`
    : `❌ 원격 rev 불일치: ${remote.generated_at}`)
} else {
  const out = opt('--out', has('--id') ? join(bundleDir, 'project.fixed.json') : opt('--project').replace(/\.json$/, '.fixed.json'))
  writeFileSync(out, JSON.stringify(project))
  console.log(`\n출력: ${out} (업로드하려면 --id <id> --upload)`)
}
