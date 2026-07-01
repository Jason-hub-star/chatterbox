---
tags: [guide]
---

# 코딩 컨벤션

> G-142 산출 문서. 모든 PR에서 따라야 할 코드 스타일 & 패턴.

---

## 1. 파일명 & 폴더명

| 종류 | 컨벤션 | 예시 |
|------|--------|------|
| React 컴포넌트 | PascalCase | `VgenPanel.tsx` |
| Zustand 스토어 | camelCase + `Store` 접미사 | `vgenStore.ts` |
| React hooks | camelCase + `use` 접두사 | `useCredits.ts` |
| 유틸 함수 | camelCase | `credit.ts`, `sanitize.ts` |
| 타입 파일 | camelCase + `.types.ts` 또는 `types/` 폴더 | `vgen.types.ts` |
| 테스트 파일 | 대상 파일명 + `.test.ts(x)` | `vgenStore.test.ts` |
| 폴더 | kebab-case | `features/vgen/`, `lib/pixi/` |

---

## 2. TypeScript 규칙

### DB/API 이름 변환

- DB table/column, Edge Function payload, DataChannel wire payload는 `DATA-SCHEMA.md §0 Naming SSOT` 기준으로 `snake_case`를 쓴다.
- React props, Zustand store, hooks, 컴포넌트 내부 변수는 `camelCase`를 쓴다.
- Supabase row를 UI/store에 직접 퍼뜨리지 않는다. `mapRoomRow`, `mapParticipantRow` 같은 boundary mapper에서 한 번만 변환한다.
- store 필드에 `current_room_id`, `background_url`, `connection_state` 같은 DB 컬럼명을 그대로 쓰지 않는다.

```typescript
// DB/API row
type RoomRow = {
  id: string
  host_id: string
  background_url: string | null
}

// App/store state
type RoomState = {
  id: string
  hostId: string
  backgroundUrl: string | null
}
```

### 타입 vs 인터페이스

- **컴포넌트 Props**: `type` 사용 (확장 불필요)
- **Zustand 스토어 상태**: `interface` 사용 (병합 활용 가능)
- **외부 API 응답**: `type` 사용 (변형 금지)

```typescript
// Props: type
type VgenPanelProps = {
  roomId: string
  onClose: () => void
}

// Store: interface
interface VgenStore {
  jobs: VgenJob[]
  dailyCount: number
  requestVgen: (params: VgenRequestParams) => Promise<void>
}
```

### 엄격 규칙

- `any` 사용 금지 — `unknown` 또는 구체 타입 사용
- `!` (non-null assertion) 최소화 — 런타임 체크 후 사용
- `as` 타입 캐스팅 금지 — 타입 가드 작성

---

## 3. Zustand 슬라이스 패턴

```typescript
// src/stores/vgenStore.ts

interface VgenJob {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  videoUrl?: string
  createdAt: string
}

interface VgenStore {
  // 상태
  jobs: VgenJob[]
  dailyCount: number
  // 액션
  requestVgen: (params: { prompt: string; durationSec: number }) => Promise<void>
  pollJobStatus: (jobId: string) => Promise<void>
  resetDailyCount: () => void
}

export const useVgenStore = create<VgenStore>((set, get) => ({
  jobs: [],
  dailyCount: 0,

  requestVgen: async ({ prompt, durationSec }) => {
    const { dailyCount } = get()
    const limit = useConfigStore.getState().getFlag('VGEN_DAILY_LIMIT')
    if (dailyCount >= limit) throw new Error('DAILY_LIMIT_EXCEEDED')

    // 낙관적 업데이트
    const tempId = `temp-${Date.now()}`
    set(s => ({ jobs: [...s.jobs, { id: tempId, status: 'queued', createdAt: new Date().toISOString() }] }))

    try {
      const { jobId } = await falClient.requestVgen({ prompt, durationSec })
      set(s => ({
        jobs: s.jobs.map(j => j.id === tempId ? { ...j, id: jobId } : j),
        dailyCount: s.dailyCount + 1,
      }))
    } catch (err) {
      set(s => ({ jobs: s.jobs.filter(j => j.id !== tempId) }))
      throw err
    }
  },

  pollJobStatus: async (jobId) => {
    const status = await falClient.getJobStatus(jobId)
    set(s => ({
      jobs: s.jobs.map(j => j.id === jobId ? { ...j, ...status } : j),
    }))
  },

  resetDailyCount: () => set({ dailyCount: 0 }),
}))
```

**규칙:**
- 스토어 파일 1개 = 하나의 도메인 책임
- 직접 `set` 중첩 금지 — `get()`으로 현재 상태 읽고 불변 업데이트
- 비동기 액션은 낙관적 업데이트 → 실패 시 롤백 패턴

---

## 4. LiveKit DataChannel 디스패처 패턴

DataChannel 메시지는 `type` 필드로 분기하는 switch-case 디스패처를 사용한다.

```typescript
// src/lib/livekit/dispatcher.ts

type DataMessage =
  | { type: 'blendshape'; payload: Float32Array }
  | { type: 'chat'; payload: { text: string; senderId: string } }
  | { type: 'cue'; payload: { lineIndex: number } }
  | { type: 'slot_reorder'; payload: { slots: string[] } }

export function handleDataMessage(raw: Uint8Array, senderId: string) {
  let msg: DataMessage
  try {
    msg = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return // 파싱 실패 무시
  }

  switch (msg.type) {
    case 'blendshape':
      useTrackingStore.getState().applyRemoteBlendshape(senderId, msg.payload)
      break
    case 'chat':
      useStageStore.getState().addChatMessage({ ...msg.payload, timestamp: Date.now() })
      break
    case 'cue':
      useScriptStore.getState().jumpToLine(msg.payload.lineIndex)
      break
    case 'slot_reorder':
      useRoomStore.getState().reorderSlots(msg.payload.slots)
      break
    default:
      // 알 수 없는 타입 — exhaustive check
      const _: never = msg
  }
}
```

---

## 5. async 에러 처리

컴포넌트에서 직접 `try-catch`를 쓰지 않는다. 스토어 액션이 에러를 throw하고 컴포넌트는 UI 피드백만 담당한다.

```typescript
// 스토어 액션: throw
requestVgen: async (params) => {
  if (get().dailyCount >= limit) throw new Error('DAILY_LIMIT_EXCEEDED')
  // ...
}

// 컴포넌트: 에러 처리
function VgenPanel() {
  const requestVgen = useVgenStore(s => s.requestVgen)

  const handleGenerate = async () => {
    try {
      await requestVgen({ prompt, durationSec })
    } catch (err) {
      if (err instanceof Error) {
        toast.error(getErrorMessage(err.message))
      }
    }
  }
}

// 에러 메시지 매핑 (utils/errorMessages.ts)
export function getErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    DAILY_LIMIT_EXCEEDED: '오늘 생성 한도에 도달했습니다.',
    INSUFFICIENT_CREDITS: '크레딧이 부족합니다.',
    ROOM_FULL: '방이 가득 찼습니다.',
  }
  return messages[code] ?? '오류가 발생했습니다.'
}
```

---

## 6. 컴포넌트 구현 체크리스트

PR에서 컴포넌트를 추가할 때 아래 순서로 구현한다.

- [ ] **Props 타입 정의** — 최소 필요 props만
- [ ] **기본 렌더링 구현** — 빈 상태(empty state) 포함
- [ ] **로딩 상태** — Suspense boundary 또는 `isLoading` prop
- [ ] **에러 상태** — `ErrorBoundary` 또는 `StandardLoadingErrorProps` (contracts/_INDEX.md)
- [ ] **모바일 반응형** — 360px 깨짐 확인
- [ ] **키보드 접근성** — Tab 순서, Enter/Space 인터랙션
- [ ] **단위 테스트** — 주요 상태 3가지 이상 (기본/로딩/에러)

---

## 7. import 순서

```typescript
// 1. React
import { useState, useEffect } from 'react'

// 2. 외부 라이브러리 (알파벳 순)
import { motion } from 'motion/react'
import { Room } from 'livekit-client'

// 3. 내부 alias (@/)
import { useVgenStore } from '@/stores/vgenStore'
import { VgenStatusBadge } from '@/features/vgen'
import type { VgenJob } from '@/types/vgen'
```

ESLint `import/order` 플러그인으로 자동 강제.

---

## 8. 주석 정책

주석은 **WHY가 비자명할 때만** 작성.

```typescript
// 허용: 비자명한 제약 설명
// blendshape는 unreliable DataChannel로 전송 — 손실 허용, 30fps 지연 < 33ms
room.localParticipant.publishData(blendshapeBytes, { reliable: false })

// 금지: WHAT 설명 (코드 자체가 설명)
// 크레딧을 차감한다
userCredits -= cost

// 금지: TODO/FIXME (이슈 트래커 사용)
// TODO: 나중에 수정
```

---

## 9. MUST NOT

- `console.log`에 이메일·display_name·채팅 내용 포함 금지 (SecurityPolicies.md §17)
- `useEffect` 안에서 Zustand `set` 직접 호출 금지 — 스토어 액션 경유
- 컴포넌트 파일에 비즈니스 로직 작성 금지 — 스토어·서비스로 분리
- `React.memo`, `useMemo`, `useCallback` 남용 금지 — 측정 후 적용
- 새 npm 패키지 추가 시 PR 설명에 대안 검토 내용 포함 (CODING-CONVENTIONS.md §ponytail)

---

## 10. 문서·이력 관리

> Vtube 프로젝트(실제 코딩 진행 중인 자매 프로젝트)에서 검증된 관례. 코드가 쌓이기 시작하면 아래를 지킨다.

- **근본원인 로그**: 버그 수정 시 "무엇을 고쳤다"가 아니라 "왜 깨졌는지 → 어떻게 찾았는지 → 어떻게 검증했는지"를 커밋 메시지 본문 또는 `docs/GAP-MATRIX.md`의 `## 진행 로그`에 남긴다. "버그 고침" 한 줄은 다음 세션(사람이든 에이전트든)이 같은 원인을 또 밟게 만든다.
- **삭제 대신 아카이브**: 폐기된 계약서·스펙은 삭제하지 않고 `docs/archive/<날짜>-<주제>/`로 옮긴다(이 저장소는 git repo가 아니므로 일반 `mv` 사용). 옮긴 파일 상단에 대체 문서 경로를 한 줄로 명시한다.
