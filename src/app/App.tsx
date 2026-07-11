import { useEffect } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { useConfigStore } from '@/stores/configStore'
import { useUserStore } from '@/stores/userStore'
import { usePresence } from '@/hooks/usePresence'
import ProtectedRoute from '@/components/shared/ProtectedRoute'
import MaintenanceBanner from '@/components/shared/MaintenanceBanner'
import ToastHost from '@/components/shared/ToastHost'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import LobbyPage from '@/pages/LobbyPage'
import TheaterPage from '@/pages/lobby/TheaterPage'
import WorkshopPage from '@/pages/lobby/WorkshopPage'
import TeahousePage from '@/pages/lobby/TeahousePage'
import AtelierPage from '@/pages/lobby/AtelierPage'
import AvatarForgeDevPage from '@/pages/AvatarForgeDevPage'
import GreenRoomPage from '@/pages/GreenRoomPage'
import RoomPage from '@/pages/RoomPage'
import AvatarInspectorPage from '@/pages/AvatarInspectorPage'
import StreamPage from '@/pages/StreamPage'
import LegalDoc from '@/pages/legal/LegalDoc'
import { PRIVACY, TERMS } from '@/pages/legal/content'

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
  // 법률 문서(공개·인증 불필요) — Google OAuth 동의화면 게시용. /privacy·/terms.
  { path: '/privacy', element: <LegalDoc doc={PRIVACY} /> },
  { path: '/terms', element: <LegalDoc doc={TERMS} /> },
  // 개발 도구 (인증 불필요 — rig 배포 검증용).
  { path: '/avatar-inspect', element: <AvatarInspectorPage /> }, // 임의 rig 네이티브 렌더 검사 (?project=)
  { path: '/stream', element: <StreamPage /> }, // 데스크톱 방송 앱(snack-streamer)용 풀스크린 웹캠 구동 아바타 (?project=&bg=)
  {
    path: '/lobby',
    element: (
      <ProtectedRoute>
        <LobbyPage />
      </ProtectedRoute>
    ),
  },
  // 로비 v3 내부 4관 — 광장 가게 클릭/모바일 하단 네비의 목적지(레거시 섹션 전가).
  { path: '/lobby/theater', element: <ProtectedRoute><TheaterPage /></ProtectedRoute> },
  { path: '/lobby/workshop', element: <ProtectedRoute><WorkshopPage /></ProtectedRoute> },
  { path: '/lobby/teahouse', element: <ProtectedRoute><TeahousePage /></ProtectedRoute> },
  { path: '/lobby/atelier', element: <ProtectedRoute><AtelierPage /></ProtectedRoute> },
  // 기능 수직 슬라이스 dev 트리거(PNG→Live2D 배선 검증) — UI/UX는 의상실에 나중 통합.
  { path: '/atelier-forge', element: <ProtectedRoute><AvatarForgeDevPage /></ProtectedRoute> },
  {
    // 분장실(MOD-05) — 입장 전 로컬 점검. cb.greenroomSkip 이면 페이지가 스스로 직행 리다이렉트.
    path: '/rooms/:roomId/ready',
    element: (
      <ProtectedRoute>
        <GreenRoomPage />
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
  // 설정은 의상실로 전가(로비 v3) — 기존 링크 호환용 리다이렉트만 유지.
  { path: '/settings', element: <Navigate to="/lobby/atelier" replace /> },
])

export default function App() {
  const loadConfig = useConfigStore((s) => s.loadConfig)
  const subscribeRealtime = useConfigStore((s) => s.subscribeRealtime)
  const initAuth = useUserStore((s) => s.init)
  usePresence() // 접속 heartbeat(PROFILE-04·DP-1) — 본인 users.last_active_at 주기 갱신, 친구 online 은 list-friends 서버 판정

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
