---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->

# 11. PresenceAvatarStack

우상단 참가자 썸네일 N개 스택. 클릭 시 해당 슬롯 포커스.

## Props Interface

```typescript
interface PresenceAvatarStackProps {
  /**
   * 동시 표시 최대 아바타 개수
   * (선택) 기본값 4
   */
  maxVisible?: number;

  /**
   * 더보기 배지 스타일
   * (선택) 기본값 'badge'
   */
  overflowStyle?: 'badge' | 'tooltip';

  /**
   * 아바타 클릭 콜백
   * signature: (participantId: string) => void
   */
  onAvatarClick?: (participantId: string) => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `roomStore` | `participants` | ✓ | | 참가자 목록 (preview_image_url) |
| `stageStore` | `focusedSlot` | ✓ | ✓ | 포커스 슬롯 (클릭 시 업데이트) |

## DataChannel 의존성

**없음** — 상태 읽기만.

## LiveKit 이벤트

**없음**.

## Supabase 접근

| 테이블 | 작업 | 시점 |
|---|---|---|
| `room_participants` | preview_image_url 조회 | participants 로드 시 |

## 금지 사항 (MUST NOT)

- ❌ 자체적으로 참가자 상태 변경 (focusedSlot만 업데이트)
- ❌ 썸네일 클릭 시 slot_index 직접 변경 (HostConsole만)
- ❌ overflow 상황에서 모든 아바타 표시 (max 초과 금지)

## 컴포넌트 관계

```
[PresenceAvatarStack]
  ├─ read: roomStore.participants[] (preview_image_url)
  ├─ read/write: stageStore.focusedSlot
  │
  ├─ [AvatarThumbnail] x maxVisible
  │  ├─ src: preview_image_url
  │  ├─ on click: 
  │  │  └─ onAvatarClick(participantId)
  │  │  └─ stageStore.focusedSlot = slot_index
  │  │
  │  └─ if focusedSlot match: highlight border
  │
  └─ [+N Badge] (if overflow)
     └─ show "+"+(count-maxVisible)
```
