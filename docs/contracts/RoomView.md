---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- 룸 레이아웃(존 구성·패널 콘텐츠): DESIGN-DIRECTION.md §6 -->

# 4. RoomView

룸 페이지 전체 orchestrator. LiveKit Room 연결 초기화, ParticipantSlot 6개 mount/unmount 조율, Zustand Store 초기화, Supabase Realtime 구독 시작점.

## Props Interface

```typescript
interface RoomViewProps {
  /**
   * 현재 room의 ID (rooms 테이블 primary key)
   */
  roomId: string;

  /**
   * LiveKit 토큰 (JWT, 서버에서 발급)
   * room_id와 일치하는 자격증명
   */
  livekitToken: string;

  /**
   * LiveKit 서버 URL (wss://livekit.example.com)
   */
  livekitUrl: string;

  /**
   * 사용할 script_id (스크립트가 있을 경우)
   * (선택) 없으면 자유 대화 모드
   */
  scriptId?: string;

  /**
   * 룸 진입 실패 콜백
   * signature: (error: Error) => void
   */
  onConnectionError?: (error: Error) => void;

  /**
   * 룸 disconnect 콜백
   */
  onDisconnect?: () => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `roomStore` | `currentRoomId` | ✓ | ✓ | 현재 활성 room |
| `roomStore` | `hostId` | ✓ | ✓ | 호스트 ID (room-authority 발신자) |
| `roomStore` | `authorityEpoch` | ✓ | ✓ | host transfer/cue 권한 epoch |
| `roomStore` | `participants` | ✓ | ✓ | participant list |
| `roomStore` | `connectionState` | ✓ | ✓ | 'connecting'\|'connected'\|'disconnected' |
| `participantStore` | `initialize()` | | ✓ | 참가자 상태 초기화 |
| `participantStore` | `[participantId].*` | ✓ | ✓ | 각 peer 상태 |
| `stageStore` | `initialize()` | | ✓ | 무대 상태 초기화 |
| `stageStore` | `backgroundUrl` | ✓ | ✓ | 현재 배경 URL |
| `stageStore` | `focusedSlot` | ✓ | ✓ | 포커스된 슬롯 인덱스 |
| `userStore` | `userId` | ✓ | | 본인 ID (호스트 확인) |
| `trackingStore` | `initialize()` | | ✓ | 추적 상태 초기화 |

**쓰기:** RoomView만 Store를 초기화하고 연결 상태를 관리.

## DataChannel 의존성

**관리하는 채널들:**

| Channel | 목적 | 개설자 |
|---------|------|--------|
| `blendshape` (unreliable) | 모든 peer의 blendshape 송수신 | RoomView (room 진입 시) |
| `room-authority` (reliable) | 호스트 명령(slot, bg, sound, cue) | RoomView (room 진입 시) |
| `script-cue` (reliable, ordered) | cue_index 동기화 | RoomView (room 진입 시) |
| `chat` (reliable) | 채팅 메시지 송수신 | RoomView (room 진입 시) |

**발행:** 없음 (자식 컴포넌트로 위임)
**구독:** 모든 channel의 생명주기 관리 (cleanup 포함)

## LiveKit 이벤트

| 이벤트 | 핸들러 | 작업 |
|--------|--------|------|
| `room.onConnected()` | RoomView | roomStore.connectionState = 'connected', participantStore 초기화 |
| `room.onDisconnected()` | RoomView | cleanup, navigation |
| `room.onReconnected()` | RoomView | Supabase snapshot fetch, DataChannel 재등록, blendshape resume |
| `room.onParticipantConnected(p)` | ParticipantSlot mount | 슬롯 할당, avatar load 시작 |
| `room.onParticipantDisconnected(p)` | ParticipantSlot unmount | 슬롯 해제, 메모리 정리 |
| `room.onDataChannelMessage()` | RoomView | 모든 channel 리스너 등록 |

**RoomView 책임:** room 연결/해제, DataChannel 초기화, Realtime 구독.

## Supabase 접근

| 테이블/Storage | 작업 | 시점 |
|---|---|---|
| `rooms` | room_id 조회 (background_url, current_host_id 등) | room 진입 시 |
| `scripts` | script_id 조회 (cues_json 로드) | script_id 있을 시 |
| `Realtime: rooms` | UPDATE 구독 (배경, host_id 변경) | room 진입 후 |
| `Realtime: room_participants` | INSERT/UPDATE/DELETE 구독 | room 진입 후 |
| `Realtime: scripts` | UPDATE 구독 (cue_index 변경) | script_id 있을 시 |

**RoomView는 구독만 시작, 데이터는 Store가 소유.**

## 금지 사항 (MUST NOT)

- ❌ 직접 UI 렌더 최소화 (layout/grid만, 비즈니스 로직은 자식으로)
- ❌ DataChannel을 RoomView에서 직접 메시지 송수신 (자식이 담당)
- ❌ Realtime 구독을 여러 곳에서 중복 (RoomView에서만)
- ❌ prop 변경 시 room 재연결 (새 RoomView 생성 필요)
- ❌ ParticipantSlot 생성/제거 시 cleanup 생략 (메모리 누수)
- ❌ 호스트 검증 없이 room-authority 수신 처리 (보안)
- ❌ reconnect 직후 Supabase snapshot 확인 없이 DataChannel 송신 재개
- ❌ WebGL context loss 상태에서 음성만 정상인 참가자를 정상 아바타로 표시

---

## G-63 — 즉흥 모드 UI (ScriptPanel 없을 때 대체 UI)

**배경:** ROOM-06 대본 기능은 P1이므로 MVP에서 ScriptPanel이 없을 수 있음. 왼쪽 패널이 빈 채로 노출되면 혼란 발생.

**명세:**

```typescript
/**
 * script_id가 null일 때 ImpromptuModePanel 표시
 * script_id ≠ null일 때 ScriptPanel 표시
 */
conditionalPanelLogic: {
  if (script_id === null || !script_id) {
    // ← 즉흥 모드
    renderComponent: ImpromptuModePanel;
  } else {
    // ← 스크립트 모드
    renderComponent: ScriptPanel;
  }
}
```

**ImpromptuModePanel 구성:**
- **헤더:** "🎭 대본 없이 즉흥 연기 중"
- **중간 (리액션 버튼 그리드):** 빠른 이모지 리액션 5개 + 커스텀 텍스트 입력
  - 박수 👏, 웃음 😂, 놀람 😲, 슬픔 😢, 분노 😠 + "다른 반응 입력" 필드
  - 각 버튼 클릭 시 채팅 메시지로 송신 (or DataChannel reaction whitelist)
- **하단:** "오늘의 즉흥 주제 카드"
  - 랜덤 텍스트 생성 또는 사전 정의된 주제 목록에서 선택:
    - 예: "카페에서 우연히 만난 첫사랑", "면접 중 이상한 일이 생겼다", "길을 잃었을 때 만난 낯선 사람"
  - 새로고침 버튼 (다른 주제 로드)

**Store 의존성 (신규):**
```typescript
interface ImpromptuStore {
  impromptu_topic: string;           // 현재 주제
  reaction_history: string[];        // 최근 리액션 로그
  refreshTopic: () => void;          // 새로고침
}
```

---

## G-64 — Self-모니터 PiP (내 아바타 자기 미리보기)

**배경:** 공연 중 자신의 아바타가 어떻게 보이는지 확인 불가. 표정이 제대로 출력되는지 실시간으로 알 수 없음.

**명세:**

```typescript
/**
 * FloatingSelfMonitor (PiP 컴포넌트)
 * 우상단 고정, z-index: stageUI (최상위)
 */
interface FloatingSelfMonitor {
  enabled: boolean;               // stageStore.showSelfMonitor
  position: { x: number; y: number; };  // 우상단 기본값, 드래그 이동 가능
  size: { width: number; height: number; };  // 기본 100x100px, 드래그로 리사이즈 (90~200px)
  content: PixiJSCanvas;          // 로컬 아바타 렌더링 (독립 WebGL context)
  toggleButton: boolean;           // SettingsPage 또는 방 하단 UI 토글
}
```

**렌더 조건:**
- `stageStore.showSelfMonitor === true`
- 연결 상태: `CONNECTED` (AvatarCanvas tracking 활성화 중)
- **Edge case (모바일):** WebGL context 제한 → `showSelfMonitor` 강제 false + "모바일에서 지원 안 됨" 토스트

**Store 의존성 (신규):**
```typescript
interface FloatingSelfMonitorStore {
  showSelfMonitor: boolean;              // 기본 false
  pipPosition: { x: number; y: number; }; // 우상단 (right: 16px, top: 16px)
  pipSize: { width: number; height: number; };  // 기본 100x100px
  updatePipPosition: (x, y) => void;    // 드래그 핸들러
  updatePipSize: (w, h) => void;        // 리사이즈 핸들러
}
```

**UI 토글 위치:**
- **Option 1:** SettingsPage "접근성" 탭에 "내 아바타 미리보기" 토글 추가
- **Option 2:** HostConsole 하단 바 (또는 ActionBar) "내 미리보기" 버튼 (아이콘: 📷 + 화살표)
- **Recommendation:** Option 1 (접근성 설정)이 더 유연함

---

## G-261 — 호스트 모드 전환 broadcast (normal/vgen/dub)

**배경:** 호스트가 무대 진행 모드를 변경할 때(normal ↔ vgen ↔ dub), 모든 참가자가 실시간으로 인지할 수 있어야 하며, 현재 진행 중인 모드를 상단 배너로 즉시 표시해야 한다.

**명세:**

```typescript
/**
 * stageStore.mode 변경 시 자동 broadcast
 */
interface ModeChangeNotification {
  type: 'mode_change',
  payload: {
    new_mode: 'normal' | 'vgen' | 'dub',
    changed_at_ms: number,
    changed_by_host_id: string
  }
}

/**
 * room-authority 채널을 통해 모든 참가자(호스트 포함)에게 broadcast
 * HostConsole에서 mode 변경 시:
 * 1. stageStore.mode 업데이트
 * 2. room-authority 채널에 mode_change 메시지 발행
 * 3. Supabase rooms.current_mode 업데이트 (Edge Function 검증)
 */
```

**화면 표시 (모든 참가자):**

```
┌─────────────────────────────────────┐
│ 🤖 VGEN 모드 진행 중 (2초 표시)      │ ← 배너 (상단 중앙)
│                                     │
│ [무대 콘텐츠]                       │
│ [아바타·배경]                       │
└─────────────────────────────────────┘
```

**배너 규격:**
- **위치:** 화면 상단 고정, z-index: topmost
- **배경:** 모드별 색상:
  - normal: 회색 (기본)
  - vgen: 파란색 (#2563EB) — AI 음성 생성 중
  - dub: 보라색 (#9333EA) — 더빙 모드
- **글자:** 흰색, 14-16px bold
- **애니메이션:** fade-in (200ms) → 고정 (2000ms) → fade-out (200ms)
- **텍스트:**
  - normal mode: "일반 모드로 전환되었습니다"
  - vgen mode: "🤖 VGEN 모드 진행 중"
  - dub mode: "🎤 더빙 모드 진행 중"

**DataChannel 확장 (room-authority):**

`room-authority` 메시지 타입에 추가:
```typescript
| 'mode_change'  // G-261 { new_mode: 'normal'|'vgen'|'dub', changed_at_ms, changed_by_host_id }
```

**Store 의존성 (RoomView):**

```typescript
// RoomView useEffect
useEffect(() => {
  // room-authority mode_change 메시지 수신
  const handleModeChange = (msg: RoomAuthorityMessage) => {
    if (msg.type === 'mode_change') {
      stageStore.setMode(msg.payload.new_mode);
      showModeChangeBanner(msg.payload.new_mode);  // 2초 배너 표시
    }
  };
  
  room?.on('dataChannelMessage', handleModeChange);
  return () => room?.off('dataChannelMessage', handleModeChange);
}, [room, stageStore]);
```

**MUST NOT:**
- ❌ 호스트만 배너 표시 (모든 참가자에게 동일하게 broadcast)
- ❌ broadcast 없이 호스트 로컬 stageStore.mode만 변경
- ❌ 배너 표시 없이 모드 변경을 암묵적으로 진행
- ❌ mode 변경 시 DB 업데이트 생략 (rooms.current_mode 필수)
- ❌ 2초 이상 배너 고정 (사용자 경험 방해)

---

## ROOM-24 — 리허설 피드백 루프

리허설 모드에서만 표시되는 가벼운 피드백 표면. 공연 중 판단을 대신하지 않고, 방금 한 연기를 짧게 되돌아보는 데 필요한 최소 신호만 제공한다.

```typescript
interface RehearsalFeedbackOverlay {
  enabled: boolean;              // stageStore.mode === 'rehearsal'
  lastClipUrl?: string;          // 최근 10초 local/R2 signed preview
  turnTimingMs?: number;         // 내 cue 시작 대비 발화 시점
  overlapMs?: number;            // 다른 actor와 음성이 겹친 시간
  reactionPeakCueId?: string;    // 리액션이 가장 많았던 cue
}
```

**동작**
- `stageStore.mode === 'rehearsal'`일 때만 하단 보조 패널로 표시
- 최근 10초 다시듣기는 로컬 MediaRecorder preview를 우선 사용하고, 업로드 완료 전에는 R2 URL을 요구하지 않음
- 대사 겹침은 actor별 audio level timestamp를 비교해 rough marker만 표시
- 리액션 하이라이트는 `messages.message_type='reaction'` 집계로 cue 단위 표시

**MUST NOT**
- ❌ 본공연 모드에서 점수/분석 UI 노출
- ❌ 리허설 피드백을 공개 랭킹처럼 표시
- ❌ 10초 preview를 사용자 동의 없이 영구 저장
- ❌ 타이밍 점수를 "연기 실력 점수"로 표현

---

## 컴포넌트 관계

```
[RoomView]
  ├─ initialize Zustand stores (roomStore, participantStore, stageStore, etc.)
  ├─ create LiveKit Room connection
  ├─ open DataChannels (blendshape, room-authority, script-cue, chat)
  ├─ subscribe Supabase Realtime (rooms, room_participants, scripts, messages)
  │
  └─ [ParticipantSlot] x 6 (mount/unmount based on room_participants)
      ├─ [AvatarCanvas] + [ParticipantLabel] + [AudioUI]
      └─ subscribe blendshape + room-authority
  
  ├─ [ScriptPanel] (if script_id ≠ null) — G-63 gate
  │  └─ subscribe script-cue + scripts
  │
  ├─ [ImpromptuModePanel] (if script_id === null) — G-63 새로 추가
  │  ├─ display random impromptu topic
  │  └─ quick reaction buttons
  │
  ├─ [FloatingSelfMonitor] (if showSelfMonitor === true) — G-64 새로 추가
  │  ├─ position: top-right fixed, draggable
  │  ├─ size: 100x100 ~ 200x200px resizable
  │  └─ content: local avatar PixiJS canvas
  │
  ├─ [ChatPanel] + [ChatOverlay]
  │  └─ subscribe chat + messages Realtime
  │
  ├─ [HostConsole] (if isHost)
  │  └─ publish room-authority
  │
  ├─ [MainViewComponent]
  │  └─ subscribe room-authority (bg_change)
  │
  └─ [AudioMixer]
     └─ manage participant audio tracks
```
