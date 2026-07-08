import { useEffect, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoomParticipant } from '@/stores/roomStore'
import RemoteAvatar, { type RemoteFrameSink } from '@/features/avatar/RemoteAvatar'
import SelfAvatar from './SelfAvatar'
import StageSlot from './StageSlot'
import MainView from './MainView'
import { SLOTS, SLOT_PX, seatParticipants } from './stageLayout'

// 원형 무대(경로 B): 센터 프레임을 6석이 3쌍(상/중/하 × 좌·우)으로 둘러싼다(DESIGN-DIRECTION §6.1).
// 좌석 배정 = DB slot_index 절대좌석(seatParticipants) → 입퇴장에 좌석 불변·전 클라 일치. active-speaker 는 앞으로(StageSlot).
// self 파이프라인은 SelfAvatar, 원격 렌더는 RemoteAvatar 가 각자 소유 — 여기선 배치·좌석만 담당.
interface Props {
  participants: RoomParticipant[]
  selfProjectUrl: string
  remoteProjectUrl: (identity: string) => string
  slotOf: (identity: string) => number | undefined
  sendBlendshapes: (blendshapes: Record<string, number>) => void
  remoteAvatars: RefObject<Map<string, RemoteFrameSink>>
  isHost: boolean
  onStopShare: () => void
}

// 반응형 슬롯 크기(P-5): <480px 뷰포트는 88px — 3열(88×3+gap+패딩)이 360px 에 들어가 압착이 사라진다.
// 브레이크포인트 교차 시 아바타 캔버스가 재생성되지만(size 가 양쪽 이펙트 deps) 교차는 드묾 — 허용.
const SLOT_PX_COMPACT = 88
function useSlotPx(): number {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 479px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 479px)')
    const onChange = (e: MediaQueryListEvent) => setCompact(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return compact ? SLOT_PX_COMPACT : SLOT_PX
}

export default function Stage({
  participants,
  selfProjectUrl,
  remoteProjectUrl,
  slotOf,
  sendBlendshapes,
  remoteAvatars,
  isHost,
  onStopShare,
}: Props) {
  const { t } = useTranslation()
  const slotPx = useSlotPx()
  // 최대 6석(§6.4; 8인 배치는 defer). slot_index 절대좌석 — key=identity 라 재배치돼도 캔버스 보존.
  const seats = seatParticipants(participants, slotOf, SLOTS.length)

  return (
    <div className="grid w-full max-w-3xl grid-cols-3 grid-rows-3 gap-2">
      {/* 센터 비디오 프레임(메인 뷰) — VGEN 공유재생 시 영상, 아니면 placeholder. */}
      <MainView isHost={isHost} onStop={onStopShare} />

      {seats.map((p, i) => (
        <StageSlot key={p ? p.identity : `empty-${i}`} col={SLOTS[i].col} row={SLOTS[i].row} speaking={p?.isSpeaking}>
          {p ? (
            p.isLocal ? (
              <SelfAvatar projectUrl={selfProjectUrl} sendBlendshapes={sendBlendshapes} size={slotPx} />
            ) : (
              <RemoteAvatar
                identity={p.identity}
                name={p.name}
                projectUrl={remoteProjectUrl(p.identity)}
                registry={remoteAvatars}
                size={slotPx}
              />
            )
          ) : (
            <span
              className="grid place-items-center rounded-lg border border-dashed border-stage-border bg-stage-panel/40 text-[11px] text-stage-text-muted"
              style={{ width: slotPx, height: slotPx }}
            >
              {t('stage.emptySlot')}
            </span>
          )}
        </StageSlot>
      ))}
    </div>
  )
}
