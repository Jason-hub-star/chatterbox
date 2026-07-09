import { useTranslation } from 'react-i18next'
import { useRoomStore } from '@/stores/roomStore'
import { netTier, type NetTier } from '@/lib/roomQuality'

// 우상단 네트워크 인디케이터(ROOM-10·25). 연결 상태 + 내 로컬 참가자의 LiveKit 품질을 통합 표시.
// 트랙 A(최소 배선): 점 + 라벨만. 툴팁·펄스·재연결 깜박임 연출은 트랙 B 폴리시(NetworkStatusIndicator.md §G-264).
const TIER_COLOR: Record<NetTier, string> = {
  good: 'bg-green-500',
  fair: 'bg-fire-amber',
  poor: 'bg-fire-hot',
  connecting: 'bg-fire-amber',
  reconnecting: 'bg-fire-amber',
  offline: 'bg-stage-border',
  unknown: 'bg-stage-border',
}

// connecting/reconnecting 은 기존 연결상태 키 재사용(중복 카피 방지), 품질 3단계만 신규 키.
const TIER_LABEL_KEY: Record<NetTier, string> = {
  good: 'room.net.good',
  fair: 'room.net.fair',
  poor: 'room.net.poor',
  connecting: 'room.connecting',
  reconnecting: 'room.reconnecting',
  offline: 'room.net.offline',
  unknown: 'room.net.measuring',
}

export default function NetworkStatusIndicator() {
  const { t } = useTranslation()
  const connectionState = useRoomStore((s) => s.connectionState)
  const myQuality = useRoomStore((s) => s.participants.find((p) => p.isLocal)?.connectionQuality)
  const tier = netTier(connectionState, myQuality)

  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <span className={`h-2.5 w-2.5 rounded-full ${TIER_COLOR[tier]}`} />
      <span className="text-sm text-stage-text-muted">{t(TIER_LABEL_KEY[tier])}</span>
    </div>
  )
}
