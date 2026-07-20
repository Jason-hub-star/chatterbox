import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoomParticipant } from '@/stores/roomStore'
import RemoteAvatar, { type RemoteFrameSink } from '@/features/avatar/RemoteAvatar'
import SelfAvatar from './SelfAvatar'
import { useDubStore } from '@/stores/dubStore'
import StageSlot from './StageSlot'
import AvatarZoomOverlay from './AvatarZoomOverlay'
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
  // UX-STAGE-VIS: 호스트음소거 authId 집합(서버 진실·전 멤버) — 무대 슬롯에 🔇 배지. 연결저하는 participant.connectionQuality.
  mutedIdentities: Set<string>
  onStopShare: () => void
  onDubEdit?: (segmentId: number) => void // DUB-EDIT E3: 타임라인 편집중 배지 broadcast(호스트)
}

// 무대 슬롯 상태 배지(UX-STAGE-VIS) — 콘솔 탭에만 있던 음소거·연결 상태를 무대에 노출.
// 아이콘=비색상 신호(색상단독 회피) + aria-label. 정상(good/excellent/unknown)은 미표시로 무대 클린 유지.
function SlotStatus({ muted, quality }: { muted: boolean; quality?: RoomParticipant['connectionQuality'] }) {
  const { t } = useTranslation()
  const conn =
    quality === 'poor' ? { icon: '🔴', label: t('stage.statusConnPoor') }
      : quality === 'lost' ? { icon: '❌', label: t('stage.statusConnLost') }
        : null
  if (!muted && !conn) return null
  return (
    <div className="pointer-events-none absolute right-1 top-1 z-20 flex gap-1">
      {muted && (
        <span className="grid h-5 w-5 place-items-center rounded-full bg-fire-hot/90 text-[11px] shadow" role="img" aria-label={t('stage.statusMuted')} title={t('stage.statusMuted')}>
          🔇
        </span>
      )}
      {conn && (
        <span className="grid h-5 w-5 place-items-center rounded-full bg-stage-base/85 text-[11px] shadow" role="img" aria-label={conn.label} title={conn.label}>
          {conn.icon}
        </span>
      )}
    </div>
  )
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
  mutedIdentities,
  onStopShare,
  onDubEdit,
}: Props) {
  const { t } = useTranslation()
  const slotPx = useSlotPx()
  const backgroundUrl = useStageStore((s) => s.backgroundUrl)
  // S3 더빙 무대(주인님 디렉티브): 씬 배경 없음 · 영상 AR fit 최대화 · 아바타는 영상 위 bare 오버레이.
  const isDubStage = !!useDubStore((s) => s.sourceUrl)
  const sourceAR = useDubStore((s) => s.sourceAR)
  const dubBoxRef = useRef<HTMLDivElement | null>(null)
  const [dubBox, setDubBox] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    if (!isDubStage) return
    const el = dubBoxRef.current
    if (!el) return
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect
      setDubBox({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [isDubStage])
  // F6 DUB-AVATAR-DRAG: 오버레이 아바타 줄 드래그 재배치(로컬 v1 — 방 공유 없음). null=기본(하단-좌측).
  const ovRef = useRef<HTMLDivElement | null>(null)
  const [ovPos, setOvPos] = useState<{ x: number; y: number } | null>(null)
  const beginOverlayDrag = (e: React.PointerEvent) => {
    const strip = ovRef.current
    const box = strip?.parentElement
    if (!strip || !box) return
    e.preventDefault()
    const boxR = box.getBoundingClientRect()
    const stripR = strip.getBoundingClientRect()
    const dx = e.clientX - stripR.left
    const dy = e.clientY - stripR.top
    const onMove = (ev: PointerEvent) => {
      setOvPos({
        x: Math.min(Math.max(ev.clientX - boxR.left - dx, 0), Math.max(0, boxR.width - stripR.width)),
        y: Math.min(Math.max(ev.clientY - boxR.top - dy, 0), Math.max(0, boxR.height - stripR.height)),
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  // 최대 6석(§6.4; 8인 배치는 defer). slot_index 절대좌석 — key=identity 라 재배치돼도 캔버스 보존.
  const seats = seatParticipants(participants, slotOf, SLOTS.length)
  // 아바타 크게보기(무대 클릭, 전원 대상). 원격은 registry 이동이라 확대 중 무대 슬롯을 비운다(placeholder). self 는 구독이라 무대 유지.
  const [zoomed, setZoomed] = useState<string | null>(null)
  const zoomedSeat = seats.find((p) => p?.identity === zoomed) ?? null

  if (isDubStage) {
    // AR fit: 무대 실측 × 소스 비율 → 최대 박스(타임라인 행 64px 보정). 메타 전엔 16:9 가정.
    const TL_H = 64
    const ar = sourceAR ?? 16 / 9
    let fit: { width: number; height: number } | null = null
    if (dubBox && dubBox.w > 0 && dubBox.h > TL_H) {
      const videoH = Math.min(dubBox.h - TL_H, dubBox.w / ar)
      fit = { width: Math.round(videoH * ar), height: Math.round(videoH + TL_H) }
    }
    const overlaySize = slotPx < 100 ? 64 : 96
    const present = seats.filter((p): p is NonNullable<typeof p> => !!p)
    return (
      <div ref={dubBoxRef} data-dub-stage className="relative flex h-full w-full items-center justify-center">
        <div className="relative" style={fit ?? { width: '100%', height: '100%' }}>
          <MainView isHost={isHost} onStop={onStopShare} onDubEdit={onDubEdit} />
          {/* 아바타 오버레이: 스프라이트만(크림 원·라벨·좌석 없음) — 기본 하단-좌측, 드래그로 재배치(F6) */}
          <div
            ref={ovRef}
            data-dub-overlay-strip
            onPointerDown={beginOverlayDrag}
            title={t('dub.avatarDragHint')}
            className="absolute z-10 flex cursor-move touch-none select-none items-end gap-1"
            style={ovPos && fit
              ? { left: Math.min(ovPos.x, Math.max(0, fit.width - overlaySize)), top: Math.min(ovPos.y, Math.max(0, fit.height - overlaySize)) }
              : { left: 8, bottom: TL_H + 8 }}
          >
            {present.map((p) => (
              <div key={p.identity} data-dub-overlay-avatar={p.identity}>
                {p.isLocal ? (
                  <SelfAvatar projectUrl={selfProjectUrl} sendBlendshapes={sendBlendshapes} size={overlaySize} bare />
                ) : (
                  <RemoteAvatar identity={p.identity} name={p.name} projectUrl={remoteProjectUrl(p.identity)} registry={remoteAvatars} size={overlaySize} bare />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

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
        <MainView isHost={isHost} onStop={onStopShare} onDubEdit={onDubEdit} />

      {seats.map((p, i) => (
        <StageSlot
          key={p ? p.identity : `empty-${i}`}
          col={SLOTS[i].col}
          row={SLOTS[i].row}
          speaking={p?.isSpeaking}
          onClick={p ? () => setZoomed(p.identity) : undefined}
        >
          {p && <SlotStatus muted={mutedIdentities.has(p.identity)} quality={p.connectionQuality} />}
          {/* R7 좌석 번호: 호스트 구두 지시("3번 좌석")·본인 좌석 인지용. 장식이라 aria-hidden. */}
          {p && (
            <span aria-hidden className="pointer-events-none absolute left-1 top-1 z-20 rounded bg-stage-base/70 px-1 text-[9px] tabular-nums text-stage-text-muted">
              {t('stage.seatLabel', { n: i + 1 })}
            </span>
          )}
          {p ? (
            // 원격이 확대 중이면 무대 슬롯은 placeholder — registry sink 가 identity 당 1개라 확대창으로 이동한다.
            p.identity === zoomed && !p.isLocal ? (
              <div
                className="grid place-items-center rounded-full border border-dashed border-stage-border text-[11px] text-stage-text-muted"
                style={{ width: slotPx, height: slotPx }}
              >
                {t('stage.zoomedAway')}
              </div>
            ) : p.isLocal ? (
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
      {zoomedSeat && (
        <AvatarZoomOverlay
          target={{
            identity: zoomedSeat.identity,
            name: zoomedSeat.name,
            isLocal: zoomedSeat.isLocal,
            isHost: !!hostId && zoomedSeat.identity === hostId,
            projectUrl: zoomedSeat.isLocal ? selfProjectUrl : remoteProjectUrl(zoomedSeat.identity),
          }}
          remoteRegistry={remoteAvatars}
          onClose={() => setZoomed(null)}
        />
      )}
    </div>
  )
}
