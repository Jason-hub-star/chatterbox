#!/usr/bin/env node
// 입 상태 자산 QA 게이트 — "발화 중 입술 소실" 결함(ISS-04, poon995 실측)을 발행 전에 차단.
//
// 결함 클래스: AUTORIG 이 생성한 mouth_state_* 이미지에 입술 안료가 없어, states 모드에서
// MouthOpenY 가 해당 밴드에 들어가면 입이 피부에 묻혀 사라져 보인다. 정지 초상 검수로는 안 잡힘.
//
// 판정 = 립 안료 연속성: closed 에 입술 안료(웜핑크 픽셀)가 충분한데 어느 state 에서 안료가
// 급락하면, MouthOpenY 가 그 밴드를 지날 때 입술이 툭 사라져 보인다(경계 팝). closed 자체가
// 무안료(다크라인 화풍)면 연속성 위반이 아니므로 게이트 보류. 피부 기준색은 face_base 입 영역 평균.
// ponytail: 임계는 결함 표본 1개(poon995) 실측 기반 — 정상 states 표본 확보 시 재캘리브레이션.
//
// 사용법: node scripts/qa-mouth-lips.mjs <dir> [--report] [--project <file>]
//   dir        parts/ 를 담은 로컬 번들 루트 (기본: <dir>/project.json 판독)
//   --report   게이트 실패여도 exit 0 (계측만)
//   --project  project.json 이 dir 밖에 있을 때 명시 (deploy-avatar 병합본 등)
// 의존: ffmpeg/ffprobe (PATH)
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const MIN_LIP_RATIO = 0.35 // state 립안료/closed — poon995 실측: 소실 재현 small=0.19 vs 수용가능 mid=0.64 사이값
const MIN_CLOSED_LIP_PX = 400 // closed 립안료가 이보다 작으면 무안료 화풍 — 연속성 판정 보류
const MAX_DARK_INTERIOR = 0.40 // 입안 near-black(max<80) 비율 상한 — 초과 = 검정 캐비티(ISS-04 형제).
//   립 안료 게이트가 어두운 구강을 명시 제외(lipPixels)하는 사각을 메운다. 결함표본 4909f992 mid 0.58
//   vs 정상 mimi mid 0.03·wide 0.25 사이값. ponytail: 정상 states 표본 늘면 재캘리브레이션.
const AMP_MAX_RATIO = 0.13 // 열린입 파츠높이/얼굴높이 상한(입 과다개구). 칼리브레이션 n=5: 정상 max 10.6%(1a30)
//   vs 결함 17.5%(99c74a83·wide_grow) 사이. 모드 무관 정적 bbox 판정. ponytail: 표본 늘면 재보정.

const args = process.argv.slice(2)
const reportOnly = args.includes('--report')
const pIdx = args.indexOf('--project')
const projectPath = pIdx >= 0 ? args[pIdx + 1] : null
const dir = args.find((a, i) => !a.startsWith('--') && (pIdx < 0 || i !== pIdx + 1))
if (!dir) { console.error('사용법: node scripts/qa-mouth-lips.mjs <dir> [--report] [--project <file>]'); process.exit(1) }

const project = JSON.parse(readFileSync(projectPath ?? join(dir, 'project.json'), 'utf8'))

// 축 0) 입 벌림 진폭 — 모드 무관(wide_grow 포함). 열린입 파츠 높이/얼굴 높이가 과대하면 발화 시 과다 개구.
//   정적 bbox 판정이라 ffmpeg 불요. mouth_state_* / mouth_open* / mouth_wide* 중 최대 높이 vs face_base.
const ampFailed = []
{
  const fb = project.parts.find((p) => p.id === 'face_base')
  const opens = project.parts.filter((p) => /^mouth_(state_|open|wide)/.test(p.id) && Array.isArray(p.bbox))
  // 렌더 개구 = base 메시 지오메트리(mesh.vertices) y-extent — 렌더러(rigMath keyformBaseVertices)가 이
  //   base 지오메트리를 그린다(2026-07-16 실렌더 실증: base 123→68px 축소=입 작아짐, 키폼 압축은 무영향).
  //   메시 없으면 스프라이트 bbox 폴백. 클램프 후 bbox(스프라이트)는 불변이라 base 메시가 렌더-정합 신호.
  const baseH = (p) => {
    const mesh = (project.meshes || []).find((m) => m.part_id === p.id)
    if (mesh?.vertices?.length) {
      const ys = mesh.vertices.map((v) => v[1])
      return Math.max(...ys) - Math.min(...ys)
    }
    return p.bbox[3]
  }
  if (fb?.bbox && opens.length) {
    const faceH = fb.bbox[3], openH = Math.round(Math.max(...opens.map(baseH)))
    const ratio = openH / faceH
    const bad = ratio > AMP_MAX_RATIO
    console.log(`qa-mouth-lips: 입벌림 openH=${openH}/faceH=${faceH} = ${(ratio * 100).toFixed(1)}%${bad ? ` ❌ > ${(AMP_MAX_RATIO * 100).toFixed(0)}%` : ' ✓'}`)
    if (bad) ampFailed.push(`입벌림과대 ${(ratio * 100).toFixed(1)}%(>${(AMP_MAX_RATIO * 100).toFixed(0)}%)`)
  } else {
    console.log('qa-mouth-lips: face_base/열린입 파츠 없음 — 진폭 축 보류')
  }
}

// 립 안료·검정캐비티 축은 states 전용. non-states(wide_grow 등)는 진폭 축만으로 판정.
if (project.mouth_mode !== 'states') {
  console.log(`qa-mouth-lips: mouth_mode=${project.mouth_mode ?? '(none)'} — 립/캐비티 축 스킵(진폭 축은 판정함)`)
  if (ampFailed.length) {
    console.error(`\n❌ 입 결함: ${ampFailed.join(', ')} — 얼굴 대비 입이 과대하게 벌어짐.`)
    console.error('   조치: AUTORIG 입 진폭 클램프(rig_keyforms wide_grow 얼굴비례) 재빌드, 또는 상태 자산 재생성.')
    process.exit(reportOnly ? 0 : 1)
  }
  console.log('qa-mouth-lips: PASS (진폭 축)')
  process.exit(0)
}
const closed = project.parts.find((p) => p.id === 'mouth_closed_master') ?? project.parts.find((p) => /mouth.*closed/.test(p.id))
const states = project.parts.filter((p) => p.id.startsWith('mouth_state_'))
if (!closed || !states.length) { console.log('qa-mouth-lips: closed/state 파츠 없음 — 스킵'); process.exit(0) }

function decode(file) {
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim().split(',').map(Number)
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 128 * 1024 * 1024 })
  return { w, h, buf }
}

// 입 영역 = 관련 파츠 bbox 합집합 (+여유 8px)
const boxes = [closed, ...states].map((p) => p.bbox).filter(Boolean)
const rx0 = Math.min(...boxes.map((b) => b[0])) - 8, ry0 = Math.min(...boxes.map((b) => b[1])) - 8
const rx1 = Math.max(...boxes.map((b) => b[0] + b[2])) + 8, ry1 = Math.max(...boxes.map((b) => b[1] + b[3])) + 8

// 피부 기준색: face_base 입 영역의 불투명 픽셀 평균
let skin = [245, 205, 190]
const faceBase = project.parts.find((p) => p.id === 'face_base')
if (faceBase && existsSync(join(dir, faceBase.source_path))) {
  const { w, h, buf } = decode(join(dir, faceBase.source_path))
  let r = 0, g = 0, b = 0, n = 0
  for (let y = Math.max(0, ry0); y < Math.min(h, ry1); y++) {
    for (let x = Math.max(0, rx0); x < Math.min(w, rx1); x++) {
      const i = (y * w + x) * 4
      if (buf[i + 3] > 200) { r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++ }
    }
  }
  if (n > 500) skin = [r / n, g / n, b / n]
}

// 립 안료 픽셀: 피부와 구분되는 웜핑크/레드(r 우세 + 중간 이상 명도) — 어두운 구강 내부는 제외
function lipPixels(part) {
  const file = join(dir, part.source_path)
  if (!existsSync(file)) return -1
  const { w, h, buf } = decode(file)
  let n = 0
  for (let y = Math.max(0, ry0); y < Math.min(h, ry1); y++) {
    for (let x = Math.max(0, rx0); x < Math.min(w, rx1); x++) {
      const i = (y * w + x) * 4
      if (buf[i + 3] < 60) continue
      const r = buf[i], g = buf[i + 1], b = buf[i + 2]
      const dr = r - skin[0], dg = g - skin[1], db = b - skin[2]
      if (Math.sqrt(dr * dr + dg * dg + db * db) < 45) continue // 피부와 동화 = 안 보임
      if (r > 120 && r > g + 25 && r > b + 25 && r + g + b > 240) n++ // 웜핑크·레드 안료
    }
  }
  return n
}

// 입안 암부율: 불투명 픽셀 중 near-black(max<80) 비율 — 립 안료와 독립. "검정 캐비티"(입안이 치아·혀
// 없이 어두운 구강으로 생성) 검출. 립 게이트는 어두운 구강을 명시 제외하므로 이 결함을 못 잡는다.
function darkInterior(part) {
  const file = join(dir, part.source_path)
  if (!existsSync(file)) return 0
  const { w, h, buf } = decode(file)
  let n = 0, dark = 0
  for (let y = Math.max(0, ry0); y < Math.min(h, ry1); y++) {
    for (let x = Math.max(0, rx0); x < Math.min(w, rx1); x++) {
      const i = (y * w + x) * 4
      if (buf[i + 3] < 128) continue
      n++
      if (Math.max(buf[i], buf[i + 1], buf[i + 2]) < 80) dark++
    }
  }
  return n > 50 ? dark / n : 0
}

// 렌더에서 실제로 보이는 state 만 판정 — opacity 키프레임이 전부 0(fix-mouth-crossfade 로 억제)이면
// 그 밴드에 안 그려지므로 결함 판정에서 제외(폴백 적용 아바타가 게이트를 통과하도록).
function isShown(partId) {
  const kf = (project.part_opacity_keyframes || []).find((k) => k.part_id === partId && k.parameter_id === 'ParamMouthOpenY')
  if (!kf) return true
  return kf.keyframes.some((p) => p.opacity > 0.01)
}

const closedPx = lipPixels(closed)
console.log(`qa-mouth-lips: skin=(${skin.map((v) => v.toFixed(0)).join(',')}) closed 립안료=${closedPx}px`)

const failed = [...ampFailed] // 진폭 축(축 0) 결과 병합 — states 아바타도 과대개구면 FAIL

// 축 1) 입안 검정 캐비티 — 립 안료 화풍과 무관하게 항상 판정.
for (const s of states) {
  if (!isShown(s.id)) { console.log(`  ${s.id}: 억제됨(opacity 0) — 스킵`); continue }
  const dark = darkInterior(s)
  const bad = dark > MAX_DARK_INTERIOR
  console.log(`  ${s.id}: 입안암부=${(dark * 100).toFixed(0)}%${bad ? ` ❌ > ${MAX_DARK_INTERIOR * 100}%` : ' ✓'}`)
  if (bad) failed.push(`${s.id}(검정캐비티 ${(dark * 100).toFixed(0)}%)`)
}

// 축 2) 립 안료 연속성 — 무안료(다크라인) 화풍이면 이 축만 보류(캐비티 축은 위에서 이미 판정).
if (closedPx < MIN_CLOSED_LIP_PX) {
  console.log(`⚠️ closed 립안료 ${closedPx} < ${MIN_CLOSED_LIP_PX} — 무안료 화풍, 립 연속성 축 보류(캐비티 축은 판정함)`)
} else {
  for (const s of states) {
    if (!isShown(s.id)) continue
    const ratio = lipPixels(s) / closedPx
    const bad = ratio < MIN_LIP_RATIO
    console.log(`  ${s.id}: 립안료ratio=${ratio.toFixed(2)}${bad ? ` ❌ < ${MIN_LIP_RATIO}` : ' ✓'}`)
    if (bad) failed.push(`${s.id}(립소실 ${ratio.toFixed(2)})`)
  }
}

if (failed.length) {
  console.error(`\n❌ 입 상태 결함: ${failed.join(', ')} — 해당 MouthOpenY 밴드에서 입술 소실 또는 입안 검정 캐비티(ISS-04 클래스).`)
  console.error('   조치: 해당 상태 자산 재생성(정공), 또는 폴백 `node scripts/fix-mouth-crossfade.mjs --id <id> --upload`.')
  process.exit(reportOnly ? 0 : 1)
}
console.log('qa-mouth-lips: PASS')
