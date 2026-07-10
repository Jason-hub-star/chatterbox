import { useEffect, useState } from 'react'
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

  const reload = () => {
    if (token) void load(token)
  }
  useEffect(() => {
    if (token) void load(token)
  }, [token, load])
  useRealtimeRow('friendships', 'user_id', appUserId, reload)
  useRealtimeRow('friendships', 'friend_id', appUserId, reload)
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
      const msg = e instanceof Error && e.message.includes('Incoming') ? i18n.t('friends.incomingExists') : i18n.t('friends.requestFailed')
      toast.error(msg)
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
      reload()
    } catch {
      toast.error(i18n.t('friends.actionFailed'))
    } finally {
      setBusy(null)
    }
  }

  const remove = async (targetUserId: string) => {
    if (!token) return
    setBusy(targetUserId)
    try {
      await removeFriend(token, targetUserId)
      reload()
    } catch {
      toast.error(i18n.t('friends.actionFailed'))
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
      if (next) toast.success(i18n.t('friends.followDone'))
      reload()
    } catch {
      toast.error(i18n.t('friends.actionFailed'))
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
    <div className="relative">
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
        <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-lg border border-stage-border bg-stage-panel/95 p-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-stage-text">👥 {t('friends.title')}</h3>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('common.close')} className="text-xs text-stage-text-muted hover:text-stage-text">✕</button>
          </div>

          {pendingIn.length > 0 && (
            <section className="mt-2">
              <h4 className="text-[11px] font-semibold text-fire-amber">{t('friends.requests')}</h4>
              <ul className="mt-1 space-y-1">
                {pendingIn.map((p) => (
                  <li key={p.friendship_id} className="flex items-center gap-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{p.display_name ?? p.user_id.slice(0, 8)}</span>
                    <button type="button" disabled={busy === p.friendship_id} onClick={() => void respond(p.friendship_id, 'accept')}
                      className="rounded bg-fire-amber px-2 py-0.5 text-[11px] font-semibold text-stage-base disabled:opacity-40">
                      {t('friends.accept')}
                    </button>
                    <button type="button" disabled={busy === p.friendship_id} onClick={() => void respond(p.friendship_id, 'reject')}
                      className="rounded border border-stage-border px-2 py-0.5 text-[11px] text-stage-text-muted disabled:opacity-40">
                      {t('friends.reject')}
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
              <ul className="space-y-1">
                {online.map((f) => (
                  <li key={f.user_id} className="group flex items-center gap-1.5 text-sm">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-spring-green" />
                    <span className="min-w-0 flex-1 truncate text-stage-text">{f.display_name ?? f.user_id.slice(0, 8)}</span>
                    <span className="text-[11px] text-stage-text-muted">
                      {onlinePresence[f.user_id] === 'room' ? t('friends.inRoom') : t('friends.inLobby')}
                    </span>
                    <button type="button" onClick={() => void remove(f.user_id)} aria-label={t('friends.remove')}
                      className="hidden text-[11px] text-stage-text-muted hover:text-fire-hot group-hover:block">✕</button>
                  </li>
                ))}
                {offline.map((f) => (
                  <li key={f.user_id} className="group flex items-center gap-1.5 text-sm opacity-60">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-stage-border" />
                    <span className="min-w-0 flex-1 truncate">{f.display_name ?? f.user_id.slice(0, 8)}</span>
                    <span className="text-[11px] text-stage-text-muted">{t('friends.offline')}</span>
                    <button type="button" onClick={() => void remove(f.user_id)} aria-label={t('friends.remove')}
                      className="hidden text-[11px] text-stage-text-muted hover:text-fire-hot group-hover:block">✕</button>
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
                  <li key={f.user_id} className="group flex items-center gap-1.5 text-sm">
                    <span aria-hidden className="shrink-0 text-[11px]">🔔</span>
                    <span className="min-w-0 flex-1 truncate">{f.display_name ?? f.user_id.slice(0, 8)}</span>
                    <button type="button" disabled={busy === f.user_id} onClick={() => void toggleFollow(f.user_id)} aria-label={t('friends.unfollow')}
                      className="hidden text-[11px] text-stage-text-muted hover:text-fire-hot group-hover:block disabled:opacity-40">✕</button>
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
                  <p className="mt-1 text-[11px] text-stage-text-muted">{t('friends.noRecent')}</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {addable.map((p) => (
                      <li key={p.user_id} className="flex items-center gap-1.5 text-sm">
                        <span className="min-w-0 flex-1 truncate">{p.display_name ?? p.user_id.slice(0, 8)}</span>
                        <button type="button" disabled={busy === p.user_id} onClick={() => void request(p.user_id)}
                          className="rounded border border-stage-border px-2 py-0.5 text-[11px] text-stage-text-muted hover:text-stage-text disabled:opacity-40">
                          {t('friends.request')}
                        </button>
                        <button type="button" disabled={busy === p.user_id} onClick={() => void toggleFollow(p.user_id)}
                          className={`rounded px-2 py-0.5 text-[11px] disabled:opacity-40 ${followingIds.has(p.user_id) ? 'bg-fire-amber/20 text-fire-amber' : 'border border-stage-border text-stage-text-muted hover:text-stage-text'}`}>
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
