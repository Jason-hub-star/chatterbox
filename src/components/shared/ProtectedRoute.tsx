import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useUserStore } from '@/stores/userStore'

// SSOT: contracts/AuthPage.md MUST NOT — 인증 없이 /lobby·/models·/rooms/:id 접근 금지.
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const session = useUserStore((s) => s.session)
  const ready = useUserStore((s) => s.ready)
  const location = useLocation()

  // getSession 복원 완료 전엔 판단 보류 — 새로고침 시 깜빡 리다이렉트 방지.
  if (!ready) return null
  if (!session) {
    // search 포함 — 초대링크(/lobby?invite=…)처럼 쿼리가 자격인 진입이 로그인 후에도 살아남게(LOB-05).
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <>{children}</>
}
