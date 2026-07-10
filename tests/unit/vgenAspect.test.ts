import { beforeEach, describe, expect, it, vi } from 'vitest'

// VGEN-11: aspectRatio 가 store→lib(triggerVgen)로 관통하는지 — Edge 계약(aspect_ratio)은 기존재 실측.
const { triggerVgenMock } = vi.hoisted(() => ({
  triggerVgenMock: vi.fn(async () => ({ job_id: 'j1', status: 'pending', credit_cost: 5 })),
}))
vi.mock('@/lib/vgen', () => ({
  triggerVgen: triggerVgenMock,
  subscribeToVgenJob: vi.fn(() => () => {}),
  fetchRecentJobs: vi.fn(async () => []),
}))
vi.mock('@/stores/userStore', () => ({
  useUserStore: { getState: () => ({ session: { access_token: 'tok' } }) },
}))

import { useVgenStore } from '@/stores/vgenStore'

describe('vgenStore.generate aspectRatio 관통 (VGEN-11)', () => {
  beforeEach(() => {
    triggerVgenMock.mockClear()
    useVgenStore.setState({ isGenerating: false, error: null })
  })

  it('aspectRatio 를 triggerVgen opts 로 전달한다', async () => {
    await useVgenStore.getState().generate('room1', 'p', 5, '720p', undefined, '16:9')
    expect(triggerVgenMock).toHaveBeenCalledWith('tok', 'room1', 'p', 5, '720p', { imageUrls: undefined, aspectRatio: '16:9' })
  })

  it('미지정이면 aspectRatio 를 보내지 않는다(Edge 기본 9:16)', async () => {
    await useVgenStore.getState().generate('room1', 'p', 5, '720p')
    expect(triggerVgenMock).toHaveBeenCalledWith('tok', 'room1', 'p', 5, '720p', { imageUrls: undefined, aspectRatio: undefined })
  })
})
