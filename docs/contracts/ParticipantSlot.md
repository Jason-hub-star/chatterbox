---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- opencode: 2026-06-29 - C9 room-authority 예시에 authority_epoch 추가, C13 cleanup 보장 메커니즘 명시 (key prop remount). Coded with OpenCode; high-cost model review recommended. -->

# 2. ParticipantSlot

한 명의 participant을 "슬롯"으로 렌더링하는 컨테이너 (아바타 + 대사 + 오디오 UI).

## Props Interface

```typescript
interface ParticipantSlotProps {
  /**
   * 이 슬롯이 표시할 participant의 ID (room_participants.user_id)
   */
  participantId: string;

  /**
   * room_participants 테이블의 slot_index (0-5)
   * CSS Grid 배치, 호스트 변경 시 재계산
   */
  slotIndex: number;

  /**
   * 속하는 room의 ID (room_participants 외키)
   */
  roomId: string;

  /**
   * 슬롯이 "활성" 여부 (하이라이트, 대사 표시, 오디오 볼륨 표시 등)
   * (선택) 없으면 false 기본값
   */
  isActive?: boolean;

  /**
   * 호스트가 이 participant을 음성 차단했는지 여부
   * (UI에서만 사용, 실제 음성 제어는 호스트에서)
   */
  isMutedByHost?: boolean;

  /**
   * 데이터 채널/오디오 에러 콜백
   */
  onError?: (error: Error) => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `roomStore` | `hostId` | ✓ | | 현재 호스트 ID (room-authority 발신자 검증) |
| `roomStore` | `participants` | ✓ | | participant list (slot_index 재계산) |
| `roomStore` | `connectionState` | ✓ | | 'connecting'\|'connected'\|'disconnected' |
| `participantStore` | `[participantId].state` | ✓ | | 'joining'\|'connected'\|'active'\|'muted'\|'left' |
| `participantStore` | `[participantId].role` | ✓ | | 'actor'\|'viewer' |
| `participantStore` | `[participantId].audioEnabled` | ✓ | | 해당 participant 오디오 활성 |
| `participantStore` | `[participantId].mutedByHost` | ✓ | ✓ | 호스트가 음성 차단 (호스트만 쓰기) |
| `userStore` | 본인 ID | ✓ | | 자신과 다른 participant 구분 |
| `stageStore` | `slotPosition[slotIndex]` | ✓ | | 슬롯 위치·크기 정보 |
| `stageStore` | `backgroundUrl` | ✓ | | 현재 배경 (ParticipantSlot 영향 없음, ScriptPanel 용) |
| `stageStore` | `activeSpeakerId` | ✓ | | 현재 말하는 participant (하이라이트) |

**읽기 전용:** 대부분
**쓰기:** participantStore.mutedByHost (호스트만), activeSpeakerId 업데이트 (자동)

## DataChannel 의존성

**구독 (수신):**

| Channel | 메시지 형식 | 빈도 | 용도 |
|---------|----------|------|------|
| `blendshape` (unreliable) | Float32Array[52] + timestamp | 30 Hz | AvatarCanvas에 통과 |
| `room-authority` (reliable) | `{type, payload, host_id, authority_epoch, seq, timestamp_ms}` | ~0.1 Hz | 슬롯 변경, 배경 변경, 음성 트리거, cue 진행 |

**room-authority 메시지 타입:**
```json
{
  "type": "slot_changes | bg_change | sound_trigger | cue_advance",
  "payload": {
    "slot_id": "uuid",
    "background_url": "string",
    "sound_id": "uuid",
    "cue_index": 5
  },
  "host_id": "uuid",
  "authority_epoch": 42,
  "seq": 1234,
  "timestamp_ms": 1624561200000
}
```

> **포맷 SSOT**: `DATA-SCHEMA.md §2.1` 및 `contracts/_INDEX.md`의 `RoomAuthorityMessage` 타입과 동일. `authorityEpoch`는 호스트 이전 시 증가하며 수신자는 오래된 epoch 메시지를 drop한다 (replay 방어, SecurityPolicies §8.4.2).

**발행 (송신):**
- 비호스트는 발행 불가 (방어적 디자인)
- 호스트만 `room-authority` 발행 (ScriptPanel 경유)

## LiveKit 이벤트

| 이벤트 | 핸들러 | 작업 |
|--------|--------|------|
| `room.onParticipantConnected(participant)` | ParticipantSlot mount | 상태 전환: JOINING → CONNECTED |
| `room.onParticipantDisconnected(participant)` | ParticipantSlot unmount | 상태 전환: ACTIVE → LEFT, 메모리 정리 |
| `participant.audioTrackPublications` | on change listener | audio_enabled 업데이트 |
| `participant.dataChannelMessage` | on 'message' | blendshape, room-authority, script-cue 수신 |

## Supabase 접근

| 테이블/Storage | 작업 | RLS 정책 |
|---|---|---|
| `room_participants` | 현재 participant 상태 조회 | 같은 room 사용자만 읽기 |
| `room_participants` (UPDATE) | 호스트만 muted_by_host, is_disabled_by_host 업데이트 | 호스트 확인 후 RLS 통과 |
| `Realtime: room_participants` | INSERT/UPDATE/DELETE 구독 | room_id 필터 |

**쓰기 정책:**
- 호스트가 아닌 사용자: 자신의 audio_enabled만 업데이트 가능
- 호스트: muted_by_host, is_disabled_by_host 업데이트 가능 (다른 사용자)

## § 발화 상태 링 (Speaking State Ring)

AvatarCanvas를 감싼 wrapper div의 테두리 링으로 participant의 발화·큐 상태를 시각화한다.

### 링 상태 정의 (우선순위 순)

| 상태 | 조건 | 색상 | 스타일 | 애니메이션 |
|------|------|------|--------|-----------|
| **발화 중** (Speaking) | `stageStore.active_speaker_id === participant_id` | amber (`#FF8C2A`) | solid 2px border + `box-shadow: 0 0 8px rgba(255,140,42,.5)` glow | `pulse` keyframe (scale 1.0 → 1.03 → 1.0, 1.2s infinite) |
| **큐 대기** (Cued) | `scriptStore.current_cue_actor_id === participant_id` | yellow (`#FACC15`) | solid 2px border, no glow | 없음 (정적) |
| **트래킹 실패** (Tracking Error) | `trackingStore.[participantId].is_tracking_failed === true` | red (`#F87171`) | dashed 2px border | 없음 |
| **기본** (None) | 위 조건 모두 거짓 | — | border-none | — |

**우선순위:** 발화 중 > 큐 대기 > 트래킹 실패 > 기본

### Store 의존성 추가

아래 필드를 ParticipantSlot이 구독하는 Store 목록에 추가:

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `scriptStore` | `currentCueActorId` | ✓ | | 현재 큐의 배우 participant_id (큐 대기 링 표시용) |
| `trackingStore` | `[participantId].isTrackingFailed` | ✓ | | 얼굴 트래킹 실패 여부 (ROOM-11 스펙 참조) |

### CSS 적용 및 구현

**적용 위치:** `<ParticipantSlot>` > AvatarCanvas를 감싸는 wrapper div (canvas 외부)

**링 크기:** AvatarCanvas 크기 + 4px padding (동적 계산)

**예시 구조:**
```tsx
<div
  className="avatar-ring-wrapper"
  style={{
    width: canvasWidth + 8,
    height: canvasHeight + 8,
    border: ringBorder,
    borderRadius: '8px',
    boxShadow: ringGlow || 'none',
    animation: ringAnimation || 'none',
  }}
>
  <AvatarCanvas {...props} />
</div>
```

**pulse 애니메이션 (CSS):**
```css
@keyframes avatar-pulse {
  0%, 100% { transform: scale(1.0); }
  50% { transform: scale(1.03); }
}

.avatar-speaking {
  animation: avatar-pulse 1.2s infinite;
}
```

### 금지 사항 추가

이 섹션의 구현 시 다음을 반드시 지켜야 한다:

- ❌ **다중 상태 노출:** 우선순위 1순위 상태만 표시 (발화 중이면 큐 대기는 숨김)
- ❌ **애니메이션 중복:** `pulse` 애니메이션 중 다른 애니메이션 추가 불가 (깜빡임 유발)
- ❌ **링 크기 하드코딩:** canvas 크기가 변경되어도 자동 계산되도록 구현 (조건부 렌더링 아님)

## 금지 사항 (MUST NOT)

- ❌ 호스트가 아닌 사용자가 **muted_by_host 또는 is_disabled_by_host 변경** (RLS + 컴포넌트 레벨 검증)
- ❌ blendshape 메시지에서 **표정 직접 추론** (ParameterDriver 담당, 순수 패스스루만)
- ❌ 호스트가 아닌 사용자가 **room-authority 발행** (protocol violation)
- ❌ participant 상태를 localStorage/session storage로 **로컬 캐싱** (Realtime이 진실)
- ❌ slot_index가 JOINING 상태에서 **변경** (CONNECTED 후에 가능)
- ❌ 다른 participant의 **음성 믹싱/로컬 mute** (클라이언트 결정 아님)
- ❌ 언마운트 중 blendshape subscriber 미정리 상태에서 AvatarCanvas 제거 (cleanup 완료 후 unmount)
- ❌ useEffect cleanup 없이 LiveKit 이벤트 리스너 등록 (room.off 누락 금지)

## Implementation Hints

**blendshape listener cleanup 패턴:**
```typescript
useEffect(() => {
  const blendshapeHandler = (msg) => { /* ... */ };
  room?.on('dataReceived', blendshapeHandler);
  
  return () => {
    room?.off('dataReceived', blendshapeHandler);  // 명시적 제거 필수
  };
}, [participant_id, room]);
```

**슬롯 재구성 흐름 (ROOM-02 자동 배치):**

cleanup 보장은 React `key` prop 강제 remount로 처리한다 (별도 비동기 대기 메커니즘 없음).

```tsx
// ParticipantSlot의 key를 slot_index+participant_id 조합으로 설정하면
// slot_index 변경 시 React가 자동으로 unmount → mount 순서 보장
<ParticipantSlot
  key={`${slot_index}-${participant_id}`}  // ← slot 변경 시 강제 remount
  participant_id={participant_id}
  slot_index={slot_index}
  room_id={room_id}
/>
```

1. slot_index 변경 → React가 기존 ParticipantSlot unmount (useEffect cleanup 실행)
2. AvatarCanvas cleanup 순서 준수 (AvatarCanvas.md Implementation Hints 참조):
   - `isDestroying = true` (ref)
   - LiveKit DataChannel 리스너 명시 제거 (`room.off('dataReceived', handler)`)
   - rAF 루프 cancel (`cancelAnimationFrame`)
   - PixiJS `app.destroy(true, { children: true, texture: true })`
3. 위 cleanup은 useEffect 반환 함수에서 동기적으로 실행 → 완료 후 React가 새 ParticipantSlot mount
4. 새 AvatarCanvas 렌더링 시작

**주의:**
- `key` prop 없이 slot_index만 변경하면 AvatarCanvas가 정리 없이 재렌더 → 메모리 누수·리스너 누적
- 중복 listener 등록 방지: `participant_id` 변경 감지할 때 old listener 제거 후 new listener 추가 (useEffect 의존성 배열로 자동 처리)
- cleanup 중 블로킹 I/O 금지 (PixiJS destroy는 동기, LiveKit off도 동기)

## § G-260 — 호스트 조치 후 실시간 피드백 UI

### 뮤트 카운트다운 배지

호스트가 참가자를 임시 뮤트할 때, 대상자 화면의 ParticipantSlot 상단에 실시간 카운트다운 배지를 표시한다.

**렌더 조건:**
- `participantStore.[participantId].mutedByHost === true`
- `participantStore.[participantId].mutedUntilMs > now()` (남은 시간이 있을 때만)

**UI 규격:**
```
┌─────────────────────┐
│ 🔇 2분 33초 남음     │  ← 배지 (상단 가운데)
│ [아바타 캔버스]      │
│ [이름 라벨]         │
└─────────────────────┘
```

**스타일링:**
- **배경:** 반투명 검정 (rgba(0,0,0,0.7))
- **글자:** 황색 또는 경고 색상 (#FF8C2A 권장)
- **폰트:** 12-14px, bold
- **위치:** ParticipantSlot 상단 중앙, padding 8px
- **애니메이션:** 초 단위 갱신 (매 1초마다 텍스트 변경)

**구현:**
```typescript
// useEffect: mutedUntilMs 감시
useEffect(() => {
  const interval = setInterval(() => {
    const remaining = participantStore.[participantId].mutedUntilMs - Date.now();
    if (remaining <= 0) {
      // 뮤트 해제 → Toast 표시 후 배지 숨김
      setShowMutedBadge(false);
      showToast('🔊 음성이 복구되었습니다', { duration: 1000 });
    } else {
      // 남은 시간 계산 및 배지 갱신
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setRemainingTime(`${minutes}분 ${seconds}초 남음`);
    }
  }, 1000);
  
  return () => clearInterval(interval);
}, [participantStore.[participantId].mutedUntilMs]);
```

### 강퇴 시 슬롯 언마운트 애니메이션

호스트가 참가자를 강퇴할 때, 대상자의 슬롯이 disappear 애니메이션과 함께 제거된다.

**동작:**
1. room-authority `participant_kicked` 메시지 수신 → roomStore.participants에서 해당 participant 제거
2. React 리렌더링 시 ParticipantSlot unmount 트리거
3. unmount 전 1.0초 fade-out 애니메이션 실행
4. 동시에 모든 참가자 ChatPanel에 시스템 메시지 표시: "🚪 [이름]님이 방에서 제거되었습니다"

**CSS 애니메이션:**
```css
@keyframes slot-fade-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.95);
  }
}

.participant-slot-removing {
  animation: slot-fade-out 1.0s ease-out forwards;
}
```

**MUST NOT:**
- ❌ 강퇴 메시지를 강퇴된 대상자에게만 숨기기 (모든 참가자에게 공개 broadcast)
- ❌ 카운트다운 배지 없이 뮤트 남은 시간을 표시하지 않기
- ❌ 언마운트 직후 cleanup 생략

---

## § 동명이인 이름 표시 (Display Name Differentiation, G-81)

### 문제

- `users.display_name`에 UNIQUE 제약이 없음 (닉네임 선점 분쟁 방지)
- 방에 같은 이름의 사용자 2명 이상이 있으면 채팅/슬롯에서 구분 불가

### 해결책

방 입장 시 동명이인 감지 후 `slot_display_name` 자동 생성:

```typescript
// Edge Function: room-join
const existingCount = await supabase
  .from('room_participants')
  .select('id')
  .eq('room_id', roomId)
  .eq('display_name', userDisplayName)
  .neq('id', userId)
  .count();

const slotDisplayName = existingCount > 0 
  ? `${userDisplayName}#${existingCount + 1}`
  : null;  // null = display_name 그대로 사용

await supabase
  .from('room_participants')
  .insert({
    room_id: roomId,
    user_id: userId,
    slot_display_name: slotDisplayName
  });
```

### UI 표시 규칙

**ParticipantLabel, ChatPanel, ParticipantList에서:**

```typescript
// 우선순위: slot_display_name > display_name
const displayText = room_participant.slot_display_name || user.display_name;

// 예시:
// - "Jason" (동명이인 없음) → "Jason"
// - "Jason" (2명째) → "Jason#2"
// - "Jason" (3명째) → "Jason#3"
```

**스타일링:**
- `#2`, `#3` 등 번호는 회색 텍스트(`text-gray-500`) 또는 `(조 2)`처럼 약간 작은 폰트로 표시
- 숫자 번호를 일반 이름과 시각적으로 구분

### 데이터 스키마

`room_participants.slot_display_name TEXT NULL`:
- `NULL` = 동명이인 없음, `display_name` 그대로 사용
- `"Jason#2"` = 2번째 Jason
- `"Jason#3"` = 3번째 Jason

### 제약사항

- ❌ `slot_display_name` 수정 금지 (방 입장 시만 결정, 변경 불가)
- ❌ 퇴장 후 재입장하면 새로운 번호 배정 (이전 번호 유지 안 함)

---

## 컴포넌트 관계

```
[RoomView]
  ├─ subscribe room-authority (DataChannel)
  ├─ subscribe room_participants (Realtime)
  └─ [ParticipantSlot] x N (slot_index 0-5)
      ├─ [AvatarCanvas]
      │   └─ subscribe blendshape
      └─ [ParticipantLabel + AudioUI]
          ├─ show muted_by_host status
          ├─ highlight active_speaker
          └─ display slot_display_name (G-81)
```
