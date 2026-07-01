---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- opencode: 2026-06-29 - C2·G-36 MUST NOT에 출력 sanitize 참조 추가 (SecurityPolicies §6.4.3). Coded with OpenCode; high-cost model review recommended. -->

# 7. ChatOverlay

무대 위에 채팅 메시지가 떠올랐다 자동 사라지는 오버레이.

## Props Interface

```typescript
interface ChatOverlayProps {
  /**
   * 메시지 화면 시간 (ms)
   * (선택) 기본값 4000
   */
  messageDuration?: number;

  /**
   * 동시 표시 메시지 개수
   * (선택) 기본값 3
   */
  maxMessages?: number;

  /**
   * CSS z-index
   * (선택) 기본값 10
   */
  zIndex?: number;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `chatStore` | `overlayMessages` | ✓ | ✓ | 오버레이 표시 중인 메시지 (로컬) |

## DataChannel 의존성

**구독 (수신):**

| Channel | 메시지 형식 | 용도 |
|---------|----------|------|
| `chat` (reliable) | `{user_id, text, timestamp_ms}` | 메시지 수신 → 오버레이 표시 |

**발행:** 없음 (표시만).

## LiveKit 이벤트

| 이벤트 | 핸들러 | 작업 |
|--------|--------|------|
| `room.onDataChannelMessage(channel='chat')` | ChatOverlay | 메시지 수신, 오버레이 리스트 추가 |

## Supabase 접근

**없음** — DataChannel 수신만 사용 (히스토리 불필요).

## 금지 사항 (MUST NOT)

- ❌ 직접 Supabase 쿼리 (DataChannel 수신만)
- ❌ 메시지 히스토리 보관 (N초 후 자동 제거)
- ❌ pointer-events: auto (클릭 방해 금지, none 필수)
- ❌ 무대 아바타와 겹치는 고정 위치 (floating 배치)
- ❌ CSS animation 프레임 떨림 (will-change: opacity, transform)
- ❌ `dangerouslySetInnerHTML`로 메시지 렌더 (SecurityPolicies §6.4.3 출력 sanitize — React 자동 이스케이프만 허용)
- ❌ `reaction_type` 화이트리스트 외 이모지 렌더 (`heart`·`star`·`clap`·`laugh`만 허용, ChatOverlay.md §Reaction Burst)

## § Reaction Burst 애니메이션

**트리거 조건:**
- `chat` DataChannel 메시지 수신 시 `reaction_type` 필드가 존재하면 작동
- `text`는 없거나 빈 문자열 (순수 반응 메시지)

**애니메이션 스펙:**

| 항목 | 스펙 | 비고 |
|------|-----|------|
| Burst 개수 | 3~5개 이모지 | 랜덤 |
| 각 이모지 크기 | 18~22px | 랜덤 variation |
| 펼침 각도 | -20°~+20° | 중심 기준 |
| Y 이동 | `translateY(-10px)` → `translateY(-40px)` | ease-out |
| 투명도 | opacity 1 → 0 | fade-out |
| Duration | 1.5s | 상수 |
| Easing | ease-out | 자연스러운 감속 |

**위치 계산:**

1. `target_participant_id` 존재 → 해당 ParticipantSlot 중앙 위에 spawn
2. 없고 `stageStore.active_speaker_id` 존재 → 활성 스피커 위
3. 둘 다 없음 → 무대 중앙

**DataChannel 메시지 확장:**

```typescript
type ReactionMessage = {
  user_id: string;
  reaction_type: 'heart' | 'star' | 'clap' | 'laugh';
  target_participant_id?: string;  // 특정 배우 지목 (선택)
  timestamp_ms: number;
  // text는 생략 또는 빈 문자열 ''
}

type ChatMessage = {
  user_id: string;
  text?: string;
  reaction_type?: string;
  timestamp_ms: number;
}
```

**동시 표시 제한:**
- 같은 시간대 최대 5개 burst 동시 표시
- 초과 시 큐잉 후 순차 표시 (250ms 간격)
- 별도 reaction 큐 관리 (message 큐와 독립)

**Emoji Mapping:**

| reaction_type | 이모지 |
|---------------|-------|
| `heart` | ♡ |
| `star` | ★ |
| `clap` | 👏 |
| `laugh` | 😂 |

**금지 사항 (MUST NOT):**

- ❌ pointer-events: auto (클릭 방해 금지, none 필수)
- ❌ text와 reaction_type 동시 발행 (둘 중 하나만)
- ❌ burst 애니메이션 중 DOM 조기 제거 (animationend 이벤트 필수)

## 컴포넌트 관계

```
[ChatOverlay]
  ├─ pointer-events: none
  ├─ subscribe: chat DataChannel
  │
  ├─ on message received:
  │  ├─ add to overlay_messages (max 3)
  │  ├─ animate: fade-in + slide-up
  │  └─ after messageDuration:
  │     └─ remove + fade-out
  │
  └─ [FloatingMessage] x 3 max
     ├─ CSS: position: fixed, bottom: +Y, opacity: fade
     └─ animation: keyframes fade-in/out + slide-up
```
