---
tags: [fsm]
---

<!-- state-machines/_INDEX.md 참조: 추가 절차 -->

# 1. Room Lifecycle State Machine

## State Diagram

```
┌─────────┐                                         
│  IDLE   │                                         
└────┬────┘                                         
     │ create room (host)                           
     ▼                                              
┌─────────────┐                                     
│  CREATING   │ (API call in progress)             
└────┬────────┘                                     
     │ success                                      
     ▼                                              
┌──────────┐      start show       ┌────────┐      
│ WAITING  │─────────────────────> │ LIVE   │      
└───┬──────┘                       └───┬────┘      
    │                                  │            
    └──────────────────┬───────────────┘            
                       │ end show / host leaves    
                       ▼                            
                   ┌───────┐                        
                   │ ENDED │                        
                   └───────┘                        
```

## State Transitions

| From | To | Trigger | Source | Notes |
|------|-----|---------|--------|-------|
| IDLE | CREATING | Host clicks "Create Room" | `roomStore.createRoom()` | Zustand action |
| CREATING | WAITING | Room API success (Supabase) | `roomStore.onCreateSuccess()` | `roomStore.room.id` set |
| CREATING | IDLE | Room API error | `roomStore.onCreateError()` | Show error toast, retry available |
| WAITING | LIVE | Host clicks "Start Show" | `roomStore.startShow()` | `stageStore.reset()` called; cue index → 0 |
| LIVE | WAITING | Host clicks "Pause" (future) | `roomStore.pauseShow()` | Not MVP; reserved |
| LIVE | ENDED | Host clicks "End Show" | `roomStore.endShow()` | `stageStore.cleanup()` called |
| LIVE | ENDED | Network: LiveKit disconnect x3 failed | `roomStore.onFatalDisconnect()` | Auto-notification to all participants |
| WAITING | ENDED | Host leaves room | Supabase Realtime (room:host_left) | Authority transfer or room soft-ended |
| WAITING | ENDED | All participants leave | `roomStore.checkEmptyRoom()` (timer) | 30s grace period, then status='ended' |

## Edge Cases

1. **Host Leaves During WAITING/LIVE**
   - Authority transfer runs in a single DB transaction: lock `rooms`, pick the lowest `room_participants.joined_at` active actor, update `rooms.host_id`, increment `authority_epoch`.
   - If no active participant remains, set `rooms.status='ended'` after a 30s empty-room grace period.
   - Notification sent via Supabase `rooms` channel and room-authority: `{ type: "host_transfer", new_host_id, authority_epoch }`.
   - Clients MUST reject any `room-authority` or `cue_advance` message with an older `authority_epoch`.

2. **Password-Protected Room**
   - Entry validation happens in `participantStore.joinRoom(password)` before LiveKit.Room.connect()
   - Failure returns to lobby with toast message; does NOT create participant record

3. **LiveKit Connection Loss**
   - LiveKit SDK auto-reconnects 3 times (internal retry)
   - On 3rd failure, `room.onConnectionLostError` triggers `roomStore.onFatalDisconnect()`
   - Room does NOT auto-delete; host can still refresh and recover (until 30s timer expires)

5. **LiveKit Room Destroyed But DB Still Live**
   - LiveKit webhook or a 60s reaper checks active participant count.
   - If LiveKit has no participants and Supabase has no active `room_participants.state != 'left'`, set `rooms.status='ended'`.
   - Supabase remains authoritative for UI; LiveKit empty-room events are inputs, not the only source of truth.

4. **Rapid State Changes** (e.g., create → cancel → create)
   - Store debounces create actions; only one CREATING state allowed
   - Stale API responses ignored if `roomStore.creating_request_id` mismatch

6. **방 인원 초과 거절 (G-95)**
   - 상황: 방 참가 시도 시 `max_participants`에 이미 도달한 경우
   - 조건: room_participants에서 `state != 'left'`인 활성 참가자 수 ≥ max_participants
   - 전이: Participant JOINING → FULL_REJECTED (진입 거절)
   - UX: "방이 가득 찼습니다 (6/6)" 모달 팝업
     - [대기 신청] 버튼 → room_waitlist 추가 + 토스트 "대기열에 추가되었습니다"
     - [로비로 돌아가기] 버튼 → LobbyPage 네비게이션
   - 검증: livekit-edge-fn.md §room-participants-count 게이트에서 선제 검증 (token 발급 거절)
   - MUST NOT: 정원 초과 방에 강제 입장 시키지 않음

7. **방 종료 중 참가자 처리 (G-96)**
   - 상황: 호스트가 진행 중인 방을 종료하거나 서버가 방 강제 종료 (`rooms.status='ended'`)
   - 트리거: `end-room` Edge Function 또는 status UPDATE to 'ended'
   - 금지: 호스트 액션으로 `rooms DELETE` 금지. hard delete/R2 purge는 retention worker/admin만 수행.
   - 영향 범위: 현재 state ≠ 'left'인 모든 room_participants
   - 처리 단계:
     1. DB: room_participants.state = 'kicked' 일괄 UPDATE + left_at = now()
     2. LiveKit: RoomService.removeParticipant(participant_id, ...) 강제 제거 (모든 참가자)
     3. DataChannel broadcast: room-authority 메시지 type='room_end' (모든 클라이언트)
       ```json
       {
         "type": "room_end",
         "reason": "host_ended" | "server_closed",
         "timestamp_ms": 1624561200000
       }
       ```
     4. 클라이언트: "방이 종료되었습니다" 알림 표시 + 3초 후 자동 LobbyPage 이동
   - 동시성: Supabase RLS + trigger로 일괄 처리 (경쟁 조건 방지)
   - MUST NOT: 일부 참가자만 남겨두고 방 상태 불일치 상태 유지 금지

## Implementation Hints

- **Zustand store**: `roomStore` (auth, status, participants, password)
- **Event source**: Supabase Realtime `rooms` table (INSERT/UPDATE), `room_participants` table (DELETE on host exit)
- **LiveKit events**: `Room.onDisconnect()`, `Room.onConnectionLostError()`
- **Side effects**:
  - Room WAITING→LIVE: reset `stageStore` (clear script index, chat)
  - Room LIVE→ENDED: cleanup all tracks, close DataChannels, archive chat to DB
