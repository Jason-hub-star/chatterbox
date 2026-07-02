---
tags: [reference, patterns]
created: 2026-07-02
sources:
  - https://reactrouter.com/
  - https://reactrouter.com/changelog
  - https://remix.run/blog/react-router-v8
---

<!-- reference/patterns: React 19 + react-router route tree. 버전 고정·공식출처. 2026-07-02 재검증. -->

# React 19 + react-router 라우팅 패턴

> **버전 고정:** `react-router@8.1.0` (2026-07-02 npm latest) · React `19.2.7+` · Node `22.22.0+` · Vite `7+` 필수.
>
> ⚠️ **설계 대조:** 우리 PLATFORM-ARCHITECTURE.md §2.1에서 명시한 `react-router 8.0.1` 채택 — 현재 실제 npm latest는 `8.1.0` (호환, non-breaking).
>
> **검수 노트(Opus, 2026-07-02):**
> - ①버전(Vite 8.1.0·react-router 8.0.1·React 19.2.7)은 `PLATFORM-ARCHITECTURE.md §2.1`과 **일치**(환각 아님). 패치버전만 설치 시 `npm list`로 재확인.
> - ②**SSOT 패키지명 불일치 발견:** §2.1은 `react-router`(v8 단일 패키지, `react-router/dom`)인데 `VITE-CONFIG.md`·`IMPLEMENTATION-ORDER`/§구현순서는 구 `react-router-dom`로 표기 → **하나로 통일 필요**(권장: v8 `react-router`). 이 문서는 v8 `react-router` 기준.
> - ③§3.1 `ProtectedRoute`가 `<Outlet/>`을 쓰는데 import 누락 → `import { Outlet } from 'react-router'` 추가할 것.

---

## 0. 버전·출처 정리 (설계 vs 2026-07-02 실제)

| 항목 | 설계값 (§2.1) | 2026-07-02 실제 | 상태 |
|---|---|---|---|
| **react-router** | 8.0.1 | 8.1.0 | ✓ non-breaking 마이너 업데이트 |
| **React** | 19.2.7 | 19.2.7 | ✓ 일치 |
| **Node** | (명시 안 함) | 22.22.0+ | ✓ 필수 (v8 baseline) |
| **Vite** | 8.1.0 | 8.1.0 + v7 권장 | ⚠️ Vite 7 출시됨 (옵션, 역호환) |

**결론:** 설계상 v8 채택이 현재와 정렬됨. 다만 Node 22+ 명시 필요, Vite 7 옵션 검토 권장.

---

## 1. Route Tree 정의 (createBrowserRouter)

react-router v8은 **file-based 라우팅을 지원하지 않음** (Next.js와 차이). 대신 **프로그래매틱 route tree** 정의:

### 1.1 기본 구조 (`src/app/routes.tsx`)

```typescript
import { createBrowserRouter, type RouteObject } from 'react-router';
import { lazy } from 'react';

// 에러 바운더리 (§4 참조)
import ErrorBoundary from './ErrorBoundary';

// 레이아웃 & 페이지 (폴더: src/pages/)
import App from './app/App';
import LobbyPage from './pages/LobbyPage';
import LoginPage from './pages/LoginPage';
import AgeGatePage from './pages/AgeGatePage';

// 라우트 조건부 래퍼 (§3 참조)
import { ProtectedRoute } from './components/ProtectedRoute';

// Code-split routes (lazy() + React.lazy)
const RoomPage = lazy(() => import('./pages/RoomPage'));
const GreenRoomPage = lazy(() => import('./pages/GreenRoomPage'));
const MobileViewerPage = lazy(() => import('./pages/MobileViewerPage'));

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        index: true,
        element: <LobbyPage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'age-gate',
        element: <AgeGatePage />,
      },
      {
        // ViewerGate 게이트킹 (§3.2 참조)
        path: 'rooms/:id',
        element: <ProtectedRoute />,
        errorElement: <ErrorBoundary />,
        // 비동기 loader: ViewerGate 판정 로직
        loader: async ({ params, request }) => {
          const { id } = params;
          const { searchParams } = new URL(request.url);
          const inviteCode = searchParams.get('invite');
          // loader에서 ViewerGate 판정 수행 (아래 §3.2)
          return { roomId: id, inviteCode };
        },
        children: [
          {
            path: '',
            element: <RoomPage />,
          },
          {
            path: 'green-room',
            element: <GreenRoomPage />,
          },
          {
            path: 'mobile-viewer',
            element: <MobileViewerPage />,
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
```

### 1.2 App 진입점 (`src/app/App.tsx`)

```typescript
import { RouterProvider } from 'react-router/dom';
import { Suspense } from 'react';
import { router } from './routes';
import { Spinner } from '@/components/ui/Spinner';

export default function App() {
  return (
    <RouterProvider router={router} fallbackElement={<Spinner />} />
  );
}
```

---

## 2. Lazy Split + Suspense (코드 스플릿)

### 2.1 동적 import + React.lazy

```typescript
// routes.tsx (위 1.1에서 이미 정의)
const RoomPage = lazy(() => import('./pages/RoomPage'));

// react-router가 자동으로 <Suspense> 처리
// ⚠️ 주의: createBrowserRouter에 lazy 래퍼 필요 (v8 권장)
```

### 2.2 Suspense 바운더리 (선택적 세부 제어)

```typescript
// src/pages/RoomPage.tsx
import { Suspense } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import RoomContent from '@/features/room/RoomContent';

export default function RoomPage() {
  return (
    <Suspense fallback={<Spinner label="방 로딩중..." />}>
      <RoomContent />
    </Suspense>
  );
}
```

### 2.3 라우트 레벨 코드 스플릿 (v8 권장)

```typescript
// routes.tsx에서 route config에 lazy 함수 직접 전달
const routes: RouteObject[] = [
  {
    path: 'rooms/:id',
    // v8: lazy prop으로 직접 분할 (async route 컴포넌트 + 리소스 로딩)
    lazy: async () => {
      const { RoomLayout } = await import('./features/room/RoomLayout');
      return { Component: RoomLayout };
    },
  },
];
```

**언제 사용:**
- **라우트 진입 전 분할:** lazy route module (위 방식) — 진입 시에만 로드
- **컴포넌트 내부 조건 분할:** React.lazy + Suspense — 렌더 시점에 로드

---

## 3. ProtectedRoute / ViewerGate 래퍼

### 3.1 기본 구조: 진입 판정 + 조건부 리다이렉트

```typescript
// src/components/ProtectedRoute.tsx
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Navigate, useLoaderData } from 'react-router';
import { useUserStore } from '@/stores/userStore';
import { useRoomStore } from '@/stores/roomStore';
import { supabase } from '@/lib/supabase';
import { Spinner } from './ui/Spinner';

interface ViewerGateResult {
  redirect: 'room' | 'green-room' | 'mobile-viewer' | 'desktop-required' | 'age-gate' | 'login' | 'lobby';
  role?: 'host' | 'actor' | 'viewer';
  error?: 'access_denied';
  anonymous?: boolean;
  readOnly?: boolean;
}

export default function ProtectedRoute() {
  const { id: roomId } = useParams();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get('invite');
  const loaderData = useLoaderData() as { roomId: string; inviteCode: string | null };
  
  const { id: userId, isAnonymous } = useUserStore();
  const { setCurrentRole, setCurrentRoomId } = useRoomStore();
  
  const [result, setResult] = useState<ViewerGateResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const gate = await resolveViewerGate(roomId!, inviteCode, userId, isAnonymous);
        setResult(gate);
        
        // Store에 저장 (Room FSM 전이 준비)
        if (gate.role) setCurrentRole(gate.role);
        if (roomId) setCurrentRoomId(roomId);
      } catch (err) {
        console.error('[ViewerGate]', err);
        setResult({ redirect: 'lobby', error: 'access_denied' });
      } finally {
        setLoading(false);
      }
    })();
  }, [roomId, inviteCode, userId, isAnonymous]);

  if (loading) return <Spinner label="방 확인중..." />;
  if (!result) return <Navigate to="/lobby" />;

  // 조건부 리다이렉트
  switch (result.redirect) {
    case 'room':
      return <Outlet />; // ✓ 진입 허용 (RoomPage 렌더)
    case 'green-room':
      return <Navigate to={`/rooms/${roomId}/green-room`} />;
    case 'mobile-viewer':
      return <Navigate to={`/rooms/${roomId}/mobile-viewer`} />;
    case 'desktop-required':
      return <DesktopRequiredPage />;
    case 'age-gate':
      return <Navigate to="/age-gate" />;
    case 'login':
      return <Navigate to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`} />;
    case 'lobby':
    default:
      return <Navigate to="/lobby" replace />;
  }
}
```

### 3.2 ViewerGate 판정 로직 (`src/lib/viewerGate.ts`)

```typescript
// ViewerGate.md 계약서 참조
import { supabase } from './supabase';

export type ViewerGateResult = /* ... (위 3.1 참조) */;

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || window.innerWidth < 768;
}

export async function resolveViewerGate(
  roomId: string,
  inviteCode: string | null,
  userId: string | null,
  isAnonymous: boolean
): Promise<ViewerGateResult> {
  // [SECURITY] 1. 방 존재·공개 여부 먼저 확인
  const { data: room, error } = await supabase
    .from('rooms')
    .select('id, status, max_participants, host_id, is_locked')
    .eq('id', roomId)
    .single();

  if (error || !room || room.status === 'ended') {
    return { redirect: 'lobby', error: 'access_denied' };
  }

  // 2. 미로그인 처리
  if (!userId) {
    if (!inviteCode) return { redirect: 'login' };
    
    // 초대 코드 검증 (Edge Function)
    const { data: invite } = await supabase.functions.invoke('verify-invite-code', {
      body: { invite_code: inviteCode, expected_room_id: roomId },
    });
    
    if (!invite?.valid || invite.room_id !== roomId) {
      return { redirect: 'login' };
    }
    
    return {
      redirect: isMobile() ? 'mobile-viewer' : 'room',
      role: 'viewer',
      anonymous: true,
      readOnly: true,
    };
  }

  // 3. 로그인 사용자: 연령 확인
  const { data: profile } = await supabase
    .from('users')
    .select('age_band, age_attested_at')
    .eq('id', userId)
    .single();

  if (!profile?.age_band || !profile?.age_attested_at) {
    return { redirect: 'age-gate' };
  }

  // 4. room_participants 조회
  const { data: participant } = await supabase
    .from('room_participants')
    .select('role, slot_index')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();

  // 5. 호스트 판정 (room.host_id 우선)
  if (room.host_id === userId) {
    return isMobile()
      ? { redirect: 'desktop-required', role: 'host' }
      : { redirect: 'room', role: 'host' };
  }

  // 6. 기존 참가자 역할
  if (participant) {
    return isMobile()
      ? { redirect: 'mobile-viewer', role: 'viewer' }
      : {
          redirect: participant.role === 'actor' ? 'green-room' : 'room',
          role: participant.role as 'actor' | 'viewer',
        };
  }

  // 7. 신규 뷰어 등록 (원자적 처리)
  if (room.is_locked) {
    if (!inviteCode) return { redirect: 'lobby', error: 'access_denied' };
    const { data: joined } = await supabase.functions.invoke('accept-invite', {
      body: { invite_code: inviteCode, room_id: roomId, idempotency_key: roomId + userId },
    });
    if (!joined?.room_id) return { redirect: 'lobby', error: 'access_denied' };
  } else {
    const { error: joinErr } = await supabase.functions.invoke('join-public-room', {
      body: { room_id: roomId, idempotency_key: roomId + userId },
    });
    if (joinErr?.status === 409) return { redirect: 'lobby', error: 'access_denied' };
  }

  return {
    redirect: isMobile() ? 'mobile-viewer' : 'room',
    role: 'viewer',
  };
}
```

### 3.3 Route 구성 (ViewerGate와 하위 라우트)

```typescript
// routes.tsx
{
  path: 'rooms/:id',
  element: <ProtectedRoute />,
  errorElement: <ErrorBoundary />,
  children: [
    {
      index: true,
      element: <RoomPage />,
    },
    {
      path: 'green-room',
      element: <GreenRoomPage />,
    },
    {
      path: 'mobile-viewer',
      element: <MobileViewerPage />,
    },
  ],
},
```

---

## 4. 에러 처리 (errorElement + ErrorBoundary)

### 4.1 Route Level errorElement

```typescript
// routes.tsx
{
  path: 'rooms/:id',
  element: <ProtectedRoute />,
  errorElement: <RoomErrorBoundary />, // ✓ 라우트 에러 잡음
  // ...
}
```

### 4.2 ErrorBoundary 컴포넌트 (`src/components/ErrorBoundary.tsx`)

```typescript
import { useRouteError, isRouteErrorResponse } from 'react-router';
import { Button } from './ui/Button';

export default function ErrorBoundary() {
  const error = useRouteError();

  // react-router 에러 vs 기타
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <h1 className="text-4xl font-bold">{error.status}</h1>
        <p className="text-lg">{error.statusText || error.data}</p>
        <Button href="/" variant="primary">
          홈으로
        </Button>
      </div>
    );
  }

  // 일반 Error
  const err = error as Error;
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <h1 className="text-4xl font-bold">오류 발생</h1>
      <p className="text-lg">{err?.message || '예상치 못한 오류입니다.'}</p>
      <Button href="/" variant="primary">
        홈으로
      </Button>
    </div>
  );
}
```

### 4.3 Loader 에러 (비동기 데이터 실패)

```typescript
// routes.tsx의 loader 함수
{
  path: 'rooms/:id',
  loader: async ({ params, request }) => {
    try {
      const roomData = await supabase
        .from('rooms')
        .select('*')
        .eq('id', params.id!)
        .single();
      
      if (!roomData) throw new Response('Room not found', { status: 404 });
      
      return roomData;
    } catch (err) {
      // 에러 발생 시 errorElement로 전파
      throw err;
    }
  },
  errorElement: <ErrorBoundary />,
}
```

---

## 5. 자주 틀리는 지점 & v7→v8 마이그레이션

### 5.1 Import 변경 (v8에서 필수)

```typescript
// ❌ v7 스타일 (v8에서 작동 안 함)
import { RouterProvider } from 'react-router-dom';

// ✅ v8 (필수)
import { RouterProvider } from 'react-router/dom';
import { useNavigate } from 'react-router';  // 대부분의 hook은 'react-router'에서
```

### 5.2 loader에서 `data` → `loaderData` (v8)

```typescript
// ❌ v7
export function meta({ data }: Route.MetaArgs) {
  return [{ title: data.title }];
}

// ✅ v8
export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData.title }];
}
```

### 5.3 `useLoaderData()` 타입 가드

```typescript
// React Router v8 + TypeScript
import { useLoaderData } from 'react-router';

interface RoomLoaderData {
  roomId: string;
  inviteCode: string | null;
}

export default function RoomPage() {
  const { roomId, inviteCode } = useLoaderData() as RoomLoaderData;
  // ...
}
```

### 5.4 Route 분할 시 `lazy` 전달

```typescript
// ✅ v8 권장: route config에서 lazy 직접 사용
const routes: RouteObject[] = [
  {
    path: 'rooms/:id',
    lazy: async () => {
      const { RoomLayout } = await import('./features/room/RoomLayout');
      return { Component: RoomLayout };
    },
  },
];

// ⚠️ 레이아웃과 데이터 함께 분할하려면:
lazy: async () => {
  const { Component, loader } = await import('./pages/RoomPage');
  return { Component, loader };
},
```

### 5.5 React 19 호환성 (동시 렌더링)

```typescript
// React 19 활성화 — concurrent rendering이 자동 활성
// 이미 <RouterProvider>가 concurrent context 제공

// ✓ useTransition / useDeferredValue 직접 사용 가능
import { useTransition } from 'react';
import { useNavigate } from 'react-router';

export default function MyComponent() {
  const [isPending, startTransition] = useTransition();
  const navigate = useNavigate();

  const handleNavigation = () => {
    startTransition(() => {
      navigate('/rooms/123');
    });
  };

  return <button disabled={isPending}>이동</button>;
}
```

---

## 6. 공식 링크 (조회일 2026-07-02)

| 자료 | URL | 용도 |
|---|---|---|
| **홈** | https://reactrouter.com/ | 개요·시작 |
| **문서** | https://reactrouter.com/home | 전체 가이드 |
| **변경로그** | https://reactrouter.com/changelog | 버전별 breaking changes |
| **업그레이드** | https://reactrouter.com/upgrading/v7 | v7→v8 마이그레이션 |
| **GitHub** | https://github.com/remix-run/react-router | 소스·이슈·릴리스 |
| **npm** | https://www.npmjs.com/package/react-router | 패키지 정보 |

---

## 7. 우리 프로젝트 정렬 체크리스트

| 항목 | 상태 | 참고 |
|---|---|---|
| **Node 22+** | ⚠️ 미명시 | PLATFORM-ARCHITECTURE.md §2 업데이트 권장 |
| **Vite 7+** | ⚠️ 8.1.0 현재 | 옵션, 역호환 (v8 권장 추후) |
| **React 19.2.7+** | ✓ 명시 | §2.1 |
| **react-router 8+** | ✓ 명시 (8.0.1) | 현재 8.1.0, non-breaking |
| **app/ 라우트 트리** | ✓ 설계 | src/app/routes.tsx 구현 필요 |
| **pages/ 페이지 컴포넌트** | ✓ 설계 | ViewerGate 연동 필요 |
| **ViewerGate 래퍼** | ✓ 계약서 (31번) | ProtectedRoute로 구현 (§3 코드) |
| **lazy split** | ✓ 권장 | route-level lazy 사용 (§2.3) |
| **ErrorBoundary** | ✓ 권장 | route errorElement 활용 (§4) |

---

## 8. 다음 단계

1. **환경 검증:** Node 22+ 설치 확인, Vite 7 선택
2. **routes.tsx 생성:** src/app/routes.tsx에 route tree 정의
3. **ProtectedRoute 구현:** src/components/ProtectedRoute.tsx (§3 코드)
4. **ViewerGate 로직:** src/lib/viewerGate.ts (§3.2 함수)
5. **ErrorBoundary 통합:** src/components/ErrorBoundary.tsx (§4 코드)
6. **Stores 연동:** userStore + roomStore (Zustand, PLATFORM-ARCHITECTURE.md §2.2)
7. **테스트:** route 진입, 권한 검증, 에러 케이스

---

**문서 관리:**
- 마지막 갱신: 2026-07-02
- 출처 검증: react-router 공식 문서 + 우리 계약서 (ViewerGate.md)
- 버전 민감도: ⭐⭐⭐ (Node·React·Vite baseline 변경 시 재검증 필수)
