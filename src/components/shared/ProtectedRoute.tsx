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
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
