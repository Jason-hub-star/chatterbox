import { useEffect, useState, type CSSProperties, type RefObject } from 'react'
import type { RoomParticipant } from '@/stores/roomStore'
import RemoteAvatar, { type RemoteFrameSink } from '@/features/avatar/RemoteAvatar'
import SelfAvatar from './SelfAvatar'
import StageSlot from './StageSlot'
import MainView from './MainView'
import { SLOTS, SLOT_PX, seatParticipants } from './stageLayout'
import { useStageStore } from '@/stores/stageStore'
import { STAGE_BACKGROUNDS } from '@/lib/stageBackgrounds'

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
  // 호스트 좌석 판정(rooms.host_id). identity(=auth uid)가 hostId 와 같으면 그 좌석이 호스트 — 앰버 링+크라운(§6.4).
  hostId?: string | null
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
  hostId,
  onStopShare,
}: Props) {
  const slotPx = useSlotPx()
  const backgroundUrl = useStageStore((s) => s.backgroundUrl)
  // 최대 6석(§6.4; 8인 배치는 defer). slot_index 절대좌석 — key=identity 라 재배치돼도 캔버스 보존.
  const seats = seatParticipants(participants, slotOf, SLOTS.length)

  return (
    <div className="relative h-full w-full">
      {/* 무대 배경(HOST-04·05, ROOM-09) — 호스트가 고른 씬. 아바타 가독성 위해 반투명. 전환 fade 등 폴리시는 트랙 B. */}
      {/* 무대 씬(방장 선택) = 무대 전체 배경으로 선명하게(단일 렌더 — 센터 중복 제거). 아바타 가독 위해 살짝 어둡게. */}
      {backgroundUrl && (
        <div
          className="stage-pan pointer-events-none absolute inset-0 rounded-xl bg-cover bg-center opacity-90"
          style={{ backgroundImage: `url(${backgroundUrl})` }}
          aria-hidden
        >
          {/* 불 글로우 일렁임 — 원화 불 위치(% 앵커)에 빛 웅덩이. 백드롭의 **자식**이라 켄 번스(stage-pan)와
              함께 움직인다(형제면 팬 때 어긋남). 코어(i0)는 빠르게, 웅덩이(i1~)는 느리게 숨쉰다. */}
          {STAGE_BACKGROUNDS.find((b) => b.url === backgroundUrl)?.fireGlow?.map((p, i) => (
            <span
              key={`fire-${i}`}
              className="stage-fire absolute"
              style={{ left: `${p.x}%`, top: `${p.y}%`, '--fr': `${p.r}%`, animationDuration: `${2.6 + i * 2.6}s` } as CSSProperties}
            />
          ))}
        </div>
      )}
      <div className="relative grid h-full grid-cols-[1fr_1.9fr_1fr] grid-rows-[1fr_1.9fr_1fr] gap-2">
        {/* 센터 비디오 프레임(메인 뷰) — VGEN 공유재생 시 영상, 아니면 씬 배경이 비치는 히어로 placeholder. */}
        <MainView isHost={isHost} onStop={onStopShare} />

      {seats.map((p, i) => (
        <StageSlot key={p ? p.identity : `empty-${i}`} col={SLOTS[i].col} row={SLOTS[i].row} speaking={p?.isSpeaking}>
          {p ? (
            p.isLocal ? (
              <SelfAvatar
                projectUrl={selfProjectUrl}
                sendBlendshapes={sendBlendshapes}
                size={slotPx}
                isHost={!!hostId && p.identity === hostId}
              />
            ) : (
              <RemoteAvatar
                identity={p.identity}
                name={p.name}
                projectUrl={remoteProjectUrl(p.identity)}
                registry={remoteAvatars}
                size={slotPx}
                isHost={!!hostId && p.identity === hostId}
              />
            )
          ) : null}
        </StageSlot>
      ))}
      </div>
    </div>
  )
}
