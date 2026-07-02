import { useConfigStore } from '@/stores/configStore'

// SSOT: MILESTONES 검증 시나리오 2 — MAINTENANCE_MODE=true → 점검 배너 즉시 노출 (Realtime).
// config.MAINTENANCE_MODE 는 configStore.subscribeRealtime 이 postgres_changes 로 실시간 갱신한다.
export default function MaintenanceBanner() {
  const maintenance = useConfigStore((s) => s.config.MAINTENANCE_MODE)
  if (!maintenance) return null
  return (
    <div role="status" className="bg-fire-hot px-4 py-2 text-center text-sm font-medium text-stage-text">
      점검 중입니다. 잠시 후 다시 시도해주세요.
    </div>
  )
}
