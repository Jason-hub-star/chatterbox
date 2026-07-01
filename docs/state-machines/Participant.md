---
tags: [fsm]
---

<!-- state-machines/_INDEX.md 참조: 추가 절차 -->

# 2. Participant State Machine

**개념 정의:**
- **state** = 연결·활동 상태 {JOINING, CONNECTED, ACTIVE, MUTED, INACTIVE, LEFT}: LiveKit 연결 상태 및 마이크/camera 활동 레벨
- **role** = 권한·역할 {actor, viewer}: 방 내 권한 구분 (스크립트 편집, 슬롯 점유, 호스트 권한 등)
- 둘은 **독립적 축**: 같은 participant가 (state=CONNECTED, role=viewer) 또는 (state=ACTIVE, role=actor)를 동시에 가질 수 있음

## State Diagram

```
          ┌─────────────────────────────────────────────────┐
          │ (Host decision: mute, kick, disable camera)      │
          ▼                                                   │
    ┌──────────────┐                                    ┌──────────────┐
    │   JOINING    │ (LiveKit.Room.connect() pending)  │   INACTIVE   │
    └──────┬───────┘                                    └──────┬───────┘
           │ success                                           │
           ▼                                                   │
    ┌───────────────┐                                         │
    │  CONNECTED    │ (avatar render ready)                   │
    └───┬───────────┘                                         │
        │ user enable audio input                             │
        ▼                                                     │
    ┌────────┐         host mute      ┌────────┐             │
    │ ACTIVE │─────────────────────> │ MUTED  │             │
    └───┬────┘                       └───┬────┘              │
        │ (expression tracking) [WIP]    │                   │
        │                                │ user unmute/      │
        │ <─────────────────────────────┘ host unmute       │
        │                                                    │
        └────────────────────────────┬──────────────────────┘
                                     │ leave / kick
                                     ▼
                                  ┌─────┐
                                  │ LEFT │
                                  └─────┘
```

## State Transitions

| From | To | Trigger | Source | Notes |
|------|-----|---------|--------|-------|
| JOINING | CONNECTED | LiveKit.Room.onParticipantConnected() | LiveKit event | Avatar load begins |
| JOINING | LEFT | LiveKit join timeout (10s) | Timeout handler | User sees "connection timeout" |
| CONNECTED | ACTIVE | User clicks mic enable + audio input obtained | `userStore.setMicEnabled(true)` | Audio track sent to LiveKit |
| CONNECTED | LEFT | User clicks "Leave" or nav away | `roomStore.leaveRoom()` | Clean disconnect |
| ACTIVE | MUTED | Host mutes participant | Supabase Realtime (participant_settings) | Participant see banner: "Host muted you" |
| ACTIVE | MUTED | User clicks mic toggle (disable) | `userStore.setMicEnabled(false)` | Local action |
| MUTED | ACTIVE | Host unmutes | Supabase Realtime update | Participant show "unmuted" banner |
| MUTED | ACTIVE | User clicks mic toggle (enable) | `userStore.setMicEnabled(true)` | Local action |
| ACTIVE/MUTED/CONNECTED | INACTIVE | Host clicks "disable" on participant | `roomStore.disableParticipant(id)` | Host-only action |
| INACTIVE | LEFT | Auto-cleanup timer (30s) | `roomStore.cleanupInactiveParticipant()` | Connection closed server-side |
| * | LEFT | Leave room / disconnect | LiveKit.Room.disconnect() | Cleans `participantStore` entry |
| * | LEFT | Host force-kick | `roomStore.kickParticipant(id)` | LiveKit kick + DB record delete |

## 늦참 입장 프로토콜 (Late Join Sync, G-65)

공연이 이미 시작된 방(MainView 영상 재생 중, 타임스탬프 5분)에 새로운 참가자가 들어올 때:

**1. room_participants INSERT 후**
- rooms.playback_position_ms 조회 (호스트가 주기적으로 업데이트, 5초마다)
- MainView 영상 존재 확인: 있으면 `videoElement.currentTime = playback_position_ms / 1000`으로 동기화

**2. character_slot 배정 시도 (비-전이 비동기 진행)**
- JOINING 상태 **내부에서** room_participants 테이블의 빈 슬롯 비동기 조회 (LiveKit 연결 완료 후)
- 슬롯 있음: 호스트에게 room-authority DataChannel "SLOT_ASSIGN" 메시지 요청 → 호스트가 역할(character_role) 자동 배정
  - 호스트의 응답 slot assignment 메시지에 `authority_epoch` 포함: 수신측은 **현재 room의 authority_epoch와 비교하여 stale(과거) epoch는 드롭** (호스트 이동 중 레이스 조건 방지, HostAuthority.md 참조)
- 슬롯 없음: `role='viewer'`로 자동 전환 (GreenRoom 거치지 않음, 바로 입장)

**3. 사용자 알림**
- 토스트 "공연이 이미 시작됐어요. 현재 위치부터 참가합니다." (3초)
- 배우 모드: 호스트의 배정 대기 배너 표시
- 관전자 모드: "관전자로 입장했습니다." 메시지

**MUST NOT:**
- 늦참 시 영상을 처음부터 재생하지 않는다 (동기 실패 방지)
- 슬롯 없는데 배우 모드 허용하지 않는다 (초과 참가자 차단)

## Edge Cases

1. **Webcam Permission Denied**
   - **카메라만 거부, 마이크 허용 (음성 배우):** participant can become ACTIVE (state=ACTIVE) as voice-only actor.
     - Set `room_participants.is_tracking_failed=true`, `role_source='fallback_no_camera'`, `role='actor'`
     - Render static avatar + "Camera disabled" badge
     - State transition: CONNECTED → ACTIVE (오디오 트랙 송신)
   - **카메라·마이크 모두 거부 (관전자):** downgrade to `role='viewer'`; 
     - State: **CONNECTED 유지** (마이크 거부로 인해 ACTIVE 진입 불가, role만 viewer로 변경)
     - can hear audio, see avatars, send chat through Edge, but cannot publish audio/DataChannel
     - Viewer entry path: skip GreenRoom entirely, set `role='viewer'` **before** JOINING state
   - **뷰어 사전 진입 경로:** Onboarding.md의 camera/mic 거부 → `role='viewer'` 사전 설정 → Participant state=JOINING 진입
     - (INACTIVE state ≠ 뷰어 진입: INACTIVE는 호스트 추방 상태)
   - Banner shows "Camera disabled" in settings; user can retry camera anytime.

2. **iOS Safari / Mobile Browsers**
   - MediaPipe not supported → no expression tracking [WIP]
   - Mobile route uses `MobileViewer` with `role='viewer'` by default; actor voice-only on mobile is not MVP.
   - `trackingStore.isSupportedBrowser()` check avoids crash

3. **Dual Mic Input (e.g., USB + Built-in)**
   - User selects via settings; LiveKit track source switches on-the-fly
   - Brief audio glitch; no state change (stays ACTIVE)

4. **Network Unstable During ACTIVE**
   - LiveKit auto-reconnects (internal)
   - If reconnect succeeds: stays ACTIVE
   - If fails: LEFT → rejoin from lobby

5. **Host Quick Mute/Unmute Spam**
   - Supabase Realtime may deliver out-of-order updates
   - Zustand `participantStore` uses `updated_at` timestamp to ignore stale toggles

6. **2기기 동시 접속 처리 (G-97)**
   - 상황: 같은 계정이 두 번째 기기/탭에서 같은 방에 접속 시도
   - 감지 기법:
     1. room_participants UNIQUE(room_id, user_id) 제약 충돌 → DB INSERT 실패
     2. livekit-edge-fn.md에서 `room_participants` 조회: 기존 세션이 있으면 감지
     3. LiveKit SDK: 같은 identity로 2번째 Room.connect() 시 자동 disconnection (kick first)
   - 처리 전략 (권장: 새 기기 허용):
     1. DB: 기존 row의 state='left' + left_at=now() 자동 갱신 (trigger 또는 Edge Function)
     2. LiveKit: 기존 참가자 강제 퇴장 (RoomService.removeParticipant)
     3. 새 기기: room_participants INSERT (새 id) → state='joining' → CONNECTED 진행
     4. 이전 기기 (여전히 connected): Realtime 이벤트 수신 → "다른 기기에서 접속되었습니다" 토스트 + [확인] → LobbyPage
   - UX 표시:
     - 이전 기기: "다른 기기에서 접속되어 연결이 끊겼습니다" 배너 (2초 후 페이드아웃)
     - 새 기기: 정상 입장 (사용자 의도 기반)
   - 동시성 보호: UNIQUE 제약 + ON CONFLICT DO NOTHING으로 중복 진입 원천 차단
   - MUST NOT:
     - 두 세션 동시 허용 금지 (room_participants UNIQUE 정책 위반, 채팅·슬롯 중복 문제)
     - 토큰 블랙리스트 구현 금지 (token_version YAGNI, SecurityPolicies §8.7 참조)

## Implementation Hints

- **Zustand store**: `participantStore` (participants list, each with state + audio_enabled + muted_by_host)
- **Event sources**:
  - LiveKit: `room.participants` (join/leave), `localParticipant.audioTrackPublications` (track publish/unpublish)
  - Supabase Realtime: `participant_settings` channel (host mute, host disable, role changes)
- **Side effects**:
  - ACTIVE: start blendshape transmission on DataChannel `unreliable` [WIP]
  - MUTED: pause blendshape transmission (still listen)
  - LEFT: remove from `participantStore`, cleanup WebGL resources for that participant
