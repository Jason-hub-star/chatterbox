---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- 룸 레이아웃 배치 엔진: DESIGN-DIRECTION.md §6.4 -->

# 1. StageLayout

E형 무대 레이아웃의 인원 수 자동 배치 엔진. MVP는 ParticipantSlot 6개(좌컬럼 3+우컬럼 3)를 2인/4인/6인에 따라 동적 배정하고, 인원 변동 시 motion v12 spring 애니메이션 적용.

ponytail: 8슬롯 하단 2개는 과거 프로토타입 흔적이다. DB `rooms.max_participants`와 FEATURE-SPEC ROOM-02가 6인 기준이므로 MVP에서는 비활성이다. 8인 방을 되살릴 때는 DB max, RLS, LiveKit 권한, 레이아웃을 같이 올린다.

## Props Interface

```typescript
interface StageLayoutProps {
  /**
   * 현재 룸의 총 participant 수 (2~6명)
   * 이 값이 변하면 슬롯 배치 재계산 + 애니메이션 트리거
   */
  participantCount: number;

  /**
   * room_participants 테이블의 현재 participant 배열
   * (slot_index 재계산의 입력)
   * [{user_id, slot_index, role, state, ...}]
   */
  participants: RoomParticipant[];

  /**
   * 슬롯이 클릭되었을 때 콜백
   * signature: (slotIndex: number, participant?: RoomParticipant) => void
   * (선택) 없으면 포커스만 업데이트하고 콜백 호출 안 함
   */
  onSlotClick?: (slotIndex: number, participant?: RoomParticipant) => void;

  /**
   * 슬롯 배치가 완료되었을 때 콜백 (애니메이션 종료 후)
   * signature: (layout: SlotLayout[]) => void
   * (선택) 없으면 호출 안 함
   */
  onSlotLayoutComplete?: (layout: SlotLayout[]) => void;

  /**
   * 컨테이너 ID (CSS 쿼리, 절대 위치 기준)
   * (기본값) "stage-container"
   */
  containerId?: string;

  /**
   * 전환 애니메이션 속도 (motion v12 spring config)
   * (기본값) { type: 'spring', damping: 25, stiffness: 300 }
   * (참고) DESIGN-DIRECTION §6.4: 0.3s transition
   */
  transitionConfig?: MotionSpringConfig;
}
```

## Store 의존

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `stageStore` | `slots` | ✓ | ✓ | 6개 활성 슬롯의 위치·크기·상태 배열 (computed) |
| `stageStore` | `focusedSlot` | ✓ | ✓ | 현재 포커스된 슬롯 인덱스 (-1 = 없음) |
| `stageStore` | `mode` | ✓ | | 현재 모드 ('normal' \| 'vgen' \| 'dub') |
| `roomStore` | `participants` | ✓ | | participant 목록 (메인 진실 공급원) |
| `roomStore` | `hostId` | ✓ | | 호스트 ID (슬롯 강조 대상 확인) |
| `userStore` | `userId` | ✓ | | 본인 ID (자신의 슬롯 식별) |

**읽기 전용:** 대부분 (배치 계산은 props와 store 조합)
**쓰기:** stageStore.slots, stageStore.focusedSlot (배치 재계산 시)

## DataChannel 의존성

**직접 발행/구독 없음** — StageLayout은 roomStore/stageStore에 이미 반영된 참가자·슬롯 상태만 렌더한다. slot 변경은 HostConsole/RoomView의 `room-authority` 처리 결과로 들어온다.

## 슬롯 배치 알고리즘

### 좌표 정의

컨테이너 기준 절대 위치. 16:9 비율 가정.

```typescript
// 기본 배치 정상 정의 (컨테이너 % 단위)
const SLOT_DEFAULTS = {
  container: { left: 0, top: 0, width: '100%', height: '100%' },
  
  // 좌측 컬럼 (3개 슬롯)
  left: {
    column: { left: '13.5%', width: '7.5%' },
    rows: [
      { top: '13%' },    // slot 0
      { top: '40%' },    // slot 1
      { top: '62%' },    // slot 2
    ],
  },
  
  // 우측 컬럼 (3개 슬롯)
  right: {
    column: { right: '13%', width: '7.5%' },
    rows: [
      { top: '13%' },    // slot 3
      { top: '40%' },    // slot 4
      { top: '62%' },    // slot 5
    ],
  },
  
  // 하단 행 (2개 슬롯) — MVP 비활성, 8인 확장 때만 사용
  bottom: {
    row: { top: '72%', height: '8%' },
    columns: [
      { left: '35%', width: '8%' },    // slot 6
      { left: '52%', width: '8%' },    // slot 7
    ],
  },
};
```

### 배치 규칙 (인원 수별)

```typescript
/**
 * 인원 수 → 활성 슬롯 매핑
 * 활성 슬롯 외 나머지는 hidden 상태로 유지 (메모리 아끼기 위해 dom 제거하지 않음)
 */
function calculateSlotLayout(participantCount: number): SlotLayout[] {
  const baseLayout = initializeBaseLayout();
  
  switch (participantCount) {
    case 2:
      // 좌1 + 우1 (중앙 정렬, 가운데 섹션만 활성)
      return [
        { ...baseLayout.left[1], active: true },      // slot 0 → 좌측 중앙
        { ...baseLayout.right[1], active: true },     // slot 1 → 우측 중앙
        ...baseLayout.left[0, 2].map(s => ({ ...s, active: false })),
        ...baseLayout.right[0, 2].map(s => ({ ...s, active: false })),
        ...baseLayout.bottom.map(s => ({ ...s, active: false })),
      ];
    
    case 4:
      // 좌2 + 우2 (상단·중앙, 하단 비활성)
      return [
        { ...baseLayout.left[0], active: true },      // slot 0 → 좌상
        { ...baseLayout.left[1], active: true },      // slot 1 → 좌중
        { ...baseLayout.right[0], active: true },     // slot 2 → 우상
        { ...baseLayout.right[1], active: true },     // slot 3 → 우중
        { ...baseLayout.left[2], active: false },
        { ...baseLayout.right[2], active: false },
        ...baseLayout.bottom.map(s => ({ ...s, active: false })),
      ];
    
    case 6:
      // 좌3 + 우3 (전체 좌우컬럼, 하단 비활성)
      return [
        { ...baseLayout.left[0], active: true },      // slot 0
        { ...baseLayout.left[1], active: true },      // slot 1
        { ...baseLayout.left[2], active: true },      // slot 2
        { ...baseLayout.right[0], active: true },     // slot 3
        { ...baseLayout.right[1], active: true },     // slot 4
        { ...baseLayout.right[2], active: true },     // slot 5
        ...baseLayout.bottom.map(s => ({ ...s, active: false })),
      ];
    
    default:
      // 2/4/6 외면 전체 숨김
      return baseLayout.map(s => ({ ...s, active: false }));
  }
}

/**
 * 내부 타입
 */
interface SlotLayout {
  index: number;             // 0-5 active in MVP; 6-7 reserved for future 8-person rooms
  left?: string;             // CSS left (%)
  right?: string;            // CSS right (%)
  top: string;               // CSS top (%)
  width: string;             // CSS width (%)
  height: string;            // CSS height (%)
  active: boolean;           // 표시 여부
  participant_id?: string;   // 할당된 participant (없으면 undefined)
  isHost?: boolean;          // 호스트 여부 (강조용)
  isSelf?: boolean;          // 본인 여부
}
```

## 애니메이션 전환

```typescript
/**
 * participantCount 변경 시 슬롯 재배치 애니메이션
 * - 기존 슬롯 위치 → 새 슬롯 위치로 0.3s spring animation
 * - 새로 활성화된 슬롯은 fade-in (opacity 0 → 1)
 * - 비활성화된 슬롯은 fade-out (opacity 1 → 0)
 */
function animateLayoutChange(
  oldLayout: SlotLayout[],
  newLayout: SlotLayout[],
  transitionConfig: MotionSpringConfig
): void {
  oldLayout.forEach((oldSlot, i) => {
    const newSlot = newLayout[i];
    const element = document.querySelector(`[data-slot-index="${i}"]`);
    
    if (!element) return;
    
    if (oldSlot.active && newSlot.active) {
      // 이동 애니메이션
      motion.animate(element, {
        left: newSlot.left,
        top: newSlot.top,
        width: newSlot.width,
        height: newSlot.height,
      }, {
        ...transitionConfig,
        duration: undefined, // spring 사용 시 duration 없음
      });
    } else if (!oldSlot.active && newSlot.active) {
      // Fade-in + 위치 설정
      motion.animate(element, {
        opacity: [0, 1],
        left: newSlot.left,
        top: newSlot.top,
        width: newSlot.width,
        height: newSlot.height,
      }, transitionConfig);
    } else if (oldSlot.active && !newSlot.active) {
      // Fade-out (display:none은 애니메이션 후)
      motion.animate(element, {
        opacity: [1, 0],
      }, transitionConfig);
      // 애니메이션 종료 후 display 변경
      setTimeout(() => {
        element.style.display = 'none';
      }, 300); // spring 기본 duration
    }
  });
  
  // 애니메이션 완료 콜백
  if (onSlotLayoutComplete) {
    setTimeout(() => {
      onSlotLayoutComplete(newLayout);
    }, 300);
  }
}

/**
 * 개별 슬롯 포커스 전환 (클릭 시)
 * - 기존 focused 슬롯: glow 제거 (scale-down animation)
 * - 새 focused 슬롯: glow 강조 (scale-up animation)
 */
function focusSlot(slotIndex: number): void {
  const oldFocused = stageStore.focusedSlot;
  const oldElement = oldFocused >= 0
    ? document.querySelector(`[data-slot-index="${oldFocused}"]`)
    : null;
  const newElement = document.querySelector(`[data-slot-index="${slotIndex}"]`);
  
  if (oldElement) {
    motion.animate(oldElement, { scale: 1 }, { duration: 200 });
  }
  
  if (newElement) {
    motion.animate(newElement, { scale: 1.03 }, {
      type: 'spring',
      damping: 20,
      stiffness: 200,
    });
  }
  
  stageStore.focusedSlot = slotIndex;
}
```

## 시각 규칙

```typescript
/**
 * 슬롯 상태별 스타일 적용 (CSS 클래스 또는 인라인)
 */

// 빈 슬롯 (participant 없음)
.slot.empty {
  background: #18181C;  /* stage-panel — 2026-07-01 무채색 개정, 구 night-blue #1A1A3E */
  border: 1px solid rgba(46, 46, 53, 0.6);  /* stage-border */
  color: #9C9CA3;  /* stage-text-muted */
}

// 채워진 슬롯 (participant 있음)
.slot.filled {
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid var(--scene-accent);  /* 동적 테마 색 */
  box-shadow: 0 0 16px var(--scene-accent);  /* glow */
}

// 연기 중 슬롯 (active_speaker)
.slot.active-speaker {
  border: 2px solid var(--scene-accent);
  box-shadow: 0 0 24px var(--scene-accent), inset 0 0 16px rgba(255,140,42,.1);
  transform: scale(1.03);  /* 미세 확대 */
}

// 포커스된 슬롯 (focusedSlot)
.slot.focused {
  border: 2px solid var(--scene-accent);
  box-shadow: 0 0 20px var(--scene-accent);
  z-index: 10;  /* 시각적 우선순위 */
}

// 트래킹 실패 상태
.slot.tracking-failed {
  border: 2px dashed rgba(255, 100, 100, 0.4);
  background: rgba(139, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.slot.tracking-failed::before {
  content: '👤';
  font-size: 24px;
  opacity: 0.6;
}

.slot.tracking-failed::after {
  content: '인식 중...';
  font-size: 11px;
  color: #888;
}
```

## MUST NOT

- ❌ 슬롯 위치를 하드코딩 (props.participantCount로 계산, 상수로 관리)
- ❌ PixiJS Canvas에 DOM 슬롯을 직접 주입 (z-index 계층 분리 필수 — DESIGN-DIRECTION §6.7)
- ❌ 인원 변동 시 포크 상태를 localStorage에 캐싱 (StageLayout은 stateless, store만 진실)
- ❌ 애니메이션 없이 즉시 배치 변경 (반드시 motion v12 spring 사용)
- ❌ focusedSlot 변경 시 ParticipantSlot에 직접 신호 (store update로만, 자동 re-render)
- ❌ 슬롯 클릭 이벤트를 직접 처리 (onSlotClick 콜백만, 부모 컴포넌트가 처리)
- ❌ 슬롯 배치 로직을 ParticipantSlot에 분산 (StageLayout이 단일 출처)
- ❌ participant_id와 slot_index의 1:1 가정 (N:1 다대일 가능, 빈 슬롯 존재)
- ❌ 트래킹 실패 상태 판정 (trackingStore 담당, StageLayout은 UI만)

## 컴포넌트 관계

```
[RoomView]
  ├─ subscribe roomStore.participants
  ├─ subscribe stageStore.focusedSlot
  └─ [StageLayout]
      ├─ props: participantCount, participants[], onSlotClick
      ├─ calculate: slotLayout[] (participantCount 기반)
      ├─ animate: layout change (motion v12 spring)
      │
      └─ [ParticipantSlot] x 8 (index 0-7)
          ├─ each slot position from stageStore.slots
          ├─ onClick → onSlotClick(index) → stageStore.focusedSlot update
          ├─ subscribe focusedSlot (class toggle)
          ├─ [AvatarCanvas] + [ParticipantLabel]
          │   └─ subscribe blendshape (DataChannel)
          │
          └─ visual state
              ├─ .empty (stage-panel)
              ├─ .filled (--scene-accent glow)
              ├─ .active-speaker (max glow + scale)
              ├─ .focused (highlight)
              └─ .tracking-failed (dashed + icon)
```

## 관련 문서

- `../DESIGN-DIRECTION.md` § 6.2~6.4 — E형 레이아웃 좌표, ParticipantSlot 배치, 인원별 배치 규칙
- `../DESIGN-DIRECTION.md` § 6.7 — z-index 계층 (StageLayout은 z-1 ParticipantSlot)
- `../state-machines/` — stageStore 상태 머신
- `contracts/ParticipantSlot.md` — 개별 슬롯 컴포넌트 인터페이스
- `contracts/RoomView.md` — 부모 orchestrator
