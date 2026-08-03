import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// 색상 조화 회귀가드(GOAL-color-harmony CP4, 2026-08-03): CP1~CP3 에서 제거한 구 색 리터럴이
// 부활하면 red 로 막는다. 값이 토큰으로 승격됐으므로 이 구값/임의클래스는 다시 나오면 안 된다.
//   · 장르 무지개(밝기 제각각) 7색 → OKLCH 격자값(genrePresets.ts)
//   · 모드배너 생 파랑/보라 → 무채 다크 팔레트 틴트(ModeBanner.tsx)
//   · 반복 임의클래스 bg-[#f4f0e8]·text-[#241605] → @theme 토큰(bg-avatar-canvas·text-cta-ink)
// 새 값(#FF9CB6·#374C76 등)이나 브랜드 강제색(#FEE500 카카오·#00b140 그린스크린)은 대상 아님.
const SRC_DIR = join(process.cwd(), 'src')

// 제거된 구 리터럴(소문자 정규화 후 비교 — CSS hex 대소문자 무관)
const FORBIDDEN_HEX = [
  '#ff5c93', '#a78bfa', '#38d1d9', '#ffcb47', '#7aa2ff', '#4ecdc4', '#9c8b73', // 장르 구값
  '#2563eb', '#9333ea', // 모드배너 구값
]
const FORBIDDEN_CLASS = ['bg-[#f4f0e8]', 'text-[#241605]'] // 반복 임의클래스(승격 완료)

function collectSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectSources(p))
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(p)
  }
  return out
}

describe('color token regression guard', () => {
  const files = collectSources(SRC_DIR)

  it('제거된 구 색 리터럴이 부활하지 않았다 (토큰으로 승격 완료)', () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const lower = src.toLowerCase()
      for (const hex of FORBIDDEN_HEX) if (lower.includes(hex)) offenders.push(`${f} :: ${hex}`)
      for (const cls of FORBIDDEN_CLASS) if (src.includes(cls)) offenders.push(`${f} :: ${cls}`)
    }
    expect(
      offenders,
      `제거된 구 색 리터럴 부활 — 토큰(장르 OKLCH 값·배너 틴트·bg-avatar-canvas·text-cta-ink)으로 치환: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('승격 토큰이 index.css @theme 에 정의돼 있다 (토큰층 유지)', () => {
    const css = readFileSync(join(SRC_DIR, 'index.css'), 'utf8')
    for (const tok of ['--color-avatar-canvas', '--color-cta-ink', '--color-wood-sign-bg', '--color-gold-text']) {
      expect(css, `토큰 정의 소실: ${tok}`).toContain(tok)
    }
  })
})
