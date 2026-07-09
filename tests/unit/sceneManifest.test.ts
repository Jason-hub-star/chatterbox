import { describe, expect, it } from 'vitest'
import { resolveWorld, WORLDS, DEFAULT_WORLD } from '@/scenes/manifest'

// 월드 시스템 그라운드 트루스: 기본 월드 완결성·미지 id 폴백·표면별 폴백(불완전 월드).
describe('scenes/manifest (월드 시스템)', () => {
  it('western(기본) 월드는 모든 표면을 조립한다', () => {
    const w = resolveWorld('western')
    expect(w.id).toBe('western')
    expect(w.loginSplash.hero).toContain('login-splash/splash')
    expect(w.loginSplash.video).toContain('enter.webm')
    expect(w.plaza.blocks[0].hero).toContain('plaza-1')
    expect(w.plaza.blocks[0].shops).toHaveLength(7)
    expect(w.interiors.rooms?.hero).toContain('theater')
    expect(w.interiors.rooms?.anchors.ticketBooth).toBeDefined()
  })

  it('미지의 월드 id 는 DEFAULT 로 폴백한다(stale localStorage·?world=garbage 방어)', () => {
    expect(resolveWorld('nope-nonexistent').id).toBe(WORLDS[DEFAULT_WORLD].id)
  })

  it('eastern 은 자체 로그인 스플래시를 쓰고 광장·내부는 서양으로 표면별 폴백한다', () => {
    const e = resolveWorld('eastern')
    expect(e.id).toBe('eastern')
    expect(e.loginSplash.hero).toContain('login-splash/eastern')
    expect(e.loginSplash.video).toBeUndefined() // 밤 인트로 defer
    expect(e.accent).toBe('#F2A65A')
    expect(e.plaza.blocks[0].hero).toContain('plaza-1') // 서양 광장 폴백(아트 미완)
    expect(e.interiors.social?.hero).toContain('teahouse') // 서양 내부 폴백
  })

  it('모든 월드는 갤러리 렌더용 label·thumb·category 를 갖는다', () => {
    for (const w of Object.values(WORLDS)) {
      expect(w.label).toMatch(/^world\./)
      expect(w.assets.thumb).toContain('/thumbs/')
      expect(w.category).toBeTruthy()
    }
  })
})
