import { beforeEach, describe, expect, it, vi } from 'vitest'

// configStore 는 모듈 로드 시 @/lib/supabase 를 import 한다. 테스트는 네트워크·env 에 의존하지 않도록 목킹한다.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { useConfigStore } from '@/stores/configStore'

describe('configStore.getFlag', () => {
  beforeEach(() => {
    // 각 테스트 전 기본값으로 초기화 (다른 테스트의 setState 격리).
    useConfigStore.setState({
      config: {
        VGEN_ENABLED: false,
        DUB_ENABLED: false,
        DUB_YOUTUBE_ENABLED: false,
        ROOM_MAX_USERS: 6,
        VGEN_DAILY_LIMIT: 3,
        VGEN_MAX_SEC: 10,
        LIVEKIT_ENABLED: true,
        MAINTENANCE_MODE: false,
        NEW_ONBOARDING: false,
        VGEN_REFUND_MODERATION: false,
        VGEN_REFUND_USER_CANCEL: false,
        DUB_REFUND_USER_CANCEL: false,
      },
      ready: false,
    })
  })

  it('기본값을 반환한다', () => {
    const { getFlag } = useConfigStore.getState()
    expect(getFlag('ROOM_MAX_USERS')).toBe(6)
    expect(getFlag('MAINTENANCE_MODE')).toBe(false)
    expect(getFlag('LIVEKIT_ENABLED')).toBe(true)
  })

  it('로드된 값으로 덮어쓴다', () => {
    useConfigStore.setState((s) => ({ config: { ...s.config, MAINTENANCE_MODE: true } }))
    expect(useConfigStore.getState().getFlag('MAINTENANCE_MODE')).toBe(true)
  })
})
