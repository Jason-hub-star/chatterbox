import { describe, it, expect } from 'vitest'
import { pickFreshCompleted, classifyAvatarError } from '@/lib/avatarJobs'

// X1(AVATAR-DONE-NOTIFY): 재진입 시 "자리 비운 사이 완성" 감지 순수 판정.
describe('pickFreshCompleted', () => {
  it('firstRun 은 통지 없이 전량 시딩만(첫 방문 스팸 방지)', () => {
    const r = pickFreshCompleted(['a', 'b'], new Set(), true)
    expect(r.fresh).toEqual([])
    expect(r.seed).toEqual(['a', 'b'])
  })

  it('재방문에 미통지 done 이 있으면 그것만 fresh + seed', () => {
    const r = pickFreshCompleted(['a', 'b', 'c'], new Set(['a']), false)
    expect(r.fresh).toEqual(['b', 'c'])
    expect(r.seed).toEqual(['b', 'c'])
  })

  it('재방문인데 done 이 전부 통지됨이면 fresh 없음(재진입 무통지)', () => {
    const r = pickFreshCompleted(['a', 'b'], new Set(['a', 'b']), false)
    expect(r.fresh).toEqual([])
    expect(r.seed).toEqual([])
  })

  it('done 이 없으면 언제나 빈 결과', () => {
    expect(pickFreshCompleted([], new Set(['x']), false)).toEqual({ fresh: [], seed: [] })
    expect(pickFreshCompleted([], new Set(), true)).toEqual({ fresh: [], seed: [] })
  })
})

// X4(COMMISSION-FAIL-REASON): 실패 원인 타입별 로컬라이즈 키 분류.
describe('classifyAvatarError', () => {
  it('엣지 크레딧 코드 → failCredit', () => {
    expect(classifyAvatarError('credit_insufficient')).toBe('atelier.failCredit')
    expect(classifyAvatarError('credit_error')).toBe('atelier.failCredit')
  })
  it('일시적(엣지 signed_url·타임아웃·5xx·network) → failTransient(같은 그림 재시도 OK)', () => {
    expect(classifyAvatarError('signed_url')).toBe('atelier.failTransient')
    expect(classifyAvatarError('Request timed out after 300s')).toBe('atelier.failTransient')
    expect(classifyAvatarError('upstream 503')).toBe('atelier.failTransient')
  })
  it('이미지/얼굴 문제 → failImage(다른 그림 필요)', () => {
    expect(classifyAvatarError('No face detected in the image')).toBe('atelier.failImage')
    expect(classifyAvatarError('얼굴을 찾지 못했습니다')).toBe('atelier.failImage')
    expect(classifyAvatarError('failed to decode PNG')).toBe('atelier.failImage')
  })
  it('미매치·null → 일반 안내(원문 미노출)', () => {
    expect(classifyAvatarError(null)).toBe('atelier.commissionFailedHint')
    expect(classifyAvatarError('')).toBe('atelier.commissionFailedHint')
    expect(classifyAvatarError('Traceback (most recent call last): KeyError')).toBe('atelier.commissionFailedHint')
  })
})
