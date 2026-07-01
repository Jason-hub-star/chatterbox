---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- opencode: 2026-06-29 - C2·G-36 MUST NOT에 chat sanitize 참조 추가 (SecurityPolicies §6.4 3단계). Coded with OpenCode; high-cost model review recommended. -->

# 6. ChatPanel

우측 사이드바: 메시지 히스토리 + 입력창 + 반응 이모지.

## Props Interface

```typescript
interface ChatPanelProps {
  /**
   * 현재 room_id
   */
  roomId: string;

  /**
   * 팬 오픈 여부
   */
  isOpen: boolean;

  /**
   * 닫기 콜백
   */
  onClose?: () => void;

  /**
   * 에러 콜백
   */
  onError?: (error: Error) => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `userStore` | `userId` | ✓ | | 발신자 ID (메시지 author) |
| `roomStore` | `participants` | ✓ | | 참가자 목록 (sender 찾기) |
| `chatStore` | `messages` | ✓ | ✓ | 메시지 히스토리 (Realtime 반영, status='hidden'|'tombstone' 필터) |
| `chatStore` | `addMessage()` | | ✓ | 메시지 추가 (로컬 + DB) |
| `chatStore` | `hideMessage()` | | ✓ | Edge Function 경유 tombstone/hidden 처리 |

## DataChannel 의존성

**구독 (수신):**

| Channel | 메시지 형식 | 용도 |
|---------|----------|------|
| `chat` (reliable) | `{user_id, text, timestamp_ms, reaction_type?}` | 채팅 메시지 + 이모지 반응 |

**chat 메시지:**
```json
{
  "user_id": "uuid",
  "text": "안녕하세요!",
  "timestamp_ms": 1624561200000,
  "reaction_type": null
}
```

**reaction 메시지:**
```json
{
  "type": "reaction",
  "message_id": "uuid",
  "reaction": "👍",
  "user_id": "uuid",
  "timestamp_ms": 1624561200000
}
```

**발행 (송신):**
- 입력창에서 send → `send-chat` 또는 `send-viewer-chat` Edge Function 호출
- 이모지 버튼(👍😂👏😢) 클릭 → `send-viewer-reaction` 또는 서버 relay 호출
- 클라이언트는 직접 DataChannel publish 금지. 서버가 sanitize/rate limit/slow mode/blocked_words 통과 후 broadcast.

## LiveKit 이벤트

| 이벤트 | 핸들러 | 작업 |
|--------|--------|------|
| `room.onDataChannelMessage(channel='chat')` | ChatPanel | 메시지 수신, chatStore.addMessage() |

## Supabase 접근

| 테이블/Realtime | 작업 | 방법 |
|---|---|---|
| `messages` | 메시지 INSERT | Edge Function service role only |
| `messages` | status UPDATE | 신고/삭제/운영 숨김 시 Edge Function 경유 |
| `Realtime: messages` | INSERT/UPDATE 구독 | room_id 필터, 실시간 추가/숨김 반영 |

**중요:** Supabase `messages`가 진실이다. ChatOverlay는 서버 relay 또는 Realtime 결과만 표시하고, actor/host/viewer 클라이언트가 만든 DataChannel payload를 진실로 취급하지 않는다.

## 금지 사항 (MUST NOT)

- ❌ 클라이언트가 DataChannel chat을 직접 publish
- ❌ 클라이언트가 `messages`에 직접 INSERT
- ❌ 다른 room의 메시지 표시 (room_id 필터 필수)
- ❌ 메시지를 로컬 상태로만 관리 (Supabase가 진실)
- ❌ 메시지 hard delete — `status='tombstone'|'hidden'`, `hidden_reason`, `hidden_at`으로 숨김
- ❌ 운영 숨김 시 audit_logs 생략 — SecurityPolicies §14 필수
- ❌ 자신의 메시지도 Realtime 구독 대기 (즉시 표시)
- ❌ `sanitizeChatInput()` 통과 없이 메시지 전송 (SecurityPolicies §6.4 3단계 sanitize — `javascript:`·`data:` 프로토콜, HTML 태그, 500자 초과 차단)
- ❌ `dangerouslySetInnerHTML`로 메시지 렌더 (React 자동 이스케이프만 허용)
- ❌ 링크 렌더 시 `SafeLink` 컴포넌트 경유 없이 직접 `<a href>` 사용 (프로토콜 재검증 필수)

## 컴포넌트 관계

```
[ChatPanel]
  ├─ subscribe: chat DataChannel
  ├─ subscribe: messages Realtime (INSERT)
  │
  ├─ [메시지 목록]
  │  ├─ read: chatStore.messages
  │  └─ render: user_id, text, timestamp
  │
  ├─ [반응 이모지]
  │  ├─ 👍 😂 👏 😢 버튼
  │  └─ on click: send-viewer-reaction/send-chat Edge Function
  │
  └─ [입력창]
     ├─ on send:
     │  └─ call: send-chat or send-viewer-chat Edge Function
     └─ receive: messages Realtime or server relay → chatStore.addMessage()
```
