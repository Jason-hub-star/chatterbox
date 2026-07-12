#!/usr/bin/env node
// docs/ 내부 상대 마크다운 링크 무결성 검사 — G1 문서 리팩토링(2026-07-12)의 검증 표면.
// [텍스트](상대경로.md#anchor) 형태만 검사(백틱 파일명 언급·외부 URL·앵커 전용 링크는 대상 아님).
// 사용: node scripts/check-doc-links.mjs  → 깨진 링크 목록 + exit 1 / 없으면 exit 0.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

const ROOT = resolve(process.cwd(), 'docs')
const files = []
;(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name.endsWith('.md')) files.push(p)
  }
})(ROOT)

const LINK_RE = /\]\(([^)\s]+?\.md)(#[^)]*)?\)/g
let broken = 0
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(LINK_RE)) {
    const target = m[1]
    if (/^(https?|mailto):/.test(target)) continue
    // 저장소 루트 기준(docs/... 또는 scripts/... 등) 우선, 아니면 파일 기준 상대경로.
    const fromRepo = resolve(process.cwd(), target)
    const fromFile = resolve(dirname(file), target)
    if (!existsSync(fromFile) && !existsSync(fromRepo)) {
      broken++
      console.log(`BROKEN ${file.replace(process.cwd() + '/', '')} → ${target}`)
    }
  }
}
console.log(broken === 0 ? 'doc links OK (0 broken)' : `\n${broken} broken link(s)`)
process.exit(broken ? 1 : 0)
