import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useUserStore } from '@/stores/userStore'
import { createRoom, fetchPublicRooms, type LobbyRoom } from '@/lib/rooms'

// LOB-01/03: 공개 방 목록(public_rooms 뷰) + 방 생성.
// ponytail: 장르/언어 필터·Realtime 라이브 갱신·초대링크·비밀번호는 후속 슬라이스.
//   (Realtime 로비는 rooms 공개 SELECT 정책이 필요 — 현재 RLS는 참가자 전용이라 수동 새로고침.)
export default function LobbyPage() {
  const email = useUserStore((s) => s.user?.email)
  const session = useUserStore((s) => s.session)
  const logout = useUserStore((s) => s.logout)
  const navigate = useNavigate()

  const [rooms, setRooms] = useState<LobbyRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 버튼용 새로고침(이벤트 핸들러 — 여기서 setState 는 규칙 위반 아님).
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setRooms(await fetchPublicRooms())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '방 목록을 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [])

  // 최초 로드: setState 는 async IIFE 안(await 이후)에서만 — set-state-in-effect 회피.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchPublicRooms()
        if (!cancelled) {
          setRooms(data)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '방 목록을 불러오지 못했어요.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t || !session) return
    setCreating(true)
    setError(null)
    try {
      const { room_id } = await createRoom(session.access_token, t)
      navigate(`/rooms/${room_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '방 생성에 실패했어요.')
      setCreating(false)
    }
  }

  return (
    <main className="min-h-screen bg-stage-base text-stage-text p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">로비</h1>
        <button
          onClick={onLogout}
          className="rounded-lg border border-stage-border px-4 py-2 text-sm text-stage-text-muted hover:text-stage-text"
        >
          로그아웃
        </button>
      </div>
      {email && <p className="mt-2 text-stage-text-muted">{email} 님, 환영합니다</p>}

      <form onSubmit={onCreate} className="mt-6 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="방 제목"
          placeholder="방 제목"
          maxLength={80}
          className="flex-1 max-w-sm rounded-lg border border-stage-border bg-transparent px-4 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={creating || !title.trim()}
          className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
        >
          {creating ? '만드는 중…' : '방 만들기'}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg bg-fire-hot/10 px-4 py-2 text-sm text-fire-hot" role="alert">
          {error}
        </p>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stage-text-muted">
            공개 방 ({rooms.length})
          </h2>
          <button
            onClick={() => void refresh()}
            className="text-xs text-stage-text-muted hover:text-stage-text"
          >
            새로고침
          </button>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-stage-text-muted">불러오는 중…</p>
        ) : rooms.length === 0 ? (
          <p className="mt-3 text-sm text-stage-text-muted">
            열려 있는 방이 없어요. 위에서 새 방을 만들어 보세요.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rooms.map((r) => {
              const full = r.currentParticipants >= r.maxParticipants
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-stage-border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.title}</p>
                    <p className="text-xs text-stage-text-muted">
                      {r.hostDisplayName ?? '호스트'} · {r.currentParticipants}/{r.maxParticipants}명
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/rooms/${r.id}`)}
                    disabled={full}
                    className="shrink-0 rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base disabled:opacity-40"
                  >
                    {full ? '가득 참' : '입장'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
