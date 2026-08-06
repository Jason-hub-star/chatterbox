import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import '@/i18n'
import FriendsButton from '@/components/shared/FriendsButton'
import { useFriendStore } from '@/stores/friendStore'
import { useUserStore } from '@/stores/userStore'
import { removeFriend } from '@/lib/friends'

// A-P1j(소셜 감사 UX 배치): 친구 패널의 접근성·상태 노출 회귀 잠금.
//  - ✕(친구 삭제·언팔로우)가 display:none(`hidden … group-hover:block`) 이라 키보드 도달 0 이던 결함
//  - pendingOut(보낸 요청) 렌더 0 — 대기 표시도 취소 경로도 없던 결함
//  - 팝오버 닫는 길이 ✕ 하나뿐(Esc·바깥클릭 없음)
// 언어 독립 선택자(구조·aria)로 질의 — i18n 문구에 의존하지 않는다.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// 패널은 마운트 즉시 load(token) 로 목록을 재조회한다 → 스토어 직접 주입은 덮어써진다.
// 신뢰 소스인 list-friends 응답 자체를 고정해야 실제 데이터 흐름 그대로 렌더된다.
const LISTS = vi.hoisted(() => ({
  friends: [{ user_id: 'f1', display_name: '온라인친구', online: true, activity: 'lobby' as const }],
  following: [{ user_id: 'g1', display_name: '팔로우중' }],
  pending_in: [],
  pending_out: [{ user_id: 'p1', display_name: '보낸요청' }],
}))

vi.mock('@/hooks/useRealtimeRow', () => ({ useRealtimeRow: () => {} }))
vi.mock('@/lib/friends', () => ({
  listFriends: vi.fn(async () => LISTS),
  removeFriend: vi.fn(async () => ({ ok: true })),
  respondFriendRequest: vi.fn(async () => ({ ok: true, status: 'accepted' })),
  sendFriendRequest: vi.fn(async () => ({ ok: true, status: 'pending' })),
  setFollow: vi.fn(async () => ({ ok: true, following: true })),
}))
vi.mock('@/lib/rooms', () => ({ listRecentPeople: vi.fn(async () => ({ people: [] })) }))

let container: HTMLElement
let root: Root | null = null

const panel = () => container.querySelector('[role="dialog"]')
const toggle = () => container.querySelector<HTMLButtonElement>('[aria-expanded]')!

beforeEach(async () => {
  useUserStore.setState({ session: { access_token: 'tok' }, appUserId: 'me' } as never)
  useFriendStore.getState().reset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<MemoryRouter><FriendsButton /></MemoryRouter>)
  })
  act(() => toggle().dispatchEvent(new MouseEvent('click', { bubbles: true })))
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
  vi.clearAllMocks()
})

describe('FriendsButton 패널', () => {
  it('✕(삭제·언팔로우)가 display:none 이 아니라 탭 도달 가능', () => {
    // 회귀 방지의 핵심: hidden/group-hover 로 숨기면 키보드·터치 경로가 동시에 사라진다.
    const xs = [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] li button')]
      .filter((b) => b.textContent === '✕')
    expect(xs.length).toBe(2) // 친구 1 + 팔로잉 1
    for (const b of xs) {
      expect(b.className).not.toMatch(/\bhidden\b/)
      expect(b.className).not.toMatch(/group-hover/)
      expect(b.className).toMatch(/touch-target/) // coarse 포인터 44px
      expect(b.disabled).toBe(false)
    }
  })

  it('보낸 요청(pendingOut)이 렌더되고 취소가 remove-friend 를 호출', async () => {
    const sent = container.querySelector<HTMLButtonElement>('li button:not([aria-label])')!
    expect(sent).toBeTruthy()
    await act(async () => {
      sent.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // remove-friend 는 status 를 안 보고 양방향 행을 soft delete → pending 행도 같은 호출로 취소된다.
    expect(vi.mocked(removeFriend)).toHaveBeenCalledWith('tok', 'p1')
  })

  it('Esc 로 닫힌다', () => {
    expect(panel()).toBeTruthy()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(panel()).toBeNull()
  })

  it('바깥 클릭으로 닫히고, 토글 버튼 클릭은 닫지 않는다', () => {
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(panel()).toBeNull()
    // 토글은 여전히 열 수 있어야 한다(ref 를 버튼에 걸면 mousedown 이 닫고 click 이 열어 토글이 죽는다).
    act(() => {
      toggle().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      toggle().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(panel()).toBeTruthy()
  })
})
