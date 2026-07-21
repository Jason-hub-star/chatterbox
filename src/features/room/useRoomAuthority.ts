import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { applyVodSync } from '@/features/stage/vodSync'
import { useStageStore } from '@/stores/stageStore'
import { useDubStore } from '@/stores/dubStore'
import { useRoomStore } from '@/stores/roomStore'
import { useUserStore } from '@/stores/userStore'
import { toast } from '@/hooks/useToast'

// room-authority 수신 프로토콜(R-커밋 허브에서 분리, 2026-07-21 NR) — LiveKit broadcast 로 도착하는
// 서버-릴레이 이벤트를 하나의 스위치로 디스패치한다. SEC-RA-1: 수신 게이트(서버 릴레이만 신뢰)는
// useLiveKitRoom 이 처리하고 여기는 통과분만 받는다. 모듈 임포트(stores·vodSync·toast)는 직접 쓰고,
// 컴포넌트-로컬 상태 변이만 주입받는다.
type RecAuthorityMsg = { type: string; recording_id?: string; all_consented?: boolean }

export function useRoomAuthority(deps: {
  playSharedVgen: (jobId: string) => void
  applyServerScriptMode: (mode: string | undefined) => void
  setRaiseHandRefetch: Dispatch<SetStateAction<number>>
  setRoomName: Dispatch<SetStateAction<string>>
  setRoomGenre: Dispatch<SetStateAction<string>>
  setKickReason: Dispatch<SetStateAction<string | null>>
  setStageInvite: Dispatch<SetStateAction<boolean>>
  setReconnectNonce: Dispatch<SetStateAction<number>>
  recAuthorityRef: MutableRefObject<((msg: RecAuthorityMsg) => void) | null>
}) {
  const { t } = useTranslation()
  const {
    playSharedVgen, applyServerScriptMode, setRaiseHandRefetch, setRoomName, setRoomGenre,
    setKickReason, setStageInvite, setReconnectNonce, recAuthorityRef,
  } = deps
  const dubEditBadgeTimer = useRef<number | null>(null) // DUB-EDIT: 편집중 배지 decay 타이머

  return useCallback((msg: { type: string; jobId?: string; url?: string | null; mode?: string; target_auth_id?: string; auth_id?: string; slot_index?: number | null; reason?: string; new_mode?: string; position_ms?: number; playing?: boolean; at_ms?: number; rate?: number; recording_id?: string; all_consented?: boolean; new_host_auth_id?: string; title?: string; genre?: string | null; on?: boolean; segment_id?: number; name?: string }) => {
    if (msg.type === 'vgen_result' && typeof msg.jobId === 'string') void playSharedVgen(msg.jobId)
    else if (msg.type === 'vgen_stop') useStageStore.getState().clearMainVideo()
    else if (msg.type === 'bg_change') useStageStore.getState().setBackground(msg.url ?? null)
    else if (msg.type === 'script_mode') {
      // 대본 모드 전환(ROOM-14, set-script-mode Edge 발). 호스트 자신도 echo 를 받지만 같은 값 → 멱등.
      applyServerScriptMode(msg.mode)
    }
    else if (msg.type === 'raise_hand') setRaiseHandRefetch((n) => n + 1) // 손든 관객 변동 → 큐 재조회(호스트 UI)
    else if (msg.type === 'room_update') {
      // 방 설정 편집(R2, update-room-settings Edge 발) — 전원 상단바 즉시 반영(서버가 최종값 전달).
      if (typeof msg.title === 'string') setRoomName(msg.title)
      if (msg.genre !== undefined) setRoomGenre(msg.genre ?? '')
    }
    else if (msg.type === 'host_change') {
      // 호스트 명시 이양(R1, transfer-host Edge 발) — 전원 멤버 재조회로 hostId 재파생(isHost·왕관·콘솔 탭·vod publisher 전환).
      setRaiseHandRefetch((n) => n + 1)
      if (msg.new_host_auth_id === useUserStore.getState().user?.id) toast.success(t('host.transferReceived'))
    }
    else if (msg.type === 'vod_sync') {
      // ROOM-01 동기: 적용자(applier)는 비호스트 MainView 만 등록 → 호스트/미재생 화면엔 no-op. 형태 검증 후 적용.
      if (
        typeof msg.position_ms === 'number' && Number.isFinite(msg.position_ms) && msg.position_ms >= 0 &&
        typeof msg.at_ms === 'number' && Number.isFinite(msg.at_ms)
      ) {
        // rate 는 후행 추가(U-3) — 구 페이로드 하위호환 1 폴백 + 형태검증(0<r≤4)
        const rate = typeof msg.rate === 'number' && Number.isFinite(msg.rate) && msg.rate > 0 && msg.rate <= 4 ? msg.rate : 1
        applyVodSync({ positionMs: msg.position_ms, playing: msg.playing === true, atMs: msg.at_ms, rate })
      }
    }
    else if (msg.type === 'dub_screening') {
      // G9-P3 누적 시사회: SEC-RA-1 게이트(HOST_CLIENT_TYPES + 발신자=호스트 identity) 통과분만 도달.
      // 각 클라가 자기 브라우저에서 get-dub-recordings(멤버 게이트)로 트랙을 받아 스케줄(MainView).
      useDubStore.getState().setScreening(msg.on === true)
    }
    else if (msg.type === 'dub_edit') {
      // DUB-EDIT E3: 편집중 배지(name 은 수신측 useLiveKitRoom 이 발신자 identity 로 확정) — 3s 무신호 소멸.
      if (Number.isInteger(msg.segment_id)) {
        useDubStore.getState().setEditingBadge({ segmentId: msg.segment_id!, name: msg.name ?? '' })
        if (dubEditBadgeTimer.current) window.clearTimeout(dubEditBadgeTimer.current)
        dubEditBadgeTimer.current = window.setTimeout(() => useDubStore.getState().setEditingBadge(null), 3000)
      }
    }
    else if (msg.type === 'mode_change') {
      // G-261: 서버(set-room-mode) broadcast. 배너 표출+탭 자동전환은 stageStore 구독측(ModeBanner·RightPanel).
      if (msg.new_mode === 'normal' || msg.new_mode === 'vgen' || msg.new_mode === 'dub') {
        useStageStore.getState().announceMode(msg.new_mode)
      }
    }
    else if (msg.type === 'kicked') {
      // 강퇴 사유(HOST-01): 서버(kick-participant)가 절단 직전 대상에게만 전송(destinationIdentities).
      // 표시는 kicked 상태(PARTICIPANT_REMOVED)에 게이트 — 참가자 스푸핑만으로는 화면에 못 띄운다.
      if (typeof msg.reason === 'string' && msg.reason) setKickReason(msg.reason.slice(0, 200))
    }
    else if (msg.type === 'stage_invite') {
      // 무대 초대(ROOM-21) — 대상 본인만 수락 모달, 다른 참가자는 무시.
      if (msg.target_auth_id === useUserStore.getState().user?.id) setStageInvite(true)
    } else if (msg.type.startsWith('recording_')) {
      // V-3 녹화 이벤트(consent/consent_update/started/done) — useRoomRecording 에 위임.
      recAuthorityRef.current?.(msg)
    } else if (msg.type === 'promoted') {
      setRaiseHandRefetch((n) => n + 1) // 전원 좌석 갱신(승격자 새 slot 반영)
      if (msg.auth_id === useUserStore.getState().user?.id) {
        // 본인 승격 → actor 전환 + 재연결(새 토큰 canPublish=true). 수락 모달 닫기.
        toast.success(t('room.stagePromoted')) // R7: 재연결·웹캠 권한 요청이 무고지로 진행되던 것 안내
        setStageInvite(false)
        useRoomStore.getState().setRoomContext({ myRole: 'actor', mySlotIndex: msg.slot_index ?? null })
        setReconnectNonce((n) => n + 1)
      }
    }
  }, [playSharedVgen, applyServerScriptMode, setRaiseHandRefetch, setRoomName, setRoomGenre, setKickReason, setStageInvite, setReconnectNonce, recAuthorityRef, t])
}
