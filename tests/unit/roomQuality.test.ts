import { describe, expect, it } from 'vitest'
import { netTier } from '@/lib/roomQuality'

// ROOM-10·25 우상단 인디케이터 등급: 연결상태 우선 → CONNECTED 면 품질 enum 3단계.
describe('netTier (네트워크 인디케이터 등급)', () => {
  it('연결 전/재연결/실패는 품질과 무관하게 상태가 우선', () => {
    expect(netTier('CONNECTING', 'excellent')).toBe('connecting')
    expect(netTier('RECONNECTING', 'good')).toBe('reconnecting')
    expect(netTier('DISCONNECTED', 'good')).toBe('offline')
    expect(netTier('FAILED', 'excellent')).toBe('offline')
  })
  it('CONNECTED 면 품질 enum 을 3단계로 낮춤', () => {
    expect(netTier('CONNECTED', 'excellent')).toBe('good')
    expect(netTier('CONNECTED', 'good')).toBe('good')
    expect(netTier('CONNECTED', 'poor')).toBe('fair')
    expect(netTier('CONNECTED', 'lost')).toBe('poor')
  })
  it('CONNECTED 인데 품질 미측정/unknown 이면 unknown', () => {
    expect(netTier('CONNECTED', undefined)).toBe('unknown')
    expect(netTier('CONNECTED', 'unknown')).toBe('unknown')
  })
})
