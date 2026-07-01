---
tags: [fsm]
---

<!-- state-machines/_INDEX.md 참조: 추가 절차 -->

# 7. Host Authority State Machine

## State Diagram

```
┌──────┐
│ IDLE │ (no authority action in progress)
└──┬───┘
   │ host clicks slot/bg/sound/cue control
   │ → compile DataChannel message
   ▼
┌───────────┐
│ SELECTING │ (UI locked, waiting for host confirmation)
└──┬────────┘
   │ host confirms action
   │ → increment seq, broadcast via room-authority
   ▼
┌─────────────┐
│ BROADCASTING│ (DataChannel send in-flight)
└──┬──────────┘
   │ all clients receive + apply
   │ → state updated on all nodes
   ▼
┌───────────┐
│ CONFIRMED │ (action applied globally)
└──┬────────┘
   │ next action or idle
   ▼
┌──────┐
│ IDLE │

Parallel paths:
(host network down during BROADCASTING)    (host initiates host transfer)
      ▼                                           ▼
   ┌─────────┐                          ┌─────────────┐
   │ ROLLBACK│                          │ TRANSFERRING│
   └────┬────┘                          └──────┬──────┘
        │ host reconnects                      │ target accepts/rejects/timeout
        ▼                                      ▼
      IDLE                                  ACTIVE
      (resync from server)                  (resume)
```

## State Transitions

| From | To | Trigger | Source | Notes |
|------|-----|---------|--------|-------|
| IDLE | SELECTING | Host clicks control (slot/bg/sound/cue) | `roomStore.selectAuthority(action_type, payload)` | UI shows preview/confirmation dialog |
| SELECTING | BROADCASTING | Host confirms action | `roomStore.broadcastAuthority()` | seq incremented, message queued |
| BROADCASTING | CONFIRMED | All clients receive + apply | DataChannel `on('room-authority')` | Seq monotonic; duplicates ignored |
| CONFIRMED | IDLE | Next interaction or auto-timeout | `roomStore.resetAuthority()` (1s timer) | Clean state for next action |
| SELECTING | IDLE | Host cancels action | `roomStore.cancelAuthority()` | UI closes; no broadcast |
| CONFIRMED | ROLLBACK | Host network disconnect during BROADCASTING | `roomStore.onHostDisconnect()` | Actors revert to `lastConfirmedState` |
| ROLLBACK | IDLE | Host reconnects + server sync | Supabase Realtime resync | Authority state reset from DB |
| ACTIVE | TRANSFERRING | Host initiates host transfer to target participant | `roomStore.initiateHostTransfer(target_id)` | Modal shown on target, 30s timeout |
| TRANSFERRING | ACTIVE | Target accepts / rejects / timeout (30s) | Supabase Realtime (participant_settings) | Host permission restored, UI unlocked |

## Host Authority Message Format

```json
{
  "type": "slot_change" | "bg_change" | "sound_trigger" | "cue_advance",
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

- `authority_epoch`: increments on every host transfer; old host messages are invalid immediately
- `seq`: monotonic counter within the current authority_epoch, **resets to 1 on host transfer** (P0 규칙 명시)
- `type`: action category (all follow same DataChannel protocol)
- `payload`: varies by type, opaque to transport layer

### Message 순서 판정 (Host Transfer 후 seq 동기화, P0)

**규칙:**
- 메시지 수신 시 `(authority_epoch, seq)` 튜플을 사전식(lexicographic) 비교로 순서 판정
- `authority_epoch`가 더 큰 메시지가 항상 최신 (seq 무시)
- `authority_epoch`가 같으면 `seq` 비교로 순서 결정

**예시:**
```
Old host (epoch=42, seq=500) 메시지 → (42, 500)
Host transfer 발생 → authority_epoch += 1
New host (epoch=43, seq=1) 메시지 → (43, 1)

비교: (43, 1) > (42, 500) → New host 메시지가 최신 (epoch 우선)
→ New host의 첫 메시지가 Old host의 마지막 메시지를 덮어씀 (올바른 순서)
```

**구현 (클라이언트 수신):**
```typescript
function isMessageNewer(incoming: Message, current: Message): boolean {
  if (incoming.authority_epoch !== current.authority_epoch) {
    return incoming.authority_epoch > current.authority_epoch;
  }
  return incoming.seq > current.seq;
}
```

## Edge Cases

1. **Host Network Down During BROADCASTING**
   - Message sent but host disconnects before receiving ack
   - Actors applied change (optimistic); host reconnects and sees desync
   - Solution: Supabase `rooms` table stores `authority_state_json` (last confirmed)
   - Host client refetches and overrides local change if mismatch detected

2. **Seq Collision After Host Transfer**
   - Old host seq = 500, new host takes over with seq = 501
   - Both hosts briefly live; both try to broadcast
   - Solution: seq tagged with host_id; receiver ignores if host_id != current_host_id
   - Zustand guard: `if (msg.host_id !== roomStore.current_host_id) return;`

3. **Rapid Fire Actions** (e.g., multiple slot changes < 100ms)
   - Each action waits for CONFIRMED before allowing next SELECTING
   - Button disabled during BROADCASTING state (prevents spam)
   - Queue implemented: pending actions stored; auto-execute after CONFIRMED

4. **Cue Advance While Script Scrolling**
   - Host clicks "next cue" (BROADCASTING)
   - Actor was reading ahead in script
   - Cue update received; auto-scroll + banner "Host moved to Cue N" (same as Script SM)
   - Actor can dismiss or sync (no state conflict with Script machine)

5. **Multiple Hosts Claim Authority** (race condition)
   - Supabase Realtime trigger updates `rooms.host_id` with timestamps
   - Receiver compares `updated_at`; older authority ID ignored
   - Guard: `if (msg.host_id !== supabase.rooms[room_id].host_id) return;`

6. **No Host During Cue Advance**
   - If host transfer is in progress, `cue_advance` buttons are disabled.
   - If the host is gone for >5s and active participants remain, DB transaction assigns `cue_operator_id = new_host_id`.
   - `cue_advance` requires `issuer_id === current_host_id OR issuer_id === cue_operator_id`, plus matching `authority_epoch`.

7. **호스트 위임 거절 정책 (G-101)**
   - 상황: 현 호스트가 다른 참가자에게 호스트 권한 위임 시도 → 대상자가 수락 거절
   - 트리거:
     1. 호스트가 HostConsole에서 "○○님에게 호스트 권한 넘기기" 클릭
     2. room-authority DataChannel 메시지 type='host_transfer_request' 발송
       ```json
       {
         "type": "host_transfer_request",
         "target_user_id": "uuid",
         "host_id": "current_host_id",
         "authority_epoch": 42,
         "timestamp_ms": 1624561200000
       }
       ```
     3. 대상자 클라이언트: 모달 표시 "○○님이 호스트 권한을 넘기려고 합니다. 수락하시겠습니까?" [수락] [거절]
   - 거절 시 처리:
     1. 대상자 클라이언트 → room-authority 메시지 발송 type='host_transfer_denied'
     2. 현 호스트 클라이언트 수신: 상태 TRANSFERRING → ACTIVE (복귀)
     3. 호스트에게 토스트 알림: "○○님이 호스트 수락을 거절했습니다" (3초)
     4. 방 내 다른 참가자에겐 영향 없음 (호스트는 여전히 기존 호스트)
   - 타임아웃 처리:
     - 타임아웃: 30초 내 대상자 응답 없으면 자동 거절 처리
     - 호스트 UI: "○○님의 응답 시간 초과" 토스트 + 상태 TRANSFERRING → ACTIVE
   - 상태 전이:
     ```
     ACTIVE (호스트) 
       │ [○○님에게 권한 넘기기] 클릭
       ▼
     TRANSFERRING (UI locked, 대상자 응답 대기)
       │ (거절 또는 타임아웃 30초)
       ▼
     ACTIVE (호스트 복귀, 다시 권한 사용 가능)
     ```
   - MUST NOT:
     - 거절 상태에서 호스트 권한 강제 이전 금지
     - 대상자 오프라인 상태 체크 없이 요청 금지 (livekit-edge-fn에서 사전 검증)
     - 동시 위임 요청 2개 이상 허용 금지 (선착순, 이전 요청은 타임아웃 후 자동 취소)
   - **동시 script 편집 충돌:** 호스트 권한 양도 중 다른 호스트가 script를 수정하는 경우, Script.md § 스크립트 동시 편집 충돌 (G-102)의 Last-Write-Wins 규칙 참조

## Implementation Hints

- **Zustand store**: `roomStore` (authority_state, current_host_id, pending_actions, lastConfirmedState)
- **Event sources**:
  - UI controls: slot selector, background picker, soundboard buttons, cue buttons
  - LiveKit DataChannel `room-authority` (reliable, ordered)
  - Supabase Realtime `rooms` table: host_id change, authority_state_json updates
- **Side effects**:
  - SELECTING: disable other controls; show preview/confirmation UI
  - BROADCASTING: show spinner; disable all actions
  - CONFIRMED: apply state to `stageStore` (avatar pose, background image, soundboard trigger, cue index); toast "Change applied"
  - ROLLBACK: notify user "Connection lost; reverting change" + revert UI to `lastConfirmedState`
- **DataChannel Setup** (CONNECTED state):
  ```javascript
  const authorityChannel = room.createDataChannel('room-authority', { ordered: true });
  authorityChannel.onMessage = (msg) => {
    const { type, payload, host_id, seq } = JSON.parse(msg.data);
    roomStore.applyHostAction({ type, payload, host_id, seq });
  };
  ```
