import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// 위생 게이트(GOAL-hygiene-host-guard): 호스트게이트 응답 계약("Not host")은
// _shared/supa.ts 의 requireHostRoom 단일 지점에서만 나온다. Edge 함수에 인라인
// 복사(4줄 체인)가 부활하면 이 테스트가 red 로 막는다 — 새 함수는 requireHostRoom 을
// 쓰거나, 통째 치환이 불가능한 정당한 변형만 사유와 함께 ALLOW 에 등재한다.
const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions')

const ALLOW = new Set([
  // 호스트체크가 action==='assign' 조건부(claim/release 는 참가자 권한) — 체인 통째 치환 불가.
  'sync-script-role',
])

describe('edge host-guard hygiene', () => {
  it('requireHostRoom 헬퍼가 _shared/supa.ts 에 존재한다', () => {
    const supa = readFileSync(join(FUNCTIONS_DIR, '_shared', 'supa.ts'), 'utf8')
    expect(supa).toContain('export async function requireHostRoom')
    expect(supa).toContain('"Not host"')
  })

  it('"Not host" 인라인 복사가 없다 (헬퍼 또는 ALLOW 등재만 허용)', () => {
    const offenders: string[] = []
    for (const entry of readdirSync(FUNCTIONS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '_shared') continue
      const indexPath = join(FUNCTIONS_DIR, entry.name, 'index.ts')
      if (!existsSync(indexPath)) continue
      if (readFileSync(indexPath, 'utf8').includes('"Not host"') && !ALLOW.has(entry.name)) {
        offenders.push(entry.name)
      }
    }
    expect(offenders, `인라인 호스트체크 발견 — requireHostRoom 으로 치환: ${offenders.join(', ')}`).toEqual([])
  })
})
