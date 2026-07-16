import { useEffect } from 'react'
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router'
import { useConfigStore } from '@/stores/configStore'
import { useUserStore } from '@/stores/userStore'
import { usePresence } from '@/hooks/usePresence'
import ProtectedRoute from '@/components/shared/ProtectedRoute'
import GuestWatchGate from '@/components/shared/GuestWatchGate'
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

// 앱 진입점 — `/` = 공개 광장 홈(2026-07-16 개정, UIUX-OVERHAUL P1 — 구 게임 런처식 HomeRedirect 폐지).
// 마케팅 랜딩은 여전히 외부 snack-web 담당, 앱 홈은 치지직식 공개 디스커버리(비로그인 열람 + 관전 LOB-07).
// 기존 navigate('/lobby') 호출처 호환: 쿼리(?invite= 등) 보존 리다이렉트.
function LobbyRedirect() {
  const location = useLocation()
  return <Navigate to={{ pathname: '/', search: location.search }} replace />
}

const router = createBrowserRouter([
  { path: '/', element: <LobbyPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/reset', element: <ResetPasswordPage /> }, // 비번 재설정 링크 착지점 (A-FUNC-2)
  // 법률 문서(공개·인증 불필요) — Google OAuth 동의화면 게시용. /privacy·/terms.
  { path: '/privacy', element: <LegalDoc doc={PRIVACY} /> },
  { path: '/terms', element: <LegalDoc doc={TERMS} /> },
  // 개발 도구 (인증 불필요 — rig 배포 검증용).
  { path: '/avatar-inspect', element: <AvatarInspectorPage /> }, // 임의 rig 네이티브 렌더 검사 (?project=)
  { path: '/stream', element: <StreamPage /> }, // 데스크톱 방송 앱(snack-streamer)용 풀스크린 웹캠 구동 아바타 (?project=&bg=)
  // 구 광장 경로 — 공개 홈으로 흡수(쿼리 보존: 초대 링크 /lobby?invite= 가 살아남아야 함, LOB-05).
  { path: '/lobby', element: <LobbyRedirect /> },
  // 로비 v3 내부 4관 — 광장 가게 클릭/모바일 하단 네비의 목적지(레거시 섹션 전가).
  // 대극장은 비로그인 열람 허용(LOB-07) — 목록은 list-public-rooms, 생성·예약은 페이지 안에서 세션 게이트.
  { path: '/lobby/theater', element: <TheaterPage /> },
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
    // 게스트 관전 게이트(LOB-07): 세션 있으면 통과, 없으면 [게스트로 관전]→익명 세션→?watch=1 뷰어 조인.
    path: '/rooms/:roomId',
    element: (
      <GuestWatchGate>
        <RoomPage />
      </GuestWatchGate>
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
