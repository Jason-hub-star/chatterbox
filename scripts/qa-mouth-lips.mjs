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

const args = process.argv.slice(2)
const reportOnly = args.includes('--report')
const pIdx = args.indexOf('--project')
const projectPath = pIdx >= 0 ? args[pIdx + 1] : null
const dir = args.find((a, i) => !a.startsWith('--') && (pIdx < 0 || i !== pIdx + 1))
if (!dir) { console.error('사용법: node scripts/qa-mouth-lips.mjs <dir> [--report] [--project <file>]'); process.exit(1) }

const project = JSON.parse(readFileSync(projectPath ?? join(dir, 'project.json'), 'utf8'))
if (project.mouth_mode !== 'states') { console.log(`qa-mouth-lips: mouth_mode=${project.mouth_mode ?? '(none)'} — states 아님, 스킵`); process.exit(0) }
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

const closedPx = lipPixels(closed)
console.log(`qa-mouth-lips: skin=(${skin.map((v) => v.toFixed(0)).join(',')}) closed 립안료=${closedPx}px`)
if (closedPx < MIN_CLOSED_LIP_PX) { console.log(`⚠️ closed 립안료 ${closedPx} < ${MIN_CLOSED_LIP_PX} — 무안료 화풍으로 판단, 연속성 게이트 보류(수동 확인 권장)`); process.exit(0) }

const failed = []
for (const s of states) {
  const px = lipPixels(s)
  const ratio = px / closedPx
  const bad = ratio < MIN_LIP_RATIO
  console.log(`  ${s.id}: 립안료=${px}px ratio=${ratio.toFixed(2)}${bad ? ` ❌ < ${MIN_LIP_RATIO}` : ' ✓'}`)
  if (bad) failed.push(s.id)
}
if (failed.length) {
  console.error(`\n❌ 입 상태 가시성 미달: ${failed.join(', ')} — 해당 MouthOpenY 밴드에서 입이 사라져 보임(ISS-04 클래스).`)
  console.error('   조치: 해당 상태 자산 재생성, 또는 임시로 closed_master 크로스페이드(스킬 avatar-deploy 참조).')
  process.exit(reportOnly ? 0 : 1)
}
console.log('qa-mouth-lips: PASS')
