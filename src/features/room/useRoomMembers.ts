import { useEffect, useState } from 'react'
import { fetchRoomMembers, fetchRoomHostId } from '@/lib/dub'
import { useRoomStore } from '@/stores/roomStore'
import { useUserStore } from '@/stores/userStore'

// 멤버 명단 서버 동기(R-커밋: RoomPage 에서 순수 이동) — 참가자별 아바타·절대좌석·음소거·배우집합·
// 호스트 authId·손들기 큐를 list-room-members 로 재조회한다. memberKey(정렬된 identity 문자열)로만
// 재조회 — participants 참조는 발화/메타 이벤트마다 바뀌므로 멤버 집합이 실제로 바뀔 때만 호출.
// ponytail: 세션 중 아바타 변경 실시간 전파는 후속(현재는 멤버 변동 시 반영).
export function useRoomMembers(opts: { roomId: string; joined: boolean; raiseHandRefetch: number }) {
  const { roomId, joined, raiseHandRefetch } = opts
  const session = useUserStore((s) => s.session)
  const participants = useRoomStore((s) => s.participants)
  const memberKey = participants.map((p) => p.identity).sort().join(',')

  const [memberAvatars, setMemberAvatars] = useState<Record<string, string | null>>({})
  const [memberSlots, setMemberSlots] = useState<Record<string, number>>({})
  const [mutedIdentities, setMutedIdentities] = useState<Set<string>>(new Set())
  const [mutedUntil, setMutedUntil] = useState<Record<string, string>>({}) // R4 시간제 만료(authId→ISO, 무기한 제외)
  const [actorIds, setActorIds] = useState<Set<string>>(new Set()) // 배우만(호스트 역할 배정 후보 — 관전자 제외)
  const [hostAuthId, setHostAuthId] = useState<string | null>(null) // 노트 방장 강조 + SEC-RA-1 발신자 검증
  const [raisedHands, setRaisedHands] = useState<{ authId: string; userId: string; name: string | null }[]>([])
  const [handRaised, setHandRaised] = useState(false)

  useEffect(() => {
    if (!joined || !session) return
    let cancelled = false
    ;(async () => {
      try {
        // 참가자 변동(memberKey)마다 재실행 — 호스트 퇴장도 참가자 변동이므로 hostId 가 새 호스트로 갱신된다(A-FUNC-3 이양).
        const [members, newHostId] = await Promise.all([
          fetchRoomMembers(session.access_token, roomId),
          fetchRoomHostId(roomId),
        ])
        if (cancelled) return
        const avatars: Record<string, string | null> = {}
        const slots: Record<string, number> = {}
        const muted = new Set<string>()
        const untilMap: Record<string, string> = {}
        const actorSet = new Set<string>()
        const raised: { authId: string; userId: string; name: string | null; at: string }[] = []
        for (const m of members) {
          avatars[m.authId] = m.avatarUrl
          slots[m.authId] = m.slotIndex // 절대좌석용(identity=auth uid)
          if (m.mutedByHost) muted.add(m.authId)
          if (m.mutedByHost && m.mutedUntil) untilMap[m.authId] = m.mutedUntil // R4 잔여 표시·자가해제 타이머
          if (m.role !== 'viewer') actorSet.add(m.authId) // 역할 배정 후보(ROOM-14)
          if (m.raiseHandAt) raised.push({ authId: m.authId, userId: m.userId, name: m.displayName, at: m.raiseHandAt })
        }
        raised.sort((a, b) => a.at.localeCompare(b.at)) // 시간순(먼저 든 사람 위)
        setMemberAvatars(avatars)
        setMemberSlots(slots)
        setMutedIdentities(muted)
        setMutedUntil(untilMap)
        setActorIds(actorSet)
        setHostAuthId(members.find((m) => m.userId === newHostId)?.authId ?? null)
        setRaisedHands(raised.map(({ authId, userId, name }) => ({ authId, userId, name })))
        useRoomStore.getState().setRoomContext({ hostId: newHostId })
        // mute 마운트 로드(A-FUNC-3): 새로고침 후에도 내 muted_by_host 를 서버 진실로 재동기(desync 제거).
        const myAuthId = useUserStore.getState().user?.id
        if (myAuthId) {
          useRoomStore.getState().setMutedByHost(muted.has(myAuthId))
          setHandRaised(raised.some((r) => r.authId === myAuthId)) // 내 손들기도 서버 진실로 동기(새로고침 desync 제거)
          // 내 역할·좌석도 서버 진실로 동기 — 승격(ROOM-21) 재연결 시 cleanup reset() 후 myRole 복원(무대 등단 반영).
          const mine = members.find((m) => m.authId === myAuthId)
          if (mine) useRoomStore.getState().setRoomContext({ myRole: mine.role === 'viewer' ? 'viewer' : 'actor', mySlotIndex: mine.slotIndex })
        }
      } catch { /* 명단 조회 실패 → 기본 아바타 fallback + slot 미상은 임시배치 */ }
    })()
    return () => { cancelled = true }
  }, [joined, session, roomId, memberKey, raiseHandRefetch])

  return { memberKey, memberAvatars, memberSlots, mutedIdentities, mutedUntil, actorIds, hostAuthId, raisedHands, handRaised, setHandRaised }
}
