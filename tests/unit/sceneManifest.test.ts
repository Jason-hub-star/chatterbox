import { describe, expect, it } from 'vitest'
import { pickTimeVariant, resolveScene, SCENES, type Scene } from '@/scenes/manifest'

// 시간축 variant 의 그라운드 트루스: 경계(06/18)·폴백(밤 에셋 미등재 시 morning)·등재 시 선택.
describe('scenes/manifest (시간축 variant)', () => {
  it('06~17시는 morning, 18~05시는 night', () => {
    expect(pickTimeVariant(6)).toBe('morning')
    expect(pickTimeVariant(17)).toBe('morning')
    expect(pickTimeVariant(18)).toBe('night')
    expect(pickTimeVariant(5)).toBe('night')
    expect(pickTimeVariant(0)).toBe('night')
  })

  it('밤 variant 미등재면 morning 으로 폴백한다(점진 등재 — 앱 무중단)', () => {
    const morningOnly = resolveScene(SCENES.loginSplash, 23)
    expect(morningOnly?.hero).toBe('/scenes/login-splash/splash.webp')
  })

  it('night 등재 시 밤 시간대는 night 를 선택한다', () => {
    const scene: Scene = {
      variants: {
        morning: { hero: '/m.webp', accent: '#fff' },
        night: { hero: '/n.webp', accent: '#88f' },
      },
    }
    expect(resolveScene(scene, 23)?.hero).toBe('/n.webp')
    expect(resolveScene(scene, 9)?.hero).toBe('/m.webp')
  })

  it('variant 전무면 null(소비자가 배경 생략 — 로비 lobbyStreet 현재 상태)', () => {
    expect(resolveScene(SCENES.lobbyStreet, 9)).toBeNull()
  })
})
