import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { useFriendStore } from '@/stores/friendStore'
import { useRealtimeRow } from '@/hooks/useRealtimeRow'
import { listRecentPeople, type RecentPerson } from '@/lib/rooms'
import { removeFriend, respondFriendRequest, sendFriendRequest, setFollow } from '@/lib/friends'
import { toast } from '@/hooks/useToast'
import i18n from '@/i18n'

// FriendsButton + FriendsPanel — 로비 상시 친구 관리(LoL식, IA 결정: 찻집 아님 · [[friend-system-lobby-lol]]).
// 온라인/오프라인·활동(광장/공연 중)·요청 수신함·친구 추가(최근 함께한 사람 재사용).
// 실시간: friendships 당사자 행 postgres_changes ×2(user_id·friend_id) → 신뢰 소스(list-friends) 재조회.
export default function FriendsButton() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const token = useUserStore((s) => s.session?.access_token)
  const appUserId = useUserStore((s) => s.appUserId)
  const friends = useFriendStore((s) => s.friends)
  const following = useFriendStore((s) => s.following)
  const pendingIn = useFriendStore((s) => s.pendingIn)
  const pendingOut = useFriendStore((s) => s.pendingOut)
  const onlinePresence = useFriendStore((s) => s.onlinePresence)
  const load = useFriendStore((s) => s.load)
  const [open, setOpen] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [recent, setRecent] = useState<RecentPerson[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const reload = () => {
    if (token) void load(token)
  }

  // UX-SOC-2: 실패 사유 분기. edgeFn(`edgeFn.ts:38-39`)이 모든 호출에 err.status 를 동봉하는데
  //   이 패널만 전부 제네릭 "처리 실패" 로 뭉개고 있었다 — 429(레이트리밋)를 "실패" 로 보여주면
  //   사용자는 원인을 모른 채 재시도만 반복해 카운터를 더 태운다.
  const failToast = (e: unknown, fallbackKey: string) => {
    const status = (e as { status?: number } | null)?.status
    toast.error(i18n.t(status === 429 ? 'friends.tooMany' : fallbackKey))
  }
  useEffect(() => {
    if (token) void load(token)
  }, [token, load])
  useRealtimeRow('friendships', 'user_id', appUserId, reload)
  useRealtimeRow('friendships', 'friend_id', appUserId, reload)
  // UX-SOC-3: 팝오버 닫기 관용구(Esc·바깥클릭). 소셜 모달 4종 중 3종은 공용 Modal(focus trap·Esc)을 쓰는데
  //   이 패널만 직접 만든 팝오버라 닫는 길이 ✕ 하나뿐이었다. ref 는 토글 버튼까지 감싸는 바깥 div 에 —
  //   버튼에 걸면 mousedown 이 먼저 닫고 click 이 다시 열어 토글이 죽는다.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])
  // presence 폴링(DP-1): 전역 채널 대신 패널 열린 동안만 주기 재조회 → 친구 online/activity 갱신.
  useEffect(() => {
    if (!open || !token) return
    const id = setInterval(() => void load(token), 15_000)
    return () => clearInterval(id)
  }, [open, token, load])

  const online = friends.filter((f) => onlinePresence[f.user_id])
  const offline = friends.filter((f) => !onlinePresence[f.user_id])

  const openAdd = async () => {
    setShowAdd((v) => !v)
    if (!recent && token) {
      try {
        const { people } = await listRecentPeople(token)
        setRecent(people)
      } catch {
        setRecent([])
      }
    }
  }

  const request = async (targetUserId: string) => {
    if (!token) return
    setBusy(targetUserId)
    try {
      await sendFriendRequest(token, targetUserId)
      toast.success(i18n.t('friends.requestSent'))
      reload()
    } catch (e) {
      // 409 = 상대가 먼저 보낸 요청이 수신함에 있음(send-friend-request 의 incoming_exists) — 안내가 곧 해법.
      if ((e as { status?: number } | null)?.status === 409) toast.error(i18n.t('friends.incomingExists'))
      else failToast(e, 'friends.requestFailed')
      reload()
    } finally {
      setBusy(null)
    }
  }

  const respond = async (friendshipId: string, action: 'accept' | 'reject') => {
    if (!token) return
    setBusy(friendshipId)
    try {
      await respondFriendRequest(token, friendshipId, action)
      // 결과 토스트가 곧 스크린리더 안내(ToastHost 가 role=alert/status) — 무음 성공을 없앤다.
      toast.success(i18n.t(action === 'accept' ? 'friends.accepted' : 'friends.rejected'))
      reload()
    } catch (e) {
      // 409 = 이미 처리된 요청(다른 탭·상대 취소). 패널이 낡았을 뿐이므로 재조회가 곧 복구다.
      if ((e as { status?: number } | null)?.status === 409) {
        toast.error(i18n.t('friends.alreadyHandled'))
        reload()
      } else failToast(e, 'friends.actionFailed')
    } finally {
      setBusy(null)
    }
  }

  // 친구 삭제 + 보낸 요청 취소 공용 — remove-friend 는 status 를 안 보고 양방향 행을 soft delete 하므로
  //   pending(내 발신) 행도 같은 호출로 취소된다(전용 함수 불요). 문구만 호출부가 고른다.
  const remove = async (targetUserId: string, doneKey = 'friends.removed') => {
    if (!token) return
    setBusy(targetUserId)
    try {
      await removeFriend(token, targetUserId)
      toast.success(i18n.t(doneKey))
      reload()
    } catch (e) {
      failToast(e, 'friends.actionFailed')
    } finally {
      setBusy(null)
    }
  }

  // 팔로우 토글(PROFILE-04/05) — 팔로우한 사람이 공연을 열면 알림(followed_creator_stream_start).
  const followingIds = new Set(following.map((f) => f.user_id))
  const toggleFollow = async (targetUserId: string) => {
    if (!token) return
    setBusy(targetUserId)
    try {
      const next = !followingIds.has(targetUserId)
      await setFollow(token, targetUserId, next)
      toast.success(i18n.t(next ? 'friends.followDone' : 'friends.unfollowDone'))
      reload()
    } catch (e) {
      failToast(e, 'friends.actionFailed')
    } finally {
      setBusy(null)
    }
  }

  // 이미 관계가 있는 사람은 추가 목록에서 제외.
  const knownIds = new Set<string>([
    ...friends.map((f) => f.user_id),
    ...pendingIn.map((p) => p.user_id),
    ...pendingOut.map((p) => p.user_id),
  ])
  const addable = (recent ?? []).filter((p) => !knownIds.has(p.user_id))

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-stage-border bg-stage-base/70 px-3 py-1.5 text-sm text-stage-text-muted backdrop-blur hover:text-stage-text"
      >
        <span aria-hidden>👥</span>
        {t('friends.button')}
        {online.length > 0 && (
          <span className="rounded-full bg-spring-green/20 px-1.5 text-[11px] font-semibold text-spring-green">{online.length}</span>
        )}
        {pendingIn.length > 0 && (
          <span className="rounded-full bg-fire-amber/20 px-1.5 text-[11px] font-semibold text-fire-amber">{pendingIn.length}</span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label={t('friends.title')}
          className="absolute right-0 top-full z-40 mt-2 w-72 rounded-lg border border-stage-border bg-stage-panel/95 p-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-stage-text">👥 {t('friends.title')}</h3>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('common.close')}
              className="touch-target rounded px-1.5 text-xs text-stage-text-muted hover:text-stage-text">✕</button>
          </div>

          {pendingIn.length > 0 && (
            <section className="mt-2">
              <h4 className="text-[11px] font-semibold text-fire-amber">{t('friends.requests')}</h4>
              <ul className="mt-1 space-y-1">
                {pendingIn.map((p) => (
                  <li key={p.friendship_id} className="flex items-center gap-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{p.display_name ?? p.user_id.slice(0, 8)}</span>
                    <button type="button" disabled={busy === p.friendship_id} onClick={() => void respond(p.friendship_id, 'accept')}
                      className="touch-target rounded bg-fire-amber px-2 py-0.5 text-[11px] font-semibold text-stage-base disabled:opacity-40">
                      {busy === p.friendship_id ? t('friends.processing') : t('friends.accept')}
                    </button>
                    <button type="button" disabled={busy === p.friendship_id} onClick={() => void respond(p.friendship_id, 'reject')}
                      className="touch-target rounded border border-stage-border px-2 py-0.5 text-[11px] text-stage-text-muted disabled:opacity-40">
                      {t('friends.reject')}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* UX-SOC-4: 보낸 요청 — 지금까지 pendingOut 은 knownIds 계산에만 쓰이고 렌더가 0이었다.
              요청을 보낸 뒤 대기중인지 확인할 방법도, 취소할 방법도 없었다(백엔드는 둘 다 지원). */}
          {pendingOut.length > 0 && (
            <section className="mt-2">
              <h4 className="text-[11px] font-semibold text-stage-text-muted">{t('friends.sent')}</h4>
              <ul className="mt-1 space-y-1">
                {pendingOut.map((p) => (
                  <li key={p.user_id} className="flex items-center gap-1.5 text-sm opacity-70">
                    <span className="min-w-0 flex-1 truncate">{p.display_name ?? p.user_id.slice(0, 8)}</span>
                    <span className="text-[11px] text-stage-text-muted">{t('friends.pending')}</span>
                    <button type="button" disabled={busy === p.user_id} onClick={() => void remove(p.user_id, 'friends.requestCanceled')}
                      className="touch-target rounded border border-stage-border px-2 py-0.5 text-[11px] text-stage-text-muted hover:text-fire-hot disabled:opacity-40">
                      {t('friends.cancelRequest')}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-2">
            {friends.length === 0 ? (
              <p className="text-[11px] text-stage-text-muted">{t('friends.empty')}</p>
            ) : (
              // UX-SOC-1: ✕(친구 삭제·언팔로우)를 상시 노출로. `hidden … group-hover:block` 은 display:none 이라
              //   키보드 포커스 자체가 불가능했고(탭으로 도달 0), 터치에는 hover 가 없어 대체 경로도 없었다.
              //   opacity 로 숨기는 대신 그냥 보이게 한다 — 영리한 hover 노출보다 따분한 상시 노출이 맞다.
              <ul className="space-y-1">
                {online.map((f) => (
                  <li key={f.user_id} className="flex items-center gap-1.5 text-sm">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-spring-green" />
                    <span className="min-w-0 flex-1 truncate text-stage-text">{f.display_name ?? f.user_id.slice(0, 8)}</span>
                    <span className="text-[11px] text-stage-text-muted">
                      {onlinePresence[f.user_id] === 'room' ? t('friends.inRoom') : t('friends.inLobby')}
                    </span>
                    <button type="button" disabled={busy === f.user_id} onClick={() => void remove(f.user_id)} aria-label={t('friends.remove')}
                      className="touch-target rounded px-1.5 text-[11px] text-stage-text-muted hover:text-fire-hot disabled:opacity-40">✕</button>
                  </li>
                ))}
                {offline.map((f) => (
                  <li key={f.user_id} className="flex items-center gap-1.5 text-sm opacity-60">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-stage-border" />
                    <span className="min-w-0 flex-1 truncate">{f.display_name ?? f.user_id.slice(0, 8)}</span>
                    <span className="text-[11px] text-stage-text-muted">{t('friends.offline')}</span>
                    <button type="button" disabled={busy === f.user_id} onClick={() => void remove(f.user_id)} aria-label={t('friends.remove')}
                      className="touch-target rounded px-1.5 text-[11px] text-stage-text-muted hover:text-fire-hot disabled:opacity-40">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {following.length > 0 && (
            <section className="mt-2">
              <h4 className="text-[11px] font-semibold text-stage-text-muted">{t('friends.following')}</h4>
              <ul className="mt-1 space-y-1">
                {following.map((f) => (
                  <li key={f.user_id} className="flex items-center gap-1.5 text-sm">
                    <span aria-hidden className="shrink-0 text-[11px]">🔔</span>
                    <span className="min-w-0 flex-1 truncate">{f.display_name ?? f.user_id.slice(0, 8)}</span>
                    <button type="button" disabled={busy === f.user_id} onClick={() => void toggleFollow(f.user_id)} aria-label={t('friends.unfollow')}
                      className="touch-target rounded px-1.5 text-[11px] text-stage-text-muted hover:text-fire-hot disabled:opacity-40">✕</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-3 border-t border-stage-border pt-2">
            <button type="button" onClick={() => void openAdd()} aria-expanded={showAdd}
              className="text-[11px] font-semibold text-stage-text-muted hover:text-stage-text">
              ＋ {t('friends.add')}
            </button>
            {showAdd && (
              <div className="mt-1">
                <p className="text-[10px] text-stage-text-muted">{t('friends.addFromRecent')}</p>
                {recent === null ? null : addable.length === 0 ? (
                  // UX-1(델타 감사): 최근 사람 0명 신규유저 고립 — 데드엔드 대신 대극장 참여 안내.
                  <div className="mt-1">
                    <p className="text-[11px] text-stage-text-muted">{t('friends.noRecentHint')}</p>
                    <button type="button" onClick={() => { setOpen(false); navigate('/lobby/theater') }}
                      className="mt-1 rounded bg-fire-amber px-2 py-0.5 text-[11px] font-semibold text-stage-base">
                      {t('friends.goTheater')}
                    </button>
                  </div>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {addable.map((p) => (
                      <li key={p.user_id} className="flex items-center gap-1.5 text-sm">
                        <span className="min-w-0 flex-1 truncate">{p.display_name ?? p.user_id.slice(0, 8)}</span>
                        <button type="button" disabled={busy === p.user_id} onClick={() => void request(p.user_id)}
                          className="touch-target rounded border border-stage-border px-2 py-0.5 text-[11px] text-stage-text-muted hover:text-stage-text disabled:opacity-40">
                          {t('friends.request')}
                        </button>
                        <button type="button" disabled={busy === p.user_id} onClick={() => void toggleFollow(p.user_id)}
                          className={`touch-target rounded px-2 py-0.5 text-[11px] disabled:opacity-40 ${followingIds.has(p.user_id) ? 'bg-fire-amber/20 text-fire-amber' : 'border border-stage-border text-stage-text-muted hover:text-stage-text'}`}>
                          {followingIds.has(p.user_id) ? t('friends.followingBadge') : t('friends.follow')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
