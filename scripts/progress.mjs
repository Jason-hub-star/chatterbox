// docs:progress — MILESTONES.md 의 Phase별 AC 체크박스로 "구현 진행률"을 집계한다.
// 축 구분: 설계/문서 완성도는 `npm run docs:health`, 구현 진행도는 이 명령.
// (Phase 축 자체의 의미는 MILESTONES(데모 마일스톤) ↔ IMPLEMENTATION-ORDER(빌드 순서) crosswalk 참조)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const md = readFileSync(join(root, 'docs/MILESTONES.md'), 'utf8')

const phases = []
let cur = null
for (const line of md.split('\n')) {
  const h = line.match(/^##\s+(Phase\s+\d+.*)$/)
  if (h) {
    cur = { title: h[1].trim(), done: 0, total: 0 }
    phases.push(cur)
    continue
  }
  if (line.startsWith('## ')) {
    cur = null // 비-Phase 섹션(피치 게이트·타임라인 등)은 집계 제외
    continue
  }
  if (!cur) continue
  const c = line.match(/^-\s+\[([ x])\]/)
  if (c) {
    cur.total++
    if (c[1] === 'x') cur.done++
  }
}

const bar = (d, t) => {
  const n = t ? Math.round((d / t) * 20) : 0
  return '█'.repeat(n) + '░'.repeat(20 - n)
}

let dTot = 0
let tTot = 0
console.log('# 구현 진행률 (MILESTONES AC 기준)\n')
for (const p of phases) {
  dTot += p.done
  tTot += p.total
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
  console.log(`${bar(p.done, p.total)} ${String(pct).padStart(3)}%  ${p.done}/${p.total}  ${p.title}`)
}
const opct = tTot ? Math.round((dTot / tTot) * 100) : 0
console.log(`\n전체: ${dTot}/${tTot} AC 완료 (${opct}%)`)
console.log('※ 설계/문서 완성도는 `npm run docs:health` (별개 축)')
