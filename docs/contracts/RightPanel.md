---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- DESIGN-DIRECTION §6.3 — 우측 패널 5탭(채팅·대본·VGen·DUB·노트) SSOT -->

# 19. RightPanel

우측 사이드바 컨테이너. 탭 관리 + 상단 카드 스택. 탭 콘텐츠는 각각 위임. (~~하단 고정 사운드보드~~ — 2026-07-10 우도크 재분배로 **이모트 콘솔 카드에 흡수·폐기**, `contracts/ReactionWheel.md` 참조.)

---

## 구현 현황 (2026-07-05, MVP 셸)

> 아래 계약은 Phase 2 완성형. 현재 셸은 그 부분집합으로 구현됨.

- **셸 = 탭 주입식** — `RightPanel({ tabs })` 로 탭 렌더러 배열을 주입받는다(계약의 `roomId`-only + 내부 import 대신). 이유: LiveKit 훅(`sendChat` 등)이 `RoomPage`에 있어 탭 콘텐츠가 그 콜백을 필요로 함 → RoomPage가 훅을 쥐고 탭을 주입하면 셸이 순수 "블록 컨테이너"가 되어 갈아끼우기가 쉬움.
- **라이브 탭(3)**: `chat`(ChatPanel, 인라인 채팅 추출)·`dub`(DubPanel)·`vgen`(VgenStatusTab). 활성 탭은 `hidden`으로 숨기고 **언마운트하지 않음** → 녹음·생성 중 탭 전환에도 작업 유지(§금지사항 준수).
- **store**: `rightPanelStore`(`activeTab`·`isOpen`·`setActiveTab`·`setIsOpen`·`toggle`). 활성 탭이 목록에 없으면 첫 탭으로 순수 파생(set-state-in-effect 회피).
- **`mode` 자동전환 구현(2026-07-10, G-261)** — `stageStore.mode` 도입: vgen/dub 진입 시 해당 탭 자동 활성, normal 은 현재 탭 유지(강제 회귀 없음). 렌더 테스트 2(`rightPanelAutoTab.test.tsx`).
- **실탭 5 + 카드 스택(2026-07-10 정정)** — 실탭 = `chat`·`dub`·`vgen`·`notes`·`host`. 우도크 재분배로 MoodMeterCard·SoundboardCard 삭제 → `EmoteConsoleCard`(방분위기 실집계 인라인 + 로드아웃 전 슬롯 그리드 + ✏️`EmoteLoadoutPicker`) 단일 카드로 통합, RightPanel 세로 flex-1 확대. 이모트 비주얼은 `EmoteGlyph`(옐로 Lottie) — `contracts/ReactionWheel.md §비주얼 레이어`.
- **Defer**: 대본 미러(`script`)·`isOpen` 접기 UI. 각 기능이 실제 빌드되면 tabs 배열에 한 항목씩 추가(`RoomPage.tsx` tabs 배열 1 push).
- **파일**: `src/features/room/RightPanel.tsx`·`src/features/chat/ChatPanel.tsx`·`src/stores/rightPanelStore.ts`·`tests/unit/rightPanelStore.test.ts`.

---

## Props Interface

```typescript
interface RightPanelProps {
  /**
   * 현재 room_id (탭 콘텐츠 위임용)
   */
  roomId: string;

  /**
   * 초기 활성 탭
   * @default 'chat'
   */
  defaultTab?: 'chat' | 'script' | 'vgen' | 'dub' | 'notes';

  /**
   * 패널 닫기 콜백
   */
  onClose?: () => void;

  /**
   * 에러 콜백
   */
  onError?: (error: Error) => void;
}
```

---

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `rightPanelStore` | `activeTab` | ✓ | ✓ | 현재 활성 탭 ('chat'\|'script'\|'vgen'\|'dub'\|'notes') |
| `rightPanelStore` | `isOpen` | ✓ | ✓ | 패널 전개 여부 (토글) |
| `stageStore` | `mode` | ✓ | | 'normal' \| 'vgen' \| 'dub' 감시 (탭 자동 전환 트리거) |
| `userStore` | `isHost` | ✓ | | DUB 탭에서 "DUB 모드 전환" 버튼 활성화 조건 |
| `vgenStore` | `creditBalance`, `isGenerating`, `progress` | ✓ | | VGen 탭 콘텐츠용 (위임) |
| `chatStore` | `messages`, `unreadCount` | ✓ | | 채팅 탭 배지용 |
| `roomStore` | `participants` | ✓ | | DUB 탭 역할 목록 렌더용 |
| `notesStore` | `notes`, `isAutoScroll` | ✓ | ✓ | 실시간 디렉터 노트 스트림 (ROOM-17) |

**읽기 전용:** 대부분  
**쓰기:** rightPanelStore.activeTab, rightPanelStore.isOpen

---

## 탭 라우팅

### 탭 마운트 규칙

```typescript
// rightPanelStore 슬라이스 (신규)
interface RightPanelState {
  activeTab: 'chat' | 'script' | 'vgen' | 'dub' | 'notes';
  isOpen: boolean;
  // 액션
  setActiveTab(tab: RightPanelState['activeTab']): void;
  setIsOpen(open: boolean): void;
}

// RightPanel 컴포넌트 JSX 구조
export function RightPanel({ roomId, defaultTab = 'chat', onClose, onError }: RightPanelProps) {
  const { activeTab, isOpen, setActiveTab } = useRightPanelStore();
  const { mode } = useStageStore();
  
  // mode 변화 감시: vgen / dub 자동 탭 전환
  useEffect(() => {
    if (mode === 'vgen') setActiveTab('vgen');
    else if (mode === 'dub') setActiveTab('dub');
    // mode === 'normal'일 때는 탭 유지
  }, [mode]);

  return (
    <div className="right-panel" style={{ width: '14%', top: '9%', bottom: '9%' }}>
      {/* 상단 5탭 버튼 */}
      <div className="tabs">
        <button
          onClick={() => setActiveTab('chat')}
          className={activeTab === 'chat' ? 'active' : ''}
        >
          채팅
        </button>
        <button
          onClick={() => setActiveTab('script')}
          className={activeTab === 'script' ? 'active' : ''}
        >
          대본
        </button>
        <button
          onClick={() => setActiveTab('vgen')}
          className={activeTab === 'vgen' ? 'active' : ''}
        >
          🎬 VGen
        </button>
        <button
          onClick={() => setActiveTab('dub')}
          className={activeTab === 'dub' ? 'active' : ''}
        >
          🎙 DUB
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={activeTab === 'notes' ? 'active' : ''}
        >
          📝 노트
        </button>
      </div>

      {/* 탭 콘텐츠 영역 (flex: 1, overflow-y: auto) */}
      <div className="tab-content">
        {activeTab === 'chat' && <ChatPanel roomId={roomId} isOpen={isOpen} />}
        {activeTab === 'script' && <ScriptPanelMirror roomId={roomId} />}
        {activeTab === 'vgen' && <VgenStatusTab roomId={roomId} />}
        {activeTab === 'dub' && <DubStatusTab roomId={roomId} />}
        {activeTab === 'notes' && <DirectorNotesTab roomId={roomId} />}
      </div>

      {/* 하단 고정: 사운드보드 (모든 탭 공통) */}
      <SoundboardBar roomId={roomId} />
    </div>
  );
}
```

### 탭별 콘텐츠 컴포넌트

| 탭 ID | 콘텐츠 컴포넌트 | 역할 | 계약서 참조 |
|-------|----------------|----|-----------|
| `chat` | `ChatPanel` | 메시지 히스토리 + 입력창 + 이모지 반응 | ChatPanel.md |
| `script` | `ScriptPanelMirror` | 좌측 패널 대본과 동일 내용 미러 뷰 (모바일·좁은 화면용) | ScriptPanel.md + 신규 |
| `vgen` | `VgenStatusTab` | 현재 생성 상태 + 히스토리 + [프롬프트 열기] 진입점 | VgenPanel.md |
| `dub` | `DubStatusTab` | 더빙 세션 상태 + 역할 배정 목록 + [DUB 모드 전환] | 신규 계약서 (DUB-01) |
| `notes` | `DirectorNotesTab` | 실시간 디렉터 노트 스트림 + 입력창 (방장/참가자 공용) | DirectorNotesTab.md (ROOM-17) |

---

## 자동 탭 전환 규칙 (mode 반응)

```typescript
// RightPanel 내부 useEffect
useEffect(() => {
  if (stageStore.mode === 'vgen') {
    // VgenPromptPanel 열림 → VGen 탭 자동 활성
    rightPanelStore.setActiveTab('vgen');
    rightPanelStore.setIsOpen(true);
  } else if (stageStore.mode === 'dub') {
    // DUB 모드 진입 → DUB 탭 자동 활성
    rightPanelStore.setActiveTab('dub');
    rightPanelStore.setIsOpen(true);
  }
  // mode === 'normal': 탭 유지 (강제 전환 안 함)
}, [stageStore.mode]);
```

**예시 흐름:**

1. **[채팅] 탭 활성 중**
2. VgenPromptPanel [생성 ▶] 클릭 → `stageStore.setMode('vgen')`
3. RightPanel 감시 → `setActiveTab('vgen')`
4. VGen 탭 자동 활성, 생성 진행 상태 표시
5. 생성 완료 → `stageStore.setMode('normal')` (다시 normal로)
6. 사용자가 선택한 탭 유지 (강제 회귀 안 함)

---

## 사운드보드 하단 고정

```typescript
// 시각 명세
<div className="soundboard-bar" style={{
  marginTop: 'auto',  // flex: 1 형제들 아래로
  borderTop: '1px solid rgba(255,255,255,0.1)',
  padding: '12px 8px',
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '8px',
}}>
  {/* 효과음 버튼 2열 x N행 */}
  {SOUNDBOARD_EFFECTS.map(effect => (
    <button key={effect.id} onClick={() => playSoundEffect(effect.id)}>
      {effect.label}
    </button>
  ))}
</div>
```

**규칙:**

- 모든 탭 콘텐츠 아래, 패널 최하단에 고정
- `margin-top: auto` 로 콘텐츠 영역과 분리 (flex column 구조)
- 2열 grid 레이아웃 (내용에 따라 조정 가능)
- 스크롤 영역(탭 콘텐츠)과 분리 (사운드보드는 스크롤 안 됨)

---

## DataChannel 의존성

**구독 (수신):**

| Channel | 메시지 형식 | 용도 |
|---------|----------|------|
| `room-authority` (reliable) | `{ type: 'vgen_mode_open' \| 'vgen_mode_close' \| 'dub_mode_*' }` | 모드 변화 감시 (stageStore 경로) |
| `chat` (reliable) | 채팅 메시지 | ChatPanel 위임 |
| `script-cue` (reliable, ordered) | cue 동기화 | ScriptPanelMirror 위임 |
| `chat` (reliable) | `message_type='note'` 실시간 노트 메시지 | DirectorNotesTab (ROOM-17) |

**발행 (송신):**

- RightPanel 자체는 DataChannel 발행 안 함
- 각 탭 콘텐츠(ChatPanel, ScriptPanelMirror, VgenStatusTab, DubStatusTab)가 독립 발행

---

## 금지 사항 (MUST NOT)

- ❌ **탭 콘텐츠를 RightPanel에서 직접 구현** — ChatPanel, ScriptPanelMirror, VgenStatusTab, DubStatusTab, DirectorNotesTab 각각 별도 컴포넌트로 위임
- ❌ **activeTab 상태를 localStorage에만 저장** — Zustand store 싱글턴 사용 (다중 윈도우 동기화)
- ❌ **mode 변화 감시 없이 수동 탭 전환만 허용** — VGen/DUB 진입 시 자동 탭 활성화 구현 필수
- ❌ **사운드보드가 탭 콘텐츠와 함께 스크롤** — `margin-top: auto` + flex layout으로 고정
- ❌ **비호스트가 DUB 모드로 탭 강제 전환** — 호스트 권한 검증 필수 (DubStatusTab에서 처리)
- ❌ **채팅/대본/VGen/DUB/노트 탭 콘텐츠 간 상태 직접 공유** — 각 store(chatStore, stageStore, vgenStore, notesStore 등)를 매개체로만 사용
- ❌ **탭 이동 중 진행 중인 작업(녹음, 생성) 중단** — 탭 전환은 UI만, 비즈니스 로직은 독립
- ❌ **디렉터 노트를 별도 DataChannel로 발행** — `chat` 채널의 `message_type='note'`만 사용
- ❌ **방장만 디렉터 노트 발행** — 모든 참가자(방장·참가자 구분 무)가 노트 입력 가능

---

## 컴포넌트 관계

```
[RightPanel] (width: 14%, top 9% ~ bottom 9%)
  │
  ├─ [TabBar] (상단 5탭 버튼)
  │  ├─ [채팅] button
  │  ├─ [대본] button
  │  ├─ [🎬 VGen] button
  │  ├─ [🎙 DUB] button
  │  └─ [📝 노트] button
  │
  ├─ [TabContent] (flex: 1, overflow-y: auto)
  │  │
  │  ├─ activeTab === 'chat' → [ChatPanel]
  │  │  ├─ subscribe: chat DataChannel
  │  │  └─ publish: 메시지 입력
  │  │
  │  ├─ activeTab === 'script' → [ScriptPanelMirror]
  │  │  ├─ read: stageStore.script_data
  │  │  └─ subscribe: script-cue (호스트만 발행)
  │  │
  │  ├─ activeTab === 'vgen' → [VgenStatusTab]
  │  │  ├─ read: vgenStore (생성 상태, 히스토리, 크레딧)
  │  │  └─ button: [프롬프트 열기] (HOST) → stageStore.mode='vgen'
  │  │
  │  ├─ activeTab === 'dub' → [DubStatusTab]
  │  │  ├─ read: dubStore (세션 상태, 역할 배정)
  │  │  └─ button: [DUB 모드 전환] (HOST) → stageStore.mode='dub'
  │  │
  │  └─ activeTab === 'notes' → [DirectorNotesTab]
  │     ├─ subscribe: chat DataChannel (`message_type='note'`)
  │     ├─ read: notesStore (notes, isAutoScroll)
  │     └─ publish: 노트 입력 (방장/참가자 공용)
  │
  ├─ [mode 감시] (useEffect)
  │  ├─ stageStore.mode === 'vgen' → setActiveTab('vgen')
  │  └─ stageStore.mode === 'dub' → setActiveTab('dub')
  │
  └─ [SoundboardBar] (margin-top: auto, 모든 탭 공통, 스크롤 안 됨)
     ├─ 효과음 버튼 2열
     └─ on click: livekitRoom.publishDataChannelMessage('room-authority', { type: 'sound_trigger', id })
```

---

## ROOM-17 실시간 디렉터 노트 탭

**탭 ID:** `notes`  
**컴포넌트:** `DirectorNotesTab` (신규 계약서: DirectorNotesTab.md)  
**역할:** 실시간 디렉터 메모 스트림 + 입력창  
**참가 권한:** 방장·참가자 모두 입력 가능 (공용)

### 메시지 형식 (`chat` channel, `message_type='note'`)

```typescript
interface DirectorNote {
  type: 'director_note';
  author_id: string;        // LiveKit ParticipantIdentity
  author_name: string;      // 사용자 표시명
  content: string;          // 노트 텍스트
  timestamp_ms: number;     // 도착 시각 (ms)
  role: 'host' | 'participant';  // 작성자 역할 (시각 구별용)
}
```

### 핵심 동작

| 항목 | 명세 |
|-----|------|
| **DataChannel** | `chat` (reliable), `message_type='note'` |
| **구독** | RightPanel 마운트 시 즉시 구독, activeTab='notes'일 때 메시지 수신 및 notesStore에 누적 |
| **발행** | 모든 참가자가 입력 후 [전송] 클릭 → `chat`에 note publish |
| **자동 스크롤** | 새 노트 도착 시 스크롤 자동 최하단 이동, 사용자 수동 스크롤 시 auto-scroll 해제 (notesStore.isAutoScroll) |
| **시각적 강조** | 방장 노트: amber 좌측 강조선 또는 "방장" 배지 표시 (row 구분) |
| **저장 정책** | LiveKit `chat` DataChannel만 사용, Supabase 영구 저장 금지 (세션 내 휘발성) |

### DirectorNotesTab Props

```typescript
interface DirectorNotesTabProps {
  /**
   * 현재 room_id (세션 맥락용, DataChannel publish 시 포함)
   */
  roomId: string;
}
```

### 구현 의존성

```typescript
// notesStore (Zustand)
interface NotesState {
  notes: DirectorNote[];           // 누적 노트 배열 (시간순)
  isAutoScroll: boolean;           // auto-scroll 활성 여부
  addNote(note: DirectorNote): void;
  setAutoScroll(enabled: boolean): void;
  clearNotes(): void;              // 세션 종료 시 초기화
}
```

**구독 채널:**
- `chat` DataChannel의 `message_type='note'` → 메시지 수신 시 notesStore.addNote 호출

**발행 채널:**
- `chat` DataChannel에 `message_type='note'`로 publish

---

## 관련 문서

- `DESIGN-DIRECTION.md §6.3` — 우측 패널 레이아웃 SSOT (5탭, 사운드보드)
- `ChatPanel.md` — 탭 1 위임 컴포넌트
- `ScriptPanel.md` — 탭 2 기반 (미러 뷰 신규)
- `VgenPanel.md` — 탭 3 (VgenStatusTab) 위임
- `DubPanel.md` (예정) — 탭 4 (DubStatusTab) 위임
- `DirectorNotesTab.md` — 탭 5 (DirectorNotesTab) 위임 (ROOM-17)
- `contracts/_INDEX.md` — DataChannel 레지스트리 (`room-authority`, `chat`, `script-cue`, `blendshape`)
- `state-machines/` — mode 상태 머신 (Room.md 또는 Stage.md 참조)
- `FEATURE-SPEC.md` — VGEN-01~12, DUB-01~08, ROOM-17 (탭 진입점 명세)

---

## 한줄정리

RightPanel은 우측 14% 사이드바의 5탭(채팅·대본·VGen·DUB·노트) 컨테이너로, 각 탭 콘텐츠는 위임하고 stageStore.mode 변화에 따라 VGen/DUB 탭을 자동 활성화하며, 모든 탭 아래 사운드보드를 고정하고, 디렉터 노트 탭은 LiveKit DataChannel로 세션 내 휘발성 메모를 지원한다.
