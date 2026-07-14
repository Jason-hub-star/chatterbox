import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// 위생 게이트(GOAL-hygiene-host-guard · 2026-07-13 패턴화): 호스트게이트는 _shared/supa.ts 의
// requireHostRoom 단일 지점에서만 나온다(응답 계약 404→409→403·ended 검증 통일). Edge 함수에
// 인라인 복사가 부활하면 red 로 막는다.
//
// 감지 시그니처(문자열 무관 — "Not host"·"Host only"·"호스트만" 모두 잡음):
//   직접 rooms 게이트 = `from("rooms")` 직접 조회 + `host_id !==` 인라인 JS 비교.
//   조인 경유(rooms(host_id) — dub/recording 세션에서 파생)·필터(.eq("host_id", ...))·멤버십
//   게이트는 이 시그니처에 안 걸린다(정당). 걸리는데 정당한 변형만 사유와 함께 ALLOW.
const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions')

const ALLOW = new Set([
  // 조건부 호스트게이트: 리허설/연습 모드(is_practice·script_mode)면 활성 참가자도 진행 허용 —
  // 순수 호스트게이트 아니라 통째 치환 불가. 자체 404→409(ended)→403 체인 보유.
  'advance-script-cue',
  // (send-chat 은 SEC-KICK-1 에서 requireActiveParticipant 공유헬퍼로 이관 — from("rooms") 인라인 제거로
  //  더는 시그니처에 안 걸림. host_id 는 슬로우모드 면제 판정용으로만 남음(게이트 아님) → ALLOW 불필요.)
  // 호스트체크가 action==='assign' 조건부(claim/release 는 참가자 권한) — 체인 통째 치환 불가.
  'sync-script-role',
])

// 직접 rooms 호스트게이트 시그니처: rooms 직접 조회 + host_id 인라인 비교.
function isInlineRoomsHostGate(src: string): boolean {
  return src.includes('from("rooms")') && /host_id\s*!==/.test(src)
}

describe('edge host-guard hygiene', () => {
  it('requireHostRoom 헬퍼가 _shared/supa.ts 에 존재한다', () => {
    const supa = readFileSync(join(FUNCTIONS_DIR, '_shared', 'supa.ts'), 'utf8')
    expect(supa).toContain('export async function requireHostRoom')
    expect(supa).toContain('"Not host"')
  })

  it('인라인 호스트게이트 복사가 없다 (requireHostRoom 또는 ALLOW 등재만 허용)', () => {
    const offenders: string[] = []
    for (const entry of readdirSync(FUNCTIONS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '_shared') continue
      const indexPath = join(FUNCTIONS_DIR, entry.name, 'index.ts')
      if (!existsSync(indexPath)) continue
      const src = readFileSync(indexPath, 'utf8')
      if (src.includes('requireHostRoom')) continue // 헬퍼 사용 = 정본
      if (isInlineRoomsHostGate(src) && !ALLOW.has(entry.name)) offenders.push(entry.name)
    }
    expect(
      offenders,
      `인라인 호스트게이트 발견 — requireHostRoom 으로 치환하거나 정당 변형이면 ALLOW 등재: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  // ALLOW 등재가 실제로 시그니처에 걸리는 함수인지 확인(stale ALLOW 방지 — 이관됐는데 남으면 red).
  it('ALLOW 항목은 실제 인라인 게이트 시그니처를 가진다 (stale 방지)', () => {
    const stale: string[] = []
    for (const name of ALLOW) {
      const indexPath = join(FUNCTIONS_DIR, name, 'index.ts')
      if (!existsSync(indexPath)) { stale.push(`${name}(missing)`); continue }
      const src = readFileSync(indexPath, 'utf8')
      if (src.includes('requireHostRoom') || !isInlineRoomsHostGate(src)) stale.push(name)
    }
    expect(stale, `ALLOW 에 불필요 항목(이관됐거나 시그니처 없음) — 제거: ${stale.join(', ')}`).toEqual([])
  })
})
