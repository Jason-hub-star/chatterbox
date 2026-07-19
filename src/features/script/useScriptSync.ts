import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { applyRoleEvent, isRoleEvent, pruneRoleMap, roleOf, type RoleMap } from '@/features/script/roleMap'
import { SEED_SCRIPTS } from '@/features/script/cues'
import { scriptRoleAction, setScriptMode } from '@/lib/rooms'
import { useRoomStore } from '@/stores/roomStore'
import { useUserStore } from '@/stores/userStore'
import { toast } from '@/hooks/useToast'

// 대본 동기 묶음(R-커밋: RoomPage 에서 순수 이동) — 텔레프롬프터 cue·역할 클레임 맵(ROOM-14)·
// 리허설/본공연 모드. 쓰기 경로는 서버 릴레이(advance-script-cue·sync-script-role·set-script-mode),
// 수신(handleCue/handleScriptRole)은 useLiveKitRoom 옵션으로 배선된다.
// sendCue 는 useLiveKitRoom 반환이라 TDZ — RoomPage 가 ref 브리지로 넘긴다(recording 과 동형).
export function useScriptSync(opts: {
  roomId: string
  connected: boolean
  memberKey: string
  isHost: boolean
  isViewer: boolean
  isPractice: boolean // 연습 방(LOB-10): 시스템 호스트라 전원이 진행자(서버도 동일 예외)
  myIdentity: string
  actorIds: Set<string>
  sendCue: (sceneId: string, cueIndex: number) => Promise<void>
}) {
  const { roomId, connected, memberKey, isHost, isViewer, isPractice, myIdentity, actorIds, sendCue } = opts
  const { t } = useTranslation()
  const participants = useRoomStore((s) => s.participants)

  const [cueIndex, setCueIndex] = useState(0)
  // 역할 클레임 맵(ROOM-14): 쓰기 경로는 서버 릴레이 수신뿐(자기 액션도 서버 echo 로 반영 → 전 클라 순서 일치).
  const [roleMap, setRoleMap] = useState<RoleMap>({})
  const handleScriptRole = useCallback((payload: unknown) => {
    if (!isRoleEvent(payload)) return // 형태 방어(변조 페이로드 드롭)
    setRoleMap((m) => applyRoleEvent(m, payload))
  }, [])

  // 대본 모드(ROOM-14): 서버 진실(rooms.script_mode) — 입장 시 로드 + room-authority 로 실시간 동기.
  const [scriptMode, setScriptModeLocal] = useState<'rehearsal' | 'performance'>('performance')
  const scriptModeRef = useRef(scriptMode)
  useEffect(() => { scriptModeRef.current = scriptMode }, [scriptMode])
  const isPracticeRef = useRef(isPractice)
  useEffect(() => { isPracticeRef.current = isPractice }, [isPractice])
  // 서버발 모드 반영(초기 로드·room-authority script_mode) — echo 는 같은 값 → 멱등.
  const applyServerScriptMode = useCallback((mode: string | undefined) => {
    if (mode === 'rehearsal' || mode === 'performance') setScriptModeLocal(mode)
  }, [])

  // 수신 방어: 다른 씬 메시지 무시 + cueIndex 범위 클램프(변조·스테일·멀티씬 대비).
  const handleCue = useCallback((p: { sceneId: string; cueIndex: number }) => {
    // 본공연: 진행자는 호스트뿐 — 호스트는 자기 진행이 소스(로컬 갱신)라 서버 self-echo 를 무시해 회귀 방지(SEC-5).
    // 연습 방·리허설: 전원이 진행자 — 호스트도 남의 진행을 받아야 하므로 스킵 없음(자기 echo 는 같은 값 → 멱등).
    // (2026-07-09 프로드 2탭 E2E 가 잡은 버그: 리허설에서 배우 진행이 호스트에 영원히 미반영 → 모드 조건 추가.)
    if (!isPracticeRef.current && scriptModeRef.current !== 'rehearsal' && useRoomStore.getState().mySlotIndex === 0) return
    const sc = SEED_SCRIPTS[0]
    if (!sc || p.sceneId !== sc.id) return
    setCueIndex(Math.max(0, Math.min(sc.cues.length - 1, p.cueIndex)))
  }, [])

  // 대본 진행권: 호스트 또는 연습 방/리허설 모드의 배우(서버 advance-script-cue 가 동일 규칙으로 재검증 — 관전자 403).
  const canAdvanceCue = !isViewer && (isHost || isPractice || scriptMode === 'rehearsal')
  // 실데이터만(2026-07-19): 시드가 비면 null — 좌패널은 빈 상태, 진행/재브로드캐스트는 no-op.
  const script = SEED_SCRIPTS[0] ?? null
  const advanceCue = useCallback((delta: number) => {
    if (!script) return
    setCueIndex((cur) => {
      const next = Math.max(0, Math.min(script.cues.length - 1, cur + delta))
      if (next !== cur) void sendCue(script.id, next) // 서버 릴레이 → 전 참가자 동기(호스트는 로컬 갱신·서버 echo 무시, SEC-5)
      return next
    })
  }, [sendCue, script])

  // 호스트: 연결 직후 + 참가자 변동 시 현재 cue 를 재브로드캐스트.
  // reliable DataChannel 은 첫 publishData 로 개설되며 그 메시지가 유실될 수 있어(모든 세션 첫 진행 유실),
  // 연결 시 warm-up 겸 현재 상태를 흘려 채널을 연다. 겸사겸사 늦게 입장한 참가자도 현재 cue 로 동기.
  const cueIndexRef = useRef(cueIndex)
  useEffect(() => { cueIndexRef.current = cueIndex }, [cueIndex])
  useEffect(() => {
    if (!isHost || !connected || !script) return
    void sendCue(script.id, cueIndexRef.current)
  }, [isHost, connected, memberKey, sendCue, script])

  // 역할 맵 표시는 퇴장자 제외(렌더 파생 — set-state-in-effect 회피). 재입장자는 아래 재클레임으로 자가복구.
  const liveRoleMap = useMemo(() => {
    const present = new Set(participants.map((p) => p.identity))
    return pruneRoleMap(roleMap, present)
  }, [roleMap, participants])
  const myScriptRole = roleOf(liveRoleMap, myIdentity)
  // 내 클레임 재전송(ROOM-14 늦입장 동기 — cue warm-up 동형): 멤버 변동 시 자기 역할을 멱등 재클레임.
  // 각자 자기 상태를 복구하므로 호스트 새로고침에도 전원 클레임이 살아남는다(호스트 전체맵 sync 방식의 회귀 회피).
  const myScriptRoleRef = useRef(myScriptRole)
  useEffect(() => { myScriptRoleRef.current = myScriptRole }, [myScriptRole])
  useEffect(() => {
    if (!connected) return
    const token = useUserStore.getState().session?.access_token
    const role = myScriptRoleRef.current
    if (!token || !role) return
    void scriptRoleAction(token, roomId, { action: 'claim', role }).catch(() => { /* 다음 멤버 변동에 재시도 */ })
  }, [connected, memberKey, roomId])

  // 역할 클레임/해제/배정·모드 전환 콜백(ROOM-14). 본인 액션은 낙관 self-echo(리액션 동형) —
  // 신규 참가자의 서버→클라 채널 첫 수신이 드롭될 수 있어(프로드 2탭 E2E 실측) 로컬 즉시 반영하고,
  // 서버 echo 는 같은 값이라 멱등(경합은 서버 순서 LWW 로 수렴).
  const claimRole = useCallback((role: string) => {
    const token = useUserStore.getState().session?.access_token
    if (!token) return
    const myName = useRoomStore.getState().participants.find((p) => p.isLocal)?.name ?? null
    setRoleMap((m) => applyRoleEvent(m, { kind: 'set', role, authId: myIdentity, name: myName }))
    void scriptRoleAction(token, roomId, { action: 'claim', role }).catch(() => toast.error(t('script.roleSyncFailed')))
  }, [roomId, t, myIdentity])
  const releaseRole = useCallback((role: string) => {
    const token = useUserStore.getState().session?.access_token
    if (!token) return
    setRoleMap((m) => applyRoleEvent(m, { kind: 'clear', role }))
    void scriptRoleAction(token, roomId, { action: 'release', role }).catch(() => toast.error(t('script.roleSyncFailed')))
  }, [roomId, t])
  const assignRole = useCallback((role: string, targetAuthId: string | null) => {
    const token = useUserStore.getState().session?.access_token
    if (!token) return
    void scriptRoleAction(token, roomId, { action: 'assign', role, target_auth_id: targetAuthId }).catch(() => toast.error(t('script.roleSyncFailed')))
  }, [roomId, t])
  const toggleScriptMode = useCallback(() => {
    const token = useUserStore.getState().session?.access_token
    if (!token) return
    const prev = scriptMode
    const next = prev === 'rehearsal' ? 'performance' : 'rehearsal'
    setScriptModeLocal(next) // 낙관 반영(서버 echo 는 같은 값 → 멱등), 실패 시 롤백
    setScriptMode(token, roomId, next).catch(() => {
      setScriptModeLocal(prev)
      toast.error(t('script.modeSyncFailed'))
    })
  }, [roomId, scriptMode, t])

  // 배우 목록(호스트 배정 셀렉트 후보) — LiveKit 참가자 ∩ 배우(관전자 제외).
  const actorOptions = useMemo(
    () => participants.filter((p) => actorIds.has(p.identity)).map((p) => ({ identity: p.identity, name: p.name })),
    [participants, actorIds],
  )

  return {
    script,
    cueIndex,
    scriptMode,
    canAdvanceCue,
    liveRoleMap,
    actorOptions,
    advanceCue,
    claimRole,
    releaseRole,
    assignRole,
    toggleScriptMode,
    handleCue,
    handleScriptRole,
    applyServerScriptMode,
  }
}
