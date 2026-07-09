---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->

# 5. HostConsole

호스트 전용 제어판. 탭: 배경/슬롯/사운드보드/큐. room-authority DataChannel 발행의 유일한 진입점.

## Props Interface

```typescript
interface HostConsoleProps {
  /**
   * 호스트인지 여부 (false면 렌더 안 함)
   */
  isHost: boolean;

  /**
   * 현재 room_id (room-authority 발행 검증)
   */
  roomId: string;

  /**
   * 콘솔 오픈 여부
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
| `userStore` | `userId` | ✓ | | 본인 ID (호스트 확인) |
| `roomStore` | `hostId` | ✓ | | 현재 호스트 ID (권한 검증) |
| `roomStore` | `participants` | ✓ | | 슬롯 배치 대상 participant list |
| `stageStore` | `backgroundUrl` | ✓ | ✓ | 현재 배경 URL (탭에서 변경) |
| `stageStore` | `slotPosition[0-5]` | ✓ | ✓ | 슬롯 위치·크기 조정 |
| `stageStore` | `cueIndex` | ✓ | ✓ | 현재 큐 인덱스 (큐 탭) |
| `participantStore` | `[participantId].mutedByHost` | ✓ | ✓ | 음성 차단 (사운드 탭) |

**쓰기:** 호스트만 위 필드 변경 가능.

## DataChannel 의존성

**발행 (송신) — 유일한 진입점:**

| Channel | 메시지 형식 | 타입 | 빈도 |
|---------|----------|------|------|
| `room-authority` (reliable) | `{type, payload, host_id, seq, timestamp_ms}` | slot_change \| bg_change \| sound_trigger \| cue_advance | ~0.1 Hz |

**room-authority 발행 규칙:**

```json
{
  "type": "bg_change",
  "payload": {
    "background_url": "https://r2.example.com/bg-001.mp4",
    "transition_type": "fade"
  },
  "host_id": "user-uuid",
  "seq": 1234,
  "timestamp_ms": 1624561200000
}
```

**구독:** room-authority 자신의 메시지 확인용 (loopback 감지).

## LiveKit 이벤트

| 이벤트 | 핸들러 | 작업 |
|--------|--------|------|
| `room.onDataChannelMessage()` | room-authority listener | 자신의 명령 echo 확인 |

**주로 publish만 담당.**

## Supabase 접근

| 테이블 | 작업 | RLS 정책 |
|---|---|---|
| `rooms` | background_url 업데이트 | 호스트 확인 후 UPDATE |
| `room_participants` | slot_index, muted_by_host 업데이트 | 호스트 확인 후 UPDATE |
| `scripts` | current_cue_index 업데이트 | 호스트 확인 후 UPDATE |
| `messages` | warning/system moderation message INSERT | `send-system-message`/moderation Edge Function 경유 |

**모든 권한 쓰기는 Edge Function이 검증·DB 업데이트 후 필요한 경우 `room-authority`/Realtime으로 브로드캐스트한다.**

## G-167·G-260 — ParticipantSafetyLadder 및 실시간 피드백

호스트 참가자 관리 액션은 강퇴를 바로 노출하기보다 단계적 조치로 묶으며, 각 조치 후 대상자·주변 참가자에게 실시간 피드백을 제공한다.

```
[Participant row ⋮]
  ├─ 경고 보내기
  │   └─ send-system-message Edge Function → messages INSERT message_type='system', metadata.reason
  │       └─ 수신자 화면: red toast "경고: [사유]" 3초 + 채팅창 강조 시스템 메시지
  ├─ 임시 음소거
  │   └─ room_participants.muted_by_host=true, muted_until=now()+duration
  │       └─ 대상자 화면: 카운트다운 배지 "🔇 2분 33초 남음" + 뮤트 해제 시 안내 토스트
  └─ 강퇴
      └─ kick-participant Edge Function + 최종 확인 모달
          └─ 다른 참가자 전원: broadcast 시스템 메시지 "[이름]님이 방에서 제거되었습니다"
```

### 단계별 규칙

| 단계 | 권장 UI | 서버 작업 | 대상자 피드백 | 주변 참가자 피드백 | 되돌리기 |
|---|---|---|---|---|---|
| 경고 | 사유 선택 + 자유 입력 120자 | `messages.message_type='system'` | red toast "경고: [사유]" 3초 유지 | 채팅창 강조 시스템 메시지 | 필요 없음 |
| 임시 뮤트 | 1분/5분/공연 끝까지 | `mutedByHost`, `muted_until` 업데이트 + LiveKit mute | 카운트다운 배지 "🔇 MM분 SS초 남음" (실시간 갱신) + 해제 시 "🔊 음성이 복구되었습니다" 토스트 | 특별 안내 없음 | 호스트가 즉시 해제 가능 (배지 즉시 숨김) |
| 강퇴 | 최종 확인 모달 | `kick-participant` Edge Function + Realtime DELETE room_participants | (자동 입장 해제, 화면 전환) | broadcast "🚪 [이름]님이 방에서 제거되었습니다" 시스템 메시지 (모든 참가자 채팅창 표시) | 재초대 링크 새 발급 전 재입장 불가 |

### G-260 — 실시간 피드백 상세

#### (1) 경고 발송 시 대상자 화면

```typescript
// room-authority 또는 별도 system-message 채널 수신
// 수신 시 red 토스트 표시 (3초 자동 닫힘)
type WarningMessage = {
  type: 'warning',
  payload: {
    reason: string,  // 예: "부적절한 발언"
    timestamp_ms: number
  }
}

// UI: Toast <Alert variant="destructive" title="경고" description={reason} duration={3000} />
// 동시에 ChatPanel에 시스템 메시지 추가: "[당신의 닉네임] 님이 경고를 받으셨습니다: [사유]"
```

#### (2) 임시 뮤트 시 대상자 화면

```typescript
// room-authority mute_countdown 메시지
type MuteCountdownMessage = {
  type: 'mute_countdown',
  payload: {
    muted_until_ms: number,  // 뮤트 해제 예정 시각
    duration_sec: number      // 남은 초 수
  }
}

// UI: ParticipantSlot 상단에 카운트다운 배지 렌더
// "🔇 2분 33초 남음" (매 초 갱신)
// muted_until_ms 도달 시:
//   - 배지 숨김
//   - Toast "🔊 음성이 복구되었습니다" 1초 표시
```

#### (3) 강퇴 시 모든 참가자 화면

```typescript
// room-authority participant_kicked 메시지 (broadcast)
type ParticipantKickedMessage = {
  type: 'participant_kicked',
  payload: {
    participant_id: string,
    participant_display_name: string  // 필수: 채팅창에 표시할 이름
  }
}

// UI: 모든 참가자의 ChatPanel에 시스템 메시지 추가
// "🚪 [이름]님이 방에서 제거되었습니다"
// 대상자: 자동 입장 해제 → LeavingScreen으로 이동
```

**MUST NOT**
- ❌ warning 없이 강퇴만 유일한 참가자 관리 액션으로 노출
- ❌ 호스트 자신에게 경고/뮤트/강퇴 적용
- ❌ 임시 뮤트 duration 없이 영구 상태로 저장
- ❌ 뮤트 카운트다운 배지 없이 남은 시간을 명시하지 않은 채 음성 차단 유지
- ❌ 강퇴 메시지를 강퇴된 대상자에게만 숨기기 (모든 참가자에게 공개 broadcast 필수)

## HOST-12 — Stage Manager Overlay

호스트가 StreamYard식으로 무대 전체 상태를 한 화면에서 파악하고 조작하는 오버레이. 기존 탭형 HostConsole을 대체하지 않고, 공연 중 기본 표면으로 우선 노출한다.

```
┌───────────────┬───────────────────────────────┬──────────────────┐
│ Participants  │ Main Stage                     │ Chat / VGEN      │
│ slot + status │ mode: normal/vgen/dub          │ reaction feed    │
│ mute/camera   │ current cue + next cue         │ job status       │
│ tracking ping │ recording badge                │ safety alerts    │
├───────────────┴───────────────────────────────┴──────────────────┤
│ Soundboard · Record · Cue Prev/Next · VGEN Trigger · Rehearsal    │
└───────────────────────────────────────────────────────────────────┘
```

### 상태 표시

| 영역 | 표시 | 조작 |
|---|---|---|
| 참가자 | slot, role, mic, camera, tracking, connection quality, muted_until | 드래그 순서 변경, 경고, 임시 뮤트, 강퇴 |
| 중앙 무대 | 현재 mode, 배경, 현재 큐, 다음 큐, 녹화 상태 | 큐 전진/후퇴, 배경 전환, 녹화 시작/정지 |
| 우측 피드 | 채팅, 리액션, VGEN job status, safety alerts | 슬로우모드, 채팅 클리어, VGEN 승인/취소 |
| 하단 바 | 사운드보드, 녹화, 리허설/본공연, VGEN trigger | 즉시 실행 전 최종 확인 |

**MUST NOT**
- ❌ 같은 호스트 액션을 탭 HostConsole과 Overlay에서 서로 다른 API로 실행
- ❌ VGEN/녹화/강퇴처럼 비용·데이터·권한이 걸린 액션을 확인 없이 실행
- ❌ 참가자 connection quality를 숨긴 채 녹화/본공연 시작

## G-154 — RaiseHandQueue (ROOM-20·21)

관객이 손들기를 하면 호스트 콘솔 큐에 시간순으로 쌓인다. 호스트는 큐 순서대로 무대 초대(ROOM-21)를 실행한다.

> **as-built (2026-07-09, 배포됨)** — MVP 구현. 아래 계약과의 편차: ①손들기·초대·수락은 **Edge 경유**(`raise-hand`·`invite-to-stage`·`accept-stage-invite`) — RLS가 서버쓰기만 허용하므로 클라 직접 UPDATE 대신. ②호스트 큐 갱신은 `room-authority` broadcast(`raise_hand`/`stage_invite`/`promoted`) + `list-room-members`(raise_hand_at 반환) 재조회 — Realtime publication 대신(리액션·cue와 동형 서버 릴레이·스푸핑 차단). ③승격은 `promote_viewer_to_actor` RPC → 대상 클라가 `useLiveKitRoom.reconnectNonce`로 새 토큰(canPublish=true) 재연결. **defer(트랙 B)**: [무시] 버튼·슬롯 지정·경합(정원 참) 피드백 UX.

### 데이터 흐름

```
[관객] 손들기 버튼 클릭
  └─ Supabase UPDATE room_participants SET raise_hand_at = now() WHERE id = auth.uid()
      └─ Supabase Realtime → HostConsole 큐 자동 갱신 (raise_hand_at ASC 정렬)

[호스트] [초대] 클릭
  └─ Edge Function create-stage-invite { participant_id, slot_index }
  └─ 대상 참가자에게 수락 모달 표시
  └─ 대상 참가자 [수락] → accept-stage-invite Edge Function
  └─ GreenRoom/QuickReady 통과 후 room_participants.role='actor', slot_index 배정, LiveKit token 재발급
  └─ server relay: room-authority invite_to_stage_accepted { participant_id, slot_index }
```

### UI

```
[RaiseHandQueue 탭 — HostConsole]
┌──────────────────────────────────────┐
│ 손들기 큐 (3)                         │
│ ① 닉네임A   08:23  [초대] [무시]       │
│ ② 닉네임B   09:11  [초대] [무시]       │
│ ③ 닉네임C   09:45  [초대] [무시]       │
└──────────────────────────────────────┘
```

- **무시**: `raise_hand_at = NULL` (초대 없이 큐 제거)
- **초대**: `invite_to_stage` 발행 → 빈 슬롯 자동 배정 (slot_index는 호스트가 선택 또는 자동)
- 큐가 비어있으면 탭에 배지 미표시

### Supabase

| 테이블 | 컬럼 | 작업 | 비고 |
|---|---|---|---|
| `room_participants` | `raise_hand_at TIMESTAMP WITH TIME ZONE DEFAULT NULL` | UPDATE | DATA-SCHEMA 추가 필요 |

### DataChannel 확장

`room-authority` 에 `stage_invite_created`, `invite_to_stage_accepted` 타입 추가:
```json
{
  "type": "invite_to_stage_accepted",
  "payload": { "participant_id": "uuid", "slot_index": 2 },
  "host_id": "uuid", "seq": 5678, "timestamp_ms": 1234567890000
}
```

### MUST NOT

- ❌ 손들기 없이 호스트가 임의 관객을 강제 무대 배치 (반드시 raise_hand_at 선행)
- ❌ raise_hand_at을 DataChannel로만 추적 (Supabase room_participants가 SSOT)
- ❌ 대상자의 명시적 수락·GreenRoom/QuickReady·새 actor token 없이 viewer를 무대로 전환
- ❌ invite_to_stage 발행 전 slot_index 유효성 검증 생략 (빈 슬롯인지 확인 필수)

---

## G-155 — Chat Safety (HOST-09~11)

### HOST-09 — 슬로우 모드

채팅 메시지 전송 간격을 강제 제한한다.

| 항목 | 내용 |
|---|---|
| 설정 값 | 0(비활성) / 5초 / 10초 / 30초 |
| 저장 위치 | `rooms.chat_slow_mode_seconds INTEGER DEFAULT 0` |
| DataChannel | `room-authority slow_mode { seconds }` — 실시간 전파 |
| 클라이언트 | 전송 버튼 비활성 + 카운트다운 타이머 표시 |

### HOST-10 — 금칙어 필터

| 항목 | 내용 |
|---|---|
| 저장 위치 | `rooms.blocked_words TEXT[] DEFAULT '{}'` |
| 1차 방어 | 클라이언트: 전송 전 단어 포함 여부 검사 → toast 차단 |
| 2차 방어 | Edge Function (messages INSERT 게이트): 클라이언트 우회 방지 |
| UI | 호스트 금칙어 입력창 + 현재 목록 칩 표시 |

### HOST-11 — 채팅 클리어

```
[호스트] "채팅 전체 삭제" 클릭 → 확인 모달
  └─ Edge Function clear-chat 호출 { room_id, before_timestamp, reason, idempotency_key }
  └─ Supabase: messages SET status='hidden', hidden_reason='host_clear', hidden_by, hidden_at WHERE room_id AND created_at <= before_timestamp
  └─ audit_logs INSERT(event_type='chat_cleared')
  └─ server relay: room-authority chat_clear { before_timestamp }
  └─ 모든 참가자 ChatPanel: visible messages만 로컬 비움. admin/evidence view 원문 보존
```

### Supabase 추가 컬럼 (rooms 테이블)

```sql
chat_slow_mode_seconds INTEGER DEFAULT 0,
blocked_words TEXT[] DEFAULT '{}'
-- DATA-SCHEMA rooms 테이블에 추가 필요 (G-155)
```

### UI (Stage Manager Overlay 우측 피드 통합)

```
[채팅 탭 — 호스트 전용 툴바]
┌───────────────────────────────────────────────┐
│ 슬로우 모드: [끔 ▼]  금칙어 [설정]  [전체 삭제] │
└───────────────────────────────────────────────┘
```

### DataChannel 확장

`room-authority` 에 `slow_mode`, `chat_clear` 타입 추가:
```typescript
| 'slow_mode'   // HOST-09 { seconds: 0|5|10|30 }
| 'chat_clear'  // HOST-11 { before_timestamp: number }
```

### MUST NOT

- ❌ 금칙어 필터를 클라이언트 전용으로만 구현 (Edge Function 이중 방어 필수)
- ❌ chat_clear를 DB 하드 삭제로 구현 (messages.deleted_at 소프트 삭제)
- ❌ chat_clear로 원문 증거를 삭제하거나 admin/evidence view에서 숨김
- ❌ 슬로우 모드 중 남은 시간 표시 없이 전송만 차단
- ❌ HOST-09~11 액션을 호스트 확인 없이 실행

---

## 금지 사항 (MUST NOT)

- ❌ 비호스트가 HostConsole 렌더 (isHost 게이트 필수)
- ❌ 호스트 검증 없이 room-authority 발행 (권한 확인 필수)
- ❌ room-authority를 직접 메시지 포맷 변경 (DATA-SCHEMA.md 스키마 따르기)
- ❌ 배경 변경 후 Supabase 업데이트 생략 (DB 일관성)
- ❌ 슬롯 변경 시 participant가 JOINING 상태인 경우 강제 배치 (CONNECTED 대기)
- ❌ 호스트 자신의 음성 차단 (다른 호스트만 가능)

---

## G-64 — Self-모니터 PiP 토글 (참고)

**G-64 명세:** `RoomView.md` §G-64 참조.

**토글 UI 위치 (Option):**
- **권장:** SettingsPage "접근성" 탭 (모든 사용자가 접근 가능)
- **대안:** HostConsole 하단 액션 바 "📷 내 미리보기" 버튼 (호스트만)

**현재 구현 예상:** HostConsole에 토글 버튼을 추가하면 호스트는 자신의 아바타를 확인하면서 방송을 진행할 수 있음. 비호스트는 SettingsPage에서 독립적으로 활성화.

---

## 컴포넌트 관계

```
[HostConsole]
  ├─ isHost gate (false → no render)
  │
  ├─ [배경 탭]
  │  └─ on background_url change
  │     ├─ publish: room-authority bg_change
  │     ├─ update: rooms.background_url (Supabase)
  │     └─ set: stageStore.backgroundUrl
  │
  ├─ [슬롯 탭]
  │  └─ on slot drag/reorder
  │     ├─ publish: room-authority slot_change
  │     ├─ update: room_participants.slot_index (Supabase)
  │     └─ set: stageStore.slot_position[]
  │
  ├─ [사운드보드 탭]
  │  └─ on sound button click
  │     ├─ publish: room-authority sound_trigger
  │     └─ optional: play local audio
  │
  ├─ [큐 탭]
  │  └─ on prev/next cue
  │     ├─ publish: room-authority cue_advance
  │     ├─ update: scripts.current_cue_index
  │     └─ set: stageStore.cue_index
  │
  └─ [액션 바] — G-64 참고
     └─ on "내 미리보기" 토글 (선택 사항)
        └─ set: stageStore.showSelfMonitor
```
