import { useEffect } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { useConfigStore } from '@/stores/configStore'
import { useUserStore } from '@/stores/userStore'
import ProtectedRoute from '@/components/shared/ProtectedRoute'
import MaintenanceBanner from '@/components/shared/MaintenanceBanner'
import ToastHost from '@/components/shared/ToastHost'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import LobbyPage from '@/pages/LobbyPage'
import RoomPage from '@/pages/RoomPage'
import SettingsPage from '@/pages/SettingsPage'
import AriaPocPage from '@/pages/AriaPocPage'
import AvatarInspectorPage from '@/pages/AvatarInspectorPage'
import AriaSelfPage from '@/pages/AriaSelfPage'

// 앱 진입점 — 마케팅 랜딩은 외부 snack-web 이 담당(2026-07-08 인앱 랜딩 폐지).
// 게임 런처식: 세션 있으면 바로 로비, 없으면 로그인. 로그아웃 navigate('/')·설정 홈 링크도 이 관문을 지난다.
function HomeRedirect() {
  const ready = useUserStore((s) => s.ready)
  const authState = useUserStore((s) => s.authState)
  if (!ready) return null // 세션 복원 판정 전 깜빡 리다이렉트 방지(ProtectedRoute 와 동일 게이트)
  return <Navigate to={authState === 'AUTHENTICATED' ? '/lobby' : '/login'} replace />
}

const router = createBrowserRouter([
  { path: '/', element: <HomeRedirect /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/reset', element: <ResetPasswordPage /> }, // 비번 재설정 링크 착지점 (A-FUNC-2)
  // Phase 1 PoC: 표정 트래킹 (인증 불필요 — 데모/테스트용).
  { path: '/avatar-aria', element: <AriaPocPage /> }, // 실 rig(아리아) — iframe PoC
  { path: '/avatar-inspect', element: <AvatarInspectorPage /> }, // 실 rig 네이티브 이식 (경로 B, B1 게이트)
  { path: '/avatar-aria-self', element: <AriaSelfPage /> }, // 웹캠 → 네이티브 아리아 self drive (경로 B, B2)
  {
    path: '/lobby',
    element: (
      <ProtectedRoute>
        <LobbyPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/rooms/:roomId',
    element: (
      <ProtectedRoute>
        <RoomPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/settings',
    element: (
      <ProtectedRoute>
        <SettingsPage />
      </ProtectedRoute>
    ),
  },
])

export default function App() {
  const loadConfig = useConfigStore((s) => s.loadConfig)
  const subscribeRealtime = useConfigStore((s) => s.subscribeRealtime)
  const initAuth = useUserStore((s) => s.init)

  useEffect(() => {
    loadConfig()
    const unsubConfig = subscribeRealtime()
    const unsubAuth = initAuth()
    return () => {
      unsubConfig()
      unsubAuth()
    }
  }, [loadConfig, subscribeRealtime, initAuth])

  return (
    <>
      <MaintenanceBanner />
      <RouterProvider router={router} />
      <ToastHost />{/* toastStore 채널의 전역 표현부 — 라우터 밖이라 전 화면 공통 */}
    </>
  )
}
