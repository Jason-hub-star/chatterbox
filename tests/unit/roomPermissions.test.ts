import { describe, expect, it } from 'vitest'
import { roomPermissions } from '@/lib/roomPermissions'

// A-SEAM-4 뷰어 권한 게이트의 그라운드 트루스: 발행권은 배우만(서버 livekit-token 규칙과 동일).
describe('roomPermissions (뷰어/배우 게이트)', () => {
  it('배우는 발행 가능(마이크·표정)', () => {
    expect(roomPermissions('actor').canPublish).toBe(true)
  })
  it('뷰어는 발행 불가(서버 canPublish=false 미러)', () => {
    expect(roomPermissions('viewer').canPublish).toBe(false)
  })
})
