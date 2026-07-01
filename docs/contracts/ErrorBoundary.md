---
tags: [contract]
---

# ErrorBoundary — React 에러 경계 전략

> Status: READY
> Updated: 2026-06-30
> Rule: React 19 에러 격리 및 Sentry 연동 전략. 앱 전체 1개(AppRoot) + 기능 단위 세분화 경계 + PII 필터 필수.

## 목적

React 에러 경계(error boundary)를 경계 레벨 5단계로 배치하여 한 컴포넌트의 오류가 전체 앱을 다운시키지 않도록 격리한다. 동시에 Sentry로 에러를 추적하되 `message.content`, `user.email`, `display_name` 등 PII를 필터링해 SecurityPolicies §17을 준수한다.

---

## Props Interface

```typescript
interface AppErrorBoundaryProps {
  children: React.ReactNode;
  boundaryName: 'app' | 'room' | 'chat' | 'vgen' | 'dub' | 'media';
  roomId?: string;
  onReset?: () => void;
}
```

## DataChannel 의존성

없음. ErrorBoundary는 DataChannel을 직접 발행/구독하지 않고, 하위 컴포넌트 장애를 격리한 뒤 Sentry와 로컬 errorStore에만 보고한다.

## §1 에러 경계 전략 개요

### 1.1 선택 방식

**React 19에서는 class component ErrorBoundary를 직접 구현하거나 `react-error-boundary` 라이브러리 사용 권장.** Vite + React 19 환경이므로 라이브러리 설치 (npm install react-error-boundary) 후 FallbackComponent + onError 콜백 조합 사용.

```typescript
// 예: react-error-boundary 기본 구조
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }: any) {
  return (
    <div role="alert">
      <h2>뭔가 잘못됐어요</h2>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>다시 시도</button>
    </div>
  );
}

export function AppRoot() {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, info) => {
        // Sentry 연동 (§4 참조)
        Sentry.captureException(error, {
          contexts: { react: { componentStack: info.componentStack } },
        });
      }}
    >
      <YourApp />
    </ErrorBoundary>
  );
}
```

### 1.2 경계 배치 원칙

| 레벨 | 범위 | 전파 규칙 | Sentry 보고 |
|---|---|---|---|
| **L1** | AppRoot (전체 앱) | 모든 미처리 에러를 catch | 무조건 보고 |
| **L2** | RoomView (방 전체) | WebRTC·PixiJS 오류 격리 | 보고 (room_id 태그) |
| **L3** | 기능별 (Chat, Vgen, Script, Media) | 패널·UI 오류 격리 | 보고 (component_name 태그) |
| **L4** | 라이브러리 레이어 (PixiJS, MediaPipe) | 렌더 오류 격리 | 보고 (error_type 태그) |
| **L5** | (예약) 향후 Zustand 스토어 에러 격리 | 스토어 구독 오류만 | 보고 후 상위 경계로 |

---

## §2 경계 배치 맵

### 2.1 AppRoot (L1 — 전체 앱 catch-all)

**역할**: 모든 미처리 에러를 캐치하여 사용자에게 흰 화면(WSOD)을 보이지 않게 함.

**범위**: `src/App.tsx` 최상단

**폴백 UI**:
- 전체 화면 오류 페이지
- "앱에 문제가 발생했습니다" + 재시도 버튼
- 지원 연락처 (support@example.com)
- 에러 세부 정보 (dev 환경만, prod는 일반 메시지)

```typescript
// src/App.tsx
export function App() {
  return (
    <ErrorBoundary
      FallbackComponent={AppErrorFallback}
      onError={(error, info) => {
        logErrorToProd(error, 'APP_ROOT', info.componentStack);
      }}
      onReset={() => window.location.href = '/'}
    >
      <AuthProvider>
        <RoomProvider>
          <MainRouter />
        </RoomProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppErrorFallback({ error, resetErrorBoundary }: any) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', minHeight: '100vh' }}>
      <h1>앱에 문제가 발생했습니다</h1>
      <p>다시 시도하거나 새로고침해주세요.</p>
      <button onClick={resetErrorBoundary}>재시도</button>
      <p style={{ marginTop: '2rem', fontSize: '0.875rem', color: '#999' }}>
        문제가 계속되면 support@example.com로 연락주세요.
      </p>
      {process.env.NODE_ENV === 'development' && (
        <pre style={{ textAlign: 'left', background: '#eee', padding: '1rem', marginTop: '1rem' }}>
          {error.message}
        </pre>
      )}
    </div>
  );
}
```

### 2.2 RoomView (L2 — 방 전체)

**역할**: WebRTC, PixiJS, LiveKit 연결 오류를 격리. 이 경계 내 오류가 로비나 다른 방으로 영향을 주지 않게 함.

**범위**: `src/components/RoomView/index.tsx`

**폴백 UI**:
- "방 연결이 끊어졌습니다" 메시지
- "로비로 돌아가기" 버튼 (로비 페이지로 navigate)
- 재시도 버튼 (현재 방 다시 입장)

```typescript
// src/components/RoomView/ErrorBoundary.tsx
function RoomErrorFallback({ error, resetErrorBoundary, roomId }: any) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>방 연결에 문제가 있습니다</h2>
      <p>{error.message}</p>
      <button onClick={resetErrorBoundary}>다시 연결</button>
      <button onClick={() => navigate('/lobby')}>로비로 돌아가기</button>
    </div>
  );
}

export function RoomViewBoundary({ roomId, children }: any) {
  return (
    <ErrorBoundary
      FallbackComponent={(props) => <RoomErrorFallback {...props} roomId={roomId} />}
      onError={(error, info) => {
        logErrorToProd(error, 'ROOM_VIEW', info.componentStack, { room_id: roomId });
      }}
      onReset={() => window.location.reload()}
    >
      {children}
    </ErrorBoundary>
  );
}
```

### 2.3 PixiCanvas / AvatarCanvas (L3 — WebGL 컨텍스트)

**역할**: PixiJS 렌더링 오류, WebGL 컨텍스트 손실 격리.

**폴백 UI**: "아바타 렌더링에 문제가 있습니다 — 다시 시도" (재시도 버튼, 방은 유지)

```typescript
// src/components/AvatarCanvas/ErrorBoundary.tsx
function CanvasErrorFallback({ error, resetErrorBoundary }: any) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '0.875rem' }}>아바타 렌더링 오류</p>
        <button onClick={resetErrorBoundary}>다시 시도</button>
      </div>
    </div>
  );
}

export function AvatarCanvasBoundary({ children }: any) {
  return (
    <ErrorBoundary
      FallbackComponent={CanvasErrorFallback}
      onError={(error, info) => {
        logErrorToProd(error, 'AVATAR_CANVAS', info.componentStack, { error_type: 'WebGL' });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
```

### 2.4 ChatPanel (L3 — 채팅)

**역할**: 채팅 메시지 렌더, 데이터 구독 오류가 방 전체를 다운시키지 않게 함.

**폴백 UI**: "채팅을 불러올 수 없습니다 — 다시 시도" (패널 크기 유지, 인라인 메시지)

```typescript
// src/components/ChatPanel/ErrorBoundary.tsx
export function ChatPanelBoundary({ children }: any) {
  return (
    <ErrorBoundary
      FallbackComponent={() => <div>채팅 오류. <button>재시도</button></div>}
      onError={(error, info) => {
        logErrorToProd(error, 'CHAT_PANEL', info.componentStack);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
```

### 2.5 VgenPanel (L3 — AI 비디오 생성)

**역할**: Fal.ai 요청, 비디오 생성 폴링 오류 격리.

**폴백 UI**: "생성에 실패했습니다" + "새로 생성" 버튼 (생성 큐는 유지, 다시 시도 가능)

```typescript
// src/components/VgenPanel/ErrorBoundary.tsx
export function VgenPanelBoundary({ children }: any) {
  return (
    <ErrorBoundary
      FallbackComponent={() => (
        <div>
          <p>비디오 생성 중 오류가 발생했습니다</p>
          <button>새로 생성</button>
        </div>
      )}
      onError={(error, info) => {
        logErrorToProd(error, 'VGEN_PANEL', info.componentStack, { error_type: 'VideoGeneration' });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
```

### 2.6 ScriptPanel (L3 — 대본)

**역할**: 대본 렌더, 스크립트 파싱 오류.

**폴백 UI**: "대본을 불러올 수 없습니다" + "다시 로드" 버튼

### 2.7 DubRecorder (L3 — 음성 더빙)

**역할**: MediaRecorder API 오류, 오디오 스트림 오류 격리.

**폴백 UI**: "녹음 중 문제가 발생했습니다" + "녹음 중단" 버튼 (더빙 세션은 유지)

### 2.8 MediaPipeTracker (L3 — 얼굴 트래킹)

**역할**: MediaPipe 모델 로딩 실패, 카메라 접근 오류 격리.

**폴백 UI**: "트래킹을 사용할 수 없습니다 — 수동 조정 사용" (애니메이션은 아바타 기본 포즈 사용)

---

## §3 폴백 UI 표준

### 3.1 일반 규칙

| 항목 | 요구사항 |
|---|---|
| **크기 유지** | 폴백이 원래 컴포넌트 공간을 유지 (레이아웃 깨짐 금지) |
| **의존성** | Zustand, Context, 외부 API 접근 금지 (순수 UI만) |
| **버튼** | "재시도" (resetErrorBoundary) / "돌아가기" (navigate) 2개 최대 |
| **메시지** | 사용자 친화적 + 간단함 (기술 용어 최소) |
| **Dev 전용** | 에러 세부 정보는 process.env.NODE_ENV === 'development'에서만 |

### 3.2 폴백 레벨별 예시

**L1 AppRoot 폴백** (전체 화면, dev info 포함)
```
앱에 문제가 발생했습니다
다시 시도하거나 새로고침해주세요.

[재시도 버튼]

문제가 계속되면 support@example.com로 연락주세요.
```

**L2 RoomView 폴백** (방 영역 전체, nav 포함)
```
방 연결에 문제가 있습니다

[다시 연결 버튼] [로비로 돌아가기 버튼]
```

**L3 ChatPanel 폴백** (패널 크기 유지, 인라인)
```
채팅을 불러올 수 없습니다
[재시도 버튼]
```

---

### 3.3 에러코드별 사용자 친화 메시지 (G-263)

**원칙**: 기술 용어 없이 한국어 안내문으로 변환. 폴백 UI에서 `error.message` 직렬화 금지, 아래 매핑표 사용.

| 에러코드 | 사용자 메시지 | 권장 액션 | 표시 위치 |
|---|---|---|---|
| `PERMISSION_DENIED` | 접근 권한이 없습니다. 호스트에게 문의하세요. | [호스트 문의] / [로비로] | L2/L3 토스트 |
| `ROOM_NOT_FOUND` | 방이 더 이상 존재하지 않습니다. 로비로 돌아가세요. | [로비로 돌아가기] | L2 폴백 모달 |
| `ROOM_FULL` | 입장 가능한 자리가 없습니다. 시간이 지나 다시 시도해주세요. | [로비로] | L2 폴백 |
| `UNAUTHORIZED` | 인증에 실패했습니다. 다시 로그인해주세요. | [로그인 화면으로] | L1 AppRoot |
| `TOKEN_EXPIRED` | 세션이 만료됐습니다. 다시 입장해주세요. | [재입장] | L2 폴백 |
| `NETWORK_TIMEOUT` | 네트워크가 응답하지 않습니다. 연결을 확인하고 다시 시도해주세요. | [재시도] | L2 모달 + 타이머 |
| `INTERNAL_SERVER_ERROR` | 서버에 일시적 문제가 발생했습니다. 잠시 후 다시 시도해주세요. | [재시도] | 토스트 |

**구현 예시**:
```typescript
// src/utils/errorMessages.ts
const ERROR_CODE_MAP: Record<string, { message: string; action: string }> = {
  PERMISSION_DENIED: {
    message: '접근 권한이 없습니다. 호스트에게 문의하세요.',
    action: 'contact_host'
  },
  ROOM_NOT_FOUND: {
    message: '방이 더 이상 존재하지 않습니다. 로비로 돌아가세요.',
    action: 'back_to_lobby'
  },
  ROOM_FULL: {
    message: '입장 가능한 자리가 없습니다. 시간이 지나 다시 시도해주세요.',
    action: 'back_to_lobby'
  },
  UNAUTHORIZED: {
    message: '인증에 실패했습니다. 다시 로그인해주세요.',
    action: 'logout'
  },
  TOKEN_EXPIRED: {
    message: '세션이 만료됐습니다. 다시 입장해주세요.',
    action: 'rejoin'
  },
  NETWORK_TIMEOUT: {
    message: '네트워크가 응답하지 않습니다. 연결을 확인하고 다시 시도해주세요.',
    action: 'retry'
  },
  INTERNAL_SERVER_ERROR: {
    message: '서버에 일시적 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
    action: 'retry'
  }
};

export function getUserFriendlyErrorMessage(errorCode: string | null): string {
  if (!errorCode) {
    return '알 수 없는 오류가 발생했습니다. 다시 시도해주세요.';
  }
  return ERROR_CODE_MAP[errorCode]?.message ?? '일시적 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
}
```

**폴백 UI에서 사용**:
```typescript
function RoomErrorFallback({ error, resetErrorBoundary, roomId }: any) {
  const errorCode = error.code || 'UNKNOWN'; // error.code 필드가 있어야 함
  const userMessage = getUserFriendlyErrorMessage(errorCode);
  
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>방 연결에 문제가 있습니다</h2>
      <p>{userMessage}</p>  {/* ← error.message 사용 금지, 매핑값 사용 */}
      <button onClick={resetErrorBoundary}>다시 연결</button>
      <button onClick={() => navigate('/lobby')}>로비로 돌아가기</button>
    </div>
  );
}
```

---

## §4 Sentry 연동

### 4.1 기본 설정

```typescript
// src/utils/sentry.ts
import * as Sentry from '@sentry/react';

export function initSentry() {
  if (process.env.NODE_ENV === 'production') {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      integrations: [
        new Sentry.Replay({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      beforeSend(event) {
        return sanitizeSentryEvent(event);
      },
    });
  }
}

export function logErrorToProd(
  error: Error,
  boundary: string,
  componentStack: string,
  tags?: Record<string, string>
) {
  console.error(`[${boundary}]`, error, componentStack);
  
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureException(error, {
      tags: {
        boundary_name: boundary,
        ...tags,
      },
      contexts: {
        react: { componentStack },
      },
    });
  }
}
```

### 4.2 PII 필터 (SecurityPolicies §17 준수)

**반드시 제거할 필드**: `message.content`, `user.email`, `user.display_name`, `room.name` (민감 데이터)

```typescript
// src/utils/sentry.ts — 계속
function sanitizeSentryEvent(event: Sentry.Event): Sentry.Event | null {
  if (!event) return event;
  
  // message.content 제거
  if (event.message) {
    event.message = '[REDACTED]';
  }
  
  // contexts에서 user 정보 제거
  if (event.contexts?.user) {
    delete event.contexts.user.email;
    delete event.contexts.user.display_name;
  }
  
  // extra에서 민감 정보 제거
  if (event.extra) {
    if (event.extra.message_content) {
      event.extra.message_content = '[REDACTED]';
    }
    if (event.extra.room_name) {
      event.extra.room_name = '[REDACTED]';
    }
  }
  
  return event;
}
```

### 4.3 에러 컨텍스트 태그

각 경계에서 Sentry로 전송할 때 다음 태그 필수:

| 태그 | 예시 | 용도 |
|---|---|---|
| `boundary_name` | `APP_ROOT`, `ROOM_VIEW`, `CHAT_PANEL` | 어느 경계에서 발생했는가 |
| `component_name` | `AvatarCanvas`, `VgenPanel`, `ScriptPanel` | 어떤 컴포넌트의 오류인가 |
| `error_type` | `WebGL`, `VideoGeneration`, `MediaRecorder` | 오류 분류 |
| `room_id` | UUID (민감 아님) | 방 추적 |
| `feature_id` | `MOD-03`, `VGEN-04` | 기능 ID 매핑 |

### 4.4 Dev 환경 정책

- **Dev**: console.error만 출력 (Sentry 전송 금지, 개발자 방해 방지)
- **Prod**: console.error + Sentry 전송

---

## §5 reset 메커니즘

### 5.1 reset 트리거

사용자가 폴백에서 "재시도" 버튼을 클릭할 때:

```typescript
function resetErrorBoundary() {
  // 에러 경계 state 초기화
  // 에러 경계는 자동으로 렌더 재시도
}
```

react-error-boundary는 `resetErrorBoundary()` 콜백을 자동 제공. 수동으로 특정 Zustand 스토어를 리셋할 필요는 일반적으로 없음.

### 5.2 범위별 리셋 정책

| 경계 | reset 범위 | 스토어 리셋 |
|---|---|---|
| **L1 AppRoot** | 전체 렌더 트리 | 없음 (window.location.href = '/') |
| **L2 RoomView** | 방 컴포넌트 트리만 | 없음 (방 재입장 시 자동 초기화) |
| **L3 ChatPanel** | 채팅 패널만 | 없음 (메시지 쿼리 재시작) |
| **L3 VgenPanel** | Vgen 패널만 | 없음 (폴링 타이머 재시작) |

**원칙**: 에러 경계 reset ≠ 스토어 리셋. 경계 내 컴포넌트가 Zustand를 구독하면 자동으로 최신 state로 업데이트됨.

### 5.3 동일 에러 반복 시 에스컬레이션

동일 에러가 3회 연속 발생하면 상위 경계로 에스컬레이션:

```typescript
const errorCount = useRef<{ [key: string]: number }>({});

function handleError(error: Error, info: any) {
  const key = error.message;
  errorCount.current[key] = (errorCount.current[key] || 0) + 1;
  
  if (errorCount.current[key] >= 3) {
    // 상위 경계로 throw하거나 Sentry 심화 알림
    Sentry.captureException(error, {
      tags: { escalated: 'true', repeat_count: errorCount.current[key] },
    });
    throw error; // 상위 경계로 전파
  }
  
  logErrorToProd(error, boundary, info.componentStack);
}
```

---

## §5.4 사용자 경험 흐름 — L3→L2→L1 에스컬레이션

동일 에러가 반복되면서 경계를 타고 상위로 올라가는 사용자 시점의 경험:

### 예시: ChatPanel 에러 → RoomView → AppRoot

```
[사용자가 채팅 패널에서 메시지 입력]
  ↓
L3 ChatPanel 에러 발생 (1회)
  → ChatPanel 폴백: "채팅을 불러올 수 없습니다 [재시도]"
  → 사용자가 [재시도] 클릭
  ↓
L3 ChatPanel 동일 에러 발생 (2회)
  → ChatPanel 폴백: "채팇을 불러올 수 없습니다 [재시도]"
  → 사용자가 다시 [재시도] 클릭
  ↓
L3 ChatPanel 동일 에러 발생 (3회) → 에스컬레이션 감지
  → Sentry: escalated=true, repeat_count=3
  → Error throw: 상위 경계 (L2 RoomView)로 전파
  ↓
L2 RoomView 경계가 catch
  → RoomView 폴백으로 전환: "방 연결에 문제가 있습니다"
  → "다시 연결 [재시도]" / "로비로 돌아가기" 2개 버튼
  → 사용자가 [재시도] 또는 [돌아가기] 선택
  ↓
만약 RoomView 내 다른 컴포넌트도 동일하게 3회 에러:
  → L2가 다시 에스컬레이션
  → L1 AppRoot 경계가 catch
  ↓
L1 AppRoot 경계
  → 전체 화면 폴백: "앱에 문제가 발생했습니다"
  → "[재시도] 또는 새로고침해주세요"
  → support@example.com 연락처
  → Sentry: 최종 보고 (root-level escalation)
```

### 사용자가 보는 화면 전환 표

| 단계 | 컴포넌트 | 화면 상태 | 버튼 | 액션 |
|---|---|---|---|---|
| 1회 에러 (L3) | ChatPanel | 채팅 패널 폴백 (인라인) | [재시도] | resetErrorBoundary() → ChatPanel 재렌더 |
| 2회 에러 (L3) | ChatPanel | 채팅 패널 폴백 (인라인) | [재시도] | 동일 |
| 3회 에러 (L3) | ChatPanel | error throw → L2로 전파 | (전환 중) | L2 경계 진입 |
| 에스컬레이션 (L2) | RoomView | 방 전체 오류 화면 (modal) | [다시 연결] / [로비] | window.reload() 또는 navigate('/lobby') |
| 추가 에러 (L2) | 다른 L3들 | RoomView 폴백 유지 | (위와 동일) | (위와 동일) |
| 최종 에스컬레이션 (L1) | AppRoot | 전체 앱 오류 화면 | [재시도] | window.location.href = '/' |

### 구현: 에스컬레이션 플래그

```typescript
// src/stores/errorStore.ts — 경계 간 상태 공유
interface ErrorState {
  lastErrorBoundary?: 'L3-ChatPanel' | 'L3-VgenPanel' | 'L2-RoomView' | 'L1-AppRoot';
  errorCount: { [key: string]: number };  // error.message → count
  escalatedErrors: Set<string>;           // 3회 이상 발생한 에러들
}

// L3 ChatPanel 에러 처리
function ChatPanelBoundary() {
  const errorStore = useErrorStore();
  
  return (
    <ErrorBoundary
      onError={(error, info) => {
        const key = error.message;
        const count = (errorStore.errorCount[key] || 0) + 1;
        errorStore.setErrorCount(key, count);
        
        if (count >= 3) {
          // 상위 경계로 throw
          errorStore.setEscalatedError(key);
          throw error;  // L2로 전파
        }
        
        logErrorToProd(error, 'CHAT_PANEL', info.componentStack);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
```

---

## §6 MUST NOT

### 6.1 에러 경계 내 Zustand·Context 접근

❌ **금지**:
```typescript
function ChatErrorFallback() {
  const { messages } = useChatStore(); // ❌ 에러 경계가 활성화된 상황에서 스토어 접근 위험
  return <div>{messages.length}</div>;
}
```

✅ **권장**:
```typescript
function ChatErrorFallback() {
  return <div>채팅을 불러올 수 없습니다</div>; // 순수 UI만
}
```

**사유**: 에러 발생 상황에서 스토어도 일관성 없을 수 있음. 폴백은 모든 의존성 없이 렌더 가능해야 함.

### 6.2 폴백 UI에서 fetch·API 호출

❌ **금지**:
```typescript
function ErrorFallback() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(setData); // ❌ 폴백에서 네트워크 요청
  }, []);
  return <div>{data}</div>;
}
```

✅ **권장**: 정적 폴백만 렌더.

**사유**: 네트워크 오류로 인한 에러일 수 있음. 폴백 자체가 실패할 수 있음.

### 6.3 AppRoot 경계 없이 배포

❌ **금지**: AppRoot 경계를 주석 처리하고 배포.

✅ **권장**: 항상 AppRoot 최상단에 catch-all 경계 유지.

**사유**: 미처리 에러 발생 시 사용자에게 흰 화면.

### 6.4 Sentry 전송 시 PII 미필터

❌ **금지**:
```typescript
Sentry.captureException(error, {
  extra: {
    message_content: chatMessage.content, // ❌ PII 포함
    user_email: user.email,
  },
});
```

✅ **권장**: sanitizeSentryEvent()로 필터링 (§4.2 참조).

**사유**: SecurityPolicies §17 위반. GDPR·정보보안 규제.

### 6.5 에러를 console.warn만으로 처리

❌ **금지**:
```typescript
try {
  // 위험한 작업
} catch (e) {
  console.warn(e); // ❌ 에러 경계 없음, 리셋 메커니즘 없음
}
```

✅ **권장**: 에러 경계 + console.error + Sentry.

---

## §7 구현 체크리스트

배포 전 다음 항목 확인:

- [ ] `src/App.tsx`에 AppRoot ErrorBoundary 존재 (L1)
- [ ] `src/components/RoomView/`에 RoomViewBoundary 존재 (L2)
- [ ] PixiCanvas, AvatarCanvas, ChatPanel, VgenPanel, ScriptPanel, DubRecorder, MediaPipeTracker에 각각 ErrorBoundary 존재 (L3)
- [ ] 모든 onError 콜백에서 logErrorToProd() 호출
- [ ] sanitizeSentryEvent()에서 PII 필터링 확인 (message.content, user.email, display_name)
- [ ] 폴백 UI가 Zustand·Context 접근 없음 (순수 UI)
- [ ] 폴백 UI에 fetch·API 호출 없음
- [ ] Dev vs Prod 분기 (process.env.NODE_ENV) 확인
- [ ] 모든 경계에 boundary_name, component_name 태그 포함
- [ ] 테스트: 각 경계별로 의도적 에러 throw 후 폴백 렌더 확인

---

## 한줄정리

React 에러 경계를 5단계(AppRoot catch-all + RoomView + 기능별 L3 경계)로 배치하되, 폴백은 의존성 없이 정적 UI만 렌더하고, Sentry 전송 시 PII 필터링으로 SecurityPolicies §17 준수하며, reset은 경계 자체 리셋으로 제어 — 에러 격리 + 추적 + 보안의 삼각형.
