---
tags: [spec]
---

> G-112 산출 문서. Zustand FSM 자동 검증 전략.

# FSM 검증 전략 — Zustand 상태 머신

## 개요

Zustand 기반의 상태 머신(RoomFSM, DubSessionFSM 등)을 자동 검증하기 위한 테스트 패턴입니다.  
**@xstate/test는 Zustand와 호환되지 않으므로 채택하지 않습니다** (XState v5 전용). 대신 **Vitest 전이 매트릭스 테스트**와 **TypeScript 디스크리미네이티드 유니언**을 사용합니다.

---

## 1. 왜 @xstate/test를 사용하지 않는가

| 이유 | 상세 |
|---|---|
| **호환성** | @xstate/test는 XState의 FSM 구조에만 맞게 설계. Zustand store는 전혀 다른 구조 |
| **마이그레이션 비용** | 기존 Zustand FSM을 XState로 리팩토링 = 방대한 작업 |
| **학습곡선** | XState 문법 학습 추가 필요 |
| **프로젝트 규모** | 우리는 상태 6개 미만 FSM 대부분 → 간단한 테스트로 충분 |

**결정**: Zustand 그대로 유지, Vitest 전이 매트릭스 + TypeScript 타입 검증 조합.

---

## 2. 권장 패턴: Vitest 전이 매트릭스 테스트

### 2.1 RoomFSM 예시

```typescript
// src/stores/roomStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';

/**
 * 상태 정의 (DisjointUnion)
 * → TypeScript가 불가능한 전이 컴파일 타임에 차단
 */
type RoomFSMState =
  | { status: 'idle' }
  | { status: 'connecting'; roomId: string }
  | { status: 'connected'; roomId: string; participantCount: number }
  | { status: 'disconnected'; reason: string };

/**
 * Zustand store: 액션과 상태를 함께 관리
 */
interface RoomStore {
  state: RoomFSMState;
  connect: (roomId: string) => void;
  updateParticipants: (count: number) => void;
  disconnect: (reason: string) => void;
  reset: () => void;
}

const useRoomStore = create<RoomStore>((set) => ({
  state: { status: 'idle' },
  connect: (roomId: string) => {
    set((prev) => ({
      state: prev.state.status === 'idle'
        ? { status: 'connecting', roomId }
        : prev.state, // 불가능한 전이는 무시
    }));
  },
  updateParticipants: (count: number) => {
    set((prev) => ({
      state: prev.state.status === 'connecting'
        ? { status: 'connected', roomId: prev.state.roomId, participantCount: count }
        : prev.state,
    }));
  },
  disconnect: (reason: string) => {
    set({
      state: { status: 'disconnected', reason },
    });
  },
  reset: () => {
    set({ state: { status: 'idle' } });
  },
}));

/**
 * 전이 매트릭스 테스트
 * 모든 가능한 상태 전이를 행렬로 명시하고 검증
 */
describe('RoomFSM Transitions', () => {
  const transitions = [
    // [현재 상태, 액션, 예상 결과 상태]
    ['idle', 'connect', 'connecting'],
    ['connecting', 'updateParticipants', 'connected'],
    ['connected', 'disconnect', 'disconnected'],
    ['disconnected', 'reset', 'idle'],

    // 불가능한 전이 (상태 유지 확인)
    ['idle', 'updateParticipants', 'idle'],
    ['idle', 'disconnect', 'idle'],
    ['connecting', 'disconnect', 'connecting'],
    ['connected', 'connect', 'connected'],
  ];

  transitions.forEach(([from, action, expected]) => {
    it(`${from} --[${action}]--> ${expected}`, () => {
      const { getState, connect, updateParticipants, disconnect, reset } = useRoomStore;
      useRoomStore.setState({ state: { status: from as any } });

      // 액션 수행
      switch (action) {
        case 'connect':
          connect('room-123');
          break;
        case 'updateParticipants':
          updateParticipants(3);
          break;
        case 'disconnect':
          disconnect('user-left');
          break;
        case 'reset':
          reset();
          break;
      }

      // 결과 검증
      const currentState = getState().state;
      expect(currentState.status).toBe(expected);
    });
  });
});
```

### 2.2 테스트 실행

```bash
npm run test -- roomStore.test.ts
```

**출력 예:**
```
RoomFSM Transitions
  ✓ idle --[connect]--> connecting
  ✓ connecting --[updateParticipants]--> connected
  ✓ connected --[disconnect]--> disconnected
  ✓ disconnected --[reset]--> idle
  ✓ idle --[updateParticipants]--> idle
  ✓ idle --[disconnect]--> idle
  ...
```

---

## 3. TypeScript 디스크리미네이티드 유니언 패턴

Zustand FSM에서 **컴파일 타임 타입 안전성** 확보.

### 3.1 상태 정의 (Discriminated Union)

```typescript
// types/fsm.ts
export type RoomFSMState =
  | { status: 'idle' }
  | { status: 'connecting'; roomId: string }
  | { status: 'connected'; roomId: string; participantCount: number; connectedAt: number }
  | { status: 'disconnected'; reason: string; disconnectedAt: number };
```

**장점:**
- 각 상태에서만 유효한 필드만 접근 가능
- 불가능한 조합은 TS 오류로 즉시 감지
- 런타임 타입 가드 불필요

### 3.2 상태 액세스 시 타입 가드

```typescript
// components/RoomStatus.tsx
function RoomStatus() {
  const state = useRoomStore((s) => s.state);

  // 타입 안전 — status로 자동 좁혀짐
  switch (state.status) {
    case 'idle':
      return <div>Ready to join a room</div>;

    case 'connecting':
      // state.roomId 만 접근 가능 (TS 보장)
      return <div>Joining room {state.roomId}...</div>;

    case 'connected':
      // state.roomId, state.participantCount, state.connectedAt 접근 가능
      return (
        <div>
          Connected! {state.participantCount} participants.
          Connected for {Date.now() - state.connectedAt}ms
        </div>
      );

    case 'disconnected':
      return <div>Disconnected: {state.reason}</div>;

    default:
      // exhaustiveness check: 새 상태 추가 시 TS 오류 발생
      const _never: never = state;
      return null;
  }
}
```

---

## 4. DubSessionFSM 예시 (복잡한 상태 머신)

더빙 세션은 상태 7개, 전이 10개 이상:

```typescript
// types/dub.ts
type DubSessionFSMState =
  | { status: 'idle' }
  | { status: 'uploading'; uploadProgress: number } // 0~100
  | { status: 'transcribing'; transcriptionProgress: number }
  | { status: 'ready'; sourceVideoUrl: string; diarizationJson: object }
  | { status: 'recording'; activeTrackId: string; completedTracks: number }
  | { status: 'compositing'; compositeProgress: number }
  | { status: 'completed'; outputVideoUrl: string; compositeTime: number };

// 전이 매트릭스 (CSV로도 관리 가능)
const transitionMatrix = [
  ['idle', 'startUpload', 'uploading'],
  ['uploading', 'uploadComplete', 'transcribing'],
  ['transcribing', 'transcriptionComplete', 'ready'],
  ['ready', 'startRecording', 'recording'],
  ['recording', 'allTracksCompleted', 'compositing'],
  ['compositing', 'compositeComplete', 'completed'],
  ['uploading', 'cancelUpload', 'idle'], // 취소 경로
  ['transcribing', 'cancelTranscription', 'idle'],
  ['recording', 'cancelRecording', 'ready'], // 녹음 재시작 가능
];
```

**테스트:**
```typescript
describe('DubSessionFSM', () => {
  transitionMatrix.forEach(([from, action, to]) => {
    it(`${from} --[${action}]--> ${to}`, () => {
      // ... 동일 패턴
    });
  });
});
```

---

## 5. 경량 FSM 라이브러리: robot3 (옵션)

상태 6개 이상 복잡도라면, **robot3** 도입을 고려합니다.

```typescript
// npm install robot3
import { createMachine } from 'robot3';

const roomMachine = createMachine({
  idle: {
    connect: 'connecting',
  },
  connecting: {
    updateParticipants: 'connected',
    disconnect: 'idle',
  },
  connected: {
    disconnect: 'disconnected',
  },
  disconnected: {
    reset: 'idle',
  },
});
```

**robot3 도입 조건:**
- 상태 6개 이상
- 복잡한 이벤트 기반 전이
- 자동 상태 검증 필요

**현재 프로젝트 평가:**
- RoomFSM: 4개 상태 → Zustand + Vitest 충분
- DubSessionFSM: 7개 상태 → Phase 2 이후 robot3 검토

---

## 6. 테스트 작성 체크리스트

| 항목 | 설명 |
|---|---|
| **상태 정의** | Discriminated Union으로 정의, ts-check에서 pass |
| **전이 매트릭스** | 모든 가능한 전이(행, 열) 나열 |
| **긍정 테스트** | 가능한 전이가 올바르게 작동하는지 확인 |
| **부정 테스트** | 불가능한 전이가 상태를 변경하지 않는지 확인 |
| **경계 값** | 숫자 필드(progress, count)의 min/max 테스트 |
| **exhaustiveness** | switch/case에서 default 분기로 미처리 상태 감지 |

---

## MUST NOT

- ❌ **@xstate/test 도입 금지** — Zustand와 호환 불가
- ❌ **런타임 유효성 검사 없는 상태 전이** — 타입 안전성 대신 검증 로직 필수
- ❌ **전이 매트릭스 문서화 없음** — 코드에 명시 또는 별도 CSV/테이블로 관리
- ❌ **상태 필드 선택적 화(Optional)** — Discriminated Union 구조로 각 상태마다 필수 필드만 정의

---

## 참고 문서

- `/Users/family/jason/snack-web/src/stores/` (Zustand store 구현)
- `/Users/family/jason/snack-web/src/types/` (타입 정의)
- `PLATFORM-ARCHITECTURE.md §6.1` (상태 관리 개요)
