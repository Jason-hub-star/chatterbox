import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { useConfigStore } from '@/stores/configStore'
import LandingPage from '@/pages/LandingPage'
import LobbyPage from '@/pages/LobbyPage'
import RoomPage from '@/pages/RoomPage'
import SettingsPage from '@/pages/SettingsPage'

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/lobby', element: <LobbyPage /> },
  { path: '/rooms/:roomId', element: <RoomPage /> },
  { path: '/settings', element: <SettingsPage /> },
])

export default function App() {
  const loadConfig = useConfigStore((s) => s.loadConfig)
  const subscribeRealtime = useConfigStore((s) => s.subscribeRealtime)

  useEffect(() => {
    loadConfig()
    return subscribeRealtime()
  }, [loadConfig, subscribeRealtime])

  return <RouterProvider router={router} />
}
