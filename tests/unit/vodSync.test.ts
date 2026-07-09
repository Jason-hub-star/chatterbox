import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyVodSync,
  publishVodSync,
  readVodSyncState,
  setVodSyncApplier,
  setVodSyncPublisher,
  setVodSyncReader,
  vodNeedsSeek,
  vodTargetMs,
} from '@/features/stage/vodSync'

// ROOM-01 타임라인 동기(±200ms AC): 목표 위치 계산·시크 경계·버스 no-op 안전성.
describe('vodTargetMs', () => {
  it('재생 중이면 발신 후 경과분을 더한다', () => {
    expect(vodTargetMs({ positionMs: 1000, playing: true, atMs: 5000 }, 5300)).toBe(1300)
  })
  it('일시정지면 위치 그대로', () => {
    expect(vodTargetMs({ positionMs: 1000, playing: false, atMs: 5000 }, 9000)).toBe(1000)
  })
  it('수신자 시계가 발신보다 뒤(음수 경과)면 0 클램프', () => {
    expect(vodTargetMs({ positionMs: 1000, playing: true, atMs: 5000 }, 4000)).toBe(1000)
  })
})

describe('vodNeedsSeek (±200ms 경계)', () => {
  it('딱 200ms 는 허용, 초과만 시크', () => {
    expect(vodNeedsSeek(1000, 1200)).toBe(false)
    expect(vodNeedsSeek(1000, 1201)).toBe(true)
    expect(vodNeedsSeek(1201, 1000)).toBe(true)
  })
})

describe('vodSync 버스', () => {
  afterEach(() => {
    setVodSyncPublisher(null)
    setVodSyncReader(null)
    setVodSyncApplier(null)
  })

  it('미등록 시 전부 no-op / 등록 시 위임', () => {
    expect(() => publishVodSync({ positionMs: 0, playing: false, atMs: 0 })).not.toThrow()
    expect(readVodSyncState()).toBeNull()
    expect(() => applyVodSync({ positionMs: 0, playing: false, atMs: 0 })).not.toThrow()

    const pub = vi.fn()
    const app = vi.fn()
    setVodSyncPublisher(pub)
    setVodSyncReader(() => ({ positionMs: 7, playing: true, atMs: 1 }))
    setVodSyncApplier(app)
    publishVodSync({ positionMs: 1, playing: true, atMs: 2 })
    expect(pub).toHaveBeenCalledWith({ positionMs: 1, playing: true, atMs: 2 })
    expect(readVodSyncState()).toEqual({ positionMs: 7, playing: true, atMs: 1 })
    applyVodSync({ positionMs: 3, playing: false, atMs: 4 })
    expect(app).toHaveBeenCalledWith({ positionMs: 3, playing: false, atMs: 4 })
  })
})
