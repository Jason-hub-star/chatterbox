import { describe, expect, it } from 'vitest'
import { applyRoleEvent, isRoleEvent, pruneRoleMap, roleOf, type RoleMap } from '@/features/script/roleMap'

const A = { authId: 'aaaa', name: '하루A' }
const B = { authId: 'bbbb', name: null }

describe('roleMap (ROOM-14)', () => {
  it('set: 역할을 클레임한다', () => {
    const next = applyRoleEvent({}, { kind: 'set', role: '하루', authId: A.authId, name: A.name })
    expect(next['하루']).toEqual(A)
  })

  it('set: 같은 사람의 기존 클레임을 새 역할로 옮긴다(1인 1역)', () => {
    const map: RoleMap = { 하루: A, 유이: B }
    const next = applyRoleEvent(map, { kind: 'set', role: '유이', authId: A.authId, name: A.name })
    expect(next['하루']).toBeUndefined() // A의 옛 역할 해제
    expect(next['유이']).toEqual(A) // LWW — B의 클레임을 덮음
  })

  it('clear: 해당 역할만 비우고, 없는 역할이면 참조 보존', () => {
    const map: RoleMap = { 하루: A }
    expect(applyRoleEvent(map, { kind: 'clear', role: '하루' })['하루']).toBeUndefined()
    expect(applyRoleEvent(map, { kind: 'clear', role: '유이' })).toBe(map)
  })

  it('pruneRoleMap: 퇴장자 클레임 제거 + 무변화 시 참조 보존', () => {
    const map: RoleMap = { 하루: A, 유이: B }
    expect(pruneRoleMap(map, new Set([A.authId]))).toEqual({ 하루: A })
    expect(pruneRoleMap(map, new Set([A.authId, B.authId]))).toBe(map)
  })

  it('roleOf: 내 클레임 역할을 찾는다', () => {
    const map: RoleMap = { 하루: A }
    expect(roleOf(map, A.authId)).toBe('하루')
    expect(roleOf(map, 'zzzz')).toBeNull()
  })

  it('isRoleEvent: 형태 방어(변조 페이로드 드롭)', () => {
    expect(isRoleEvent({ kind: 'set', role: '하루', authId: 'a', name: null })).toBe(true)
    expect(isRoleEvent({ kind: 'clear', role: '하루' })).toBe(true)
    expect(isRoleEvent({ kind: 'set', role: '하루' })).toBe(false) // authId 누락
    expect(isRoleEvent({ kind: 'clear', role: '' })).toBe(false)
    expect(isRoleEvent({ kind: 'clear', role: 'x'.repeat(51) })).toBe(false)
    expect(isRoleEvent(null)).toBe(false)
  })
})
