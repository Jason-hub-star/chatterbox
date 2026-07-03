import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { useConfigStore } from '@/stores/configStore'
import { useUserStore } from '@/stores/userStore'
import ProtectedRoute from '@/components/shared/ProtectedRoute'
import MaintenanceBanner from '@/components/shared/MaintenanceBanner'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import LobbyPage from '@/pages/LobbyPage'
import RoomPage from '@/pages/RoomPage'
import SettingsPage from '@/pages/SettingsPage'
import AvatarPocPage from '@/pages/AvatarPocPage'
import AriaPocPage from '@/pages/AriaPocPage'
import AvatarInspectorPage from '@/pages/AvatarInspectorPage'
import AriaSelfPage from '@/pages/AriaSelfPage'

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  // Phase 1 PoC: 표정 트래킹 (인증 불필요 — 데모/테스트용).
  { path: '/avatar-poc', element: <AvatarPocPage /> }, // 절차적 얼굴
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
    </>
  )
}
