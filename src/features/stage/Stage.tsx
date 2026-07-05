import { type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoomParticipant } from '@/stores/roomStore'
import RemoteAvatar, { type RemoteFrameSink } from '@/features/avatar/RemoteAvatar'
import SelfAvatar from './SelfAvatar'
import StageSlot from './StageSlot'
import MainView from './MainView'
import { SLOTS, SLOT_PX } from './stageLayout'

// 원형 무대(경로 B): 센터 프레임을 6석이 3쌍(상/중/하 × 좌·우)으로 둘러싼다(DESIGN-DIRECTION §6.1).
// 좌석 배정 = identity 안정정렬 → 모든 클라이언트가 같은 좌석을 본다. active-speaker 는 앞으로(StageSlot).
// self 파이프라인은 SelfAvatar, 원격 렌더는 RemoteAvatar 가 각자 소유 — 여기선 배치·좌석만 담당.
interface Props {
  participants: RoomParticipant[]
  selfProjectUrl: string
  remoteProjectUrl: (identity: string) => string
  sendBlendshapes: (blendshapes: Record<string, number>) => void
  remoteAvatars: RefObject<Map<string, RemoteFrameSink>>
  isHost: boolean
  onStopShare: () => void
}

export default function Stage({
  participants,
  selfProjectUrl,
  remoteProjectUrl,
  sendBlendshapes,
  remoteAvatars,
  isHost,
  onStopShare,
}: Props) {
  const { t } = useTranslation()
  // 최대 6석(§6.4; 8인 배치는 defer). identity 로 키잉해 재정렬돼도 리마운트 없음(PixiJS 캔버스 보존).
  const seated = [...participants]
    .sort((a, b) => a.identity.localeCompare(b.identity))
    .slice(0, SLOTS.length)

  return (
    <div className="grid w-full max-w-3xl grid-cols-3 grid-rows-3 gap-2">
      {/* 센터 비디오 프레임(메인 뷰) — VGEN 공유재생 시 영상, 아니면 placeholder. */}
      <MainView isHost={isHost} onStop={onStopShare} />


      {seated.map((p, i) => (
        <StageSlot key={p.identity} col={SLOTS[i].col} row={SLOTS[i].row} speaking={p.isSpeaking}>
          {p.isLocal ? (
            <SelfAvatar projectUrl={selfProjectUrl} sendBlendshapes={sendBlendshapes} size={SLOT_PX} />
          ) : (
            <RemoteAvatar
              identity={p.identity}
              name={p.name}
              projectUrl={remoteProjectUrl(p.identity)}
              registry={remoteAvatars}
              size={SLOT_PX}
            />
          )}
        </StageSlot>
      ))}

      {SLOTS.slice(seated.length).map((slot, i) => (
        <StageSlot key={`empty-${seated.length + i}`} col={slot.col} row={slot.row}>
          <span
            className="grid place-items-center rounded-lg border border-dashed border-stage-border bg-stage-panel/40 text-[11px] text-stage-text-muted"
            style={{ width: SLOT_PX, height: SLOT_PX }}
          >
            {t('stage.emptySlot')}
          </span>
        </StageSlot>
      ))}
    </div>
  )
}
