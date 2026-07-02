---
tags: [fsm]
---

<!-- state-machines/_INDEX.md 참조: 추가 절차 -->

# 6. WebRTC / LiveKit Connection State Machine

## State Diagram

```
┌──────────────┐
│ DISCONNECTED │ (haven't called Room.connect() yet)
└────┬─────────┘
     │ user enters room / clicks "Join"
     │ → Supabase Edge calls LiveKit.accessToken()
     │ → Zustand stores token
     ▼
┌─────────────┐
│ CONNECTING  │ (Room.connect(url, token) pending)
└──┬──────┬───┘
   │      │ (30s timeout with no ICE connection)
   │      ▼
   │  ┌─────────────┐
   │  │ ICE_TIMEOUT │ (no direct route, waiting for TURN)
   │  └──┬──────────┘
   │     │ user retry / timeout failure
   │     └──────┬──────────────┐
   │            ▼              ▼
   │        CONNECTING      FAILED
   │            ▼           (show error)
   │ success    │
   └──────┬─────┘
          ▼
    ┌──────────────────────────────────────┐
    │      CONNECTED                       │
    │ (audio + video published)            │
    │ → NEGOTIATING (codec negotiation)    │
    └──┬──────────────────────┬────────────┘
       │ success              │ codec mismatch
       ▼                      ▼
    (normal state)    ┌─────────────────┐
                      │  CODEC_FAILED   │ (no common codec)
                      └────────┬────────┘
                               │ fallback to audio-only
                               ▼
                      ┌─────────────────────┐
                      │CONNECTED_AUDIO_ONLY │
                      │ (video disabled)    │
                      └─────────────────────┘

    (network interrupt detected; LiveKit auto-retry)
              ▼
         ┌──────────────┐
         │ RECONNECTING │ (internal LiveKit retry loop, up to 3x)
         └──┬───────────┘
            │ retry success
            └──┬────────────┬──────────────┐
               ▼            ▼              ▼
          CONNECTED   FAILED         DISCONNECTED (explicit)
        (resume)      (show error)    (user leaves)
                      (goto lobby)    (graceful close)
```

## State Transitions

| From | To | Trigger | Source | Notes |
|------|-----|---------|--------|-------|
| DISCONNECTED | CONNECTING | Room.connect(token) called | `roomStore.joinRoom()` | Token from Supabase Edge (valid 1h) |
| CONNECTING | ICE_TIMEOUT | 30s elapsed, no CONNECTED state reached | Timer fired | Symmetric NAT / blocked route; show modal |
| CONNECTING | CONNECTED | WebSocket + Established | LiveKit Room.onConnect | Participant list received |
| CONNECTING | FAILED | Token invalid / room full / timeout | LiveKit error event | Show "Failed to join" + retry |
| ICE_TIMEOUT | CONNECTING | User clicks "재시도" button | `roomStore.retryConnection()` | Fresh ICE gathering; another 30s timer |
| ICE_TIMEOUT | FAILED | 2nd timeout after retry | Auto-transition or user gives up | Show "Connection lost" + manual intervention |
| CONNECTED | NEGOTIATING | SDP exchange in progress | LiveKit ontrack | Codec negotiation between peers |
| NEGOTIATING | CONNECTED | Negotiation success | Codec match found | Normal operation resumes |
| NEGOTIATING | CODEC_FAILED | No common codec between peers | SDP analysis / track mismatch | Video unavailable; audio may persist |
| CODEC_FAILED | CONNECTED_AUDIO_ONLY | User confirms audio-only fallback | `roomStore.setAudioOnlyMode()` | Video track unpublished |
| CONNECTED | RECONNECTING | Network detected down | LiveKit auto-detect | Transparent to user |
| RECONNECTING | CONNECTED | Reconnect success (within 3 attempts) | LiveKit success | No state visible; resume normal ops |
| RECONNECTING | FAILED | 3 reconnection attempts exhausted | LiveKit giveup event | Show "Connection lost" + "Back to lobby" button |
| CONNECTED | DISCONNECTED | User clicks "Leave" | `roomStore.leaveRoom()` | Graceful Room.disconnect() |
| FAILED | DISCONNECTED | User clicks "Back to lobby" | `roomStore.disconnect()` | Force-close all resources |
| CONNECTED | DISCONNECTED | Supabase auth token revoked | Auth listener | Automatic logout + navigate login |

## DataChannel Multiplexing

Two independent streams run in parallel during CONNECTED state:

| Channel | Ordered | Reliability | Payload | Freq | Notes |
|---------|---------|------------|---------|------|-------|
| `script-cue` (reliable) | Yes | Confirmed | `{cue_index, ts}` | ~0.5 Hz | Host cue navigation |
| `chat` (reliable) | Yes | Confirmed | `{sender, text, ts}` | Variable | Text messages (async) |
| `blendshape` (unreliable) | No | Unordered | 52 float32 values | 30 Hz | [PoC] 구현: `src/lib/blendshapeCodec.ts` (220B+crc16+seq, isNewerSeq stale-drop). 5프레임 재정렬버퍼·헤드포즈·Worker는 Phase 2 |
| `room-authority` (reliable) | Yes | Confirmed | Host ID, locked, slot grants | ~0.1 Hz | Room state broadcasts |

## Edge Cases

1. **Token Expiration During Room**
   - Token valid for 1 hour; refreshed transparently 5 min before expiry
   - Supabase Edge function (`refresh-livekit-token`) auto-called by `useEffect`
   - User doesn't see interruption
   - Refresh/reconnect ordering is strict: pause outbound blendshape → fetch fresh LiveKit token → reconnect → fetch Supabase room snapshot → recreate DataChannel handlers → resume blendshape.
   - If snapshot `authority_epoch` or `generation_id` differs from local store, server snapshot wins.

2. **Symmetric NAT / No Direct Route**
   - LiveKit detects via STUN; auto-falls back to TURN relay
   - Latency increases ~20ms; no state change
   - Monitor via `room.localParticipant.connectionState` (advanced; not exposed in MVP)

3. **Simultaneous Disconnect + Authority Transfer**
   - Host leaves while also network-unstable
   - Room fires `onParticipantDisconnected` AND Supabase triggers host transfer
   - Both events handled safely: `participantStore` updated first, then authority granted
   - Avoid race condition via Realtime ordering (Postgres row timestamps)

4. **Browser Tab Put in Background**
   - Audio/video tracks auto-pause (browser behavior)
   - WebRTC connection stays CONNECTED (keepalive)
   - When tab returns to foreground: tracks auto-resume (LiveKit SDK)
   - No state change

5. **LiveKit Server Outage + FAILED 상태 사유별 문구 (G-263)**
   - 상황: LiveKit 서버 점검 또는 네트워크 영구 단절
   - 감지:
     - All clients see RECONNECTING state immediately
     - After 3x retry failure: FAILED state
   - **FAILED 상태 사유별 사용자 문구 (G-263)**:

| FAILED 사유 | LiveKit 에러 코드 | 사용자 메시지 | 권장 액션 |
|---|---|---|---|
| **서버 점검/Outage** | N/A (연속 실패) | 서버 점검 중입니다. 잠시 후 다시 시도해주세요. | [30초 후 자동 재시도] |
| **Room Full** | `ROOM_FULL` | 입장 가능한 자리가 없습니다. | [로비로 돌아가기] |
| **Token Expired** | `TOKEN_EXPIRED` | 세션이 만료됐습니다. 다시 입장해주세요. | [로비로] + 다시 입장 |
| **Unauthorized** | `UNAUTHORIZED` | 인증에 실패했습니다. 다시 로그인해주세요. | [로그인 화면으로] |
| **Network Down** | `CONNECT_TIMEOUT` (반복) | 네트워크 연결이 불안정합니다. Wi-Fi를 확인해주세요. | [재시도] / [로비로] |
| **알 수 없는 오류** | 기타 LiveKit 에러 | 예기치 않은 오류가 발생했습니다. 로비로 돌아갔다 다시 시도해주세요. | [로비로 돌아가기] |

   - UX:
     - 3회 재연결 실패 후 모달: "연결이 끊어졌습니다"
     - 오류 원인 표시 (위 표의 사용자 메시지)
     - 서버 점검: [30초 후 자동 재시도] 타이머 표시
     - 기타: [다시 시도] / [로비로 돌아가기] 버튼 (수동 개입)
   - Zustand error boundary shows "Server maintenance" message (서버 점검 전용)
   - Retry available every 30s (manual button) 또는 자동 타이머

6. **TURN 폴백 시 DataChannel 품질 저하**
   - 상황: UDP 차단 → TCP TURN 폴백 → RTT 100ms+, 패킷 손실 5%
   - blendshape 프레임 out-of-order 도착 → One-Euro Filter stale 입력 → 아바타 경련
   - 감지: 연속 3프레임 seq 역전 → "TURN 모드" 플래그 → FPS 30→15 자동 감소 + 재정렬 버퍼 활성화
   - 재정렬 버퍼: 최대 5프레임 홀드, seq 오름차순 정렬 후 Filter 입력; 관리는 수신측 LiveKit DataChannel 핸들러에서만 담당 (Tracking.md는 seq 송신만 담당)
   - SET-05 연동: TURN 감지 시 자동 품질 하향 (30→15fps, 52→26ch)

7. **ICE 타임아웃 UX + 재시도 한계 (G-98, G-263)**
   - 상황: ICE 연결 수립에 30초 이상 소요 (특히 Symmetric NAT, 방화벽 제약)
   - 감지:
     - LiveKit Room.connect() 시작 후 30초 타이머 시작
     - connectionState가 CONNECTED로 진입하지 못하면 타임아웃
   - 전이: CONNECTING → ICE_TIMEOUT → (UI 개입 후) CONNECTING or FAILED
   - **재시도 한계 (G-263)**: 자동 재시도 2회 + 수동 재시도 1회 = **총 3회까지만 허용**
     - 1회차: 자동 재시도 없음 (사용자 모달)
     - 2회차: [재시도] 클릭 → 자동 재시도 1회차
     - 3회차: [재시도] 클릭 → 자동 재시도 2회차
     - 4회차 이상: [재시도] 버튼 **비활성화** → "재연결 시도 횟수를 초과했습니다. 로비로 돌아가세요." 안내
   - UX:
     1. 1차 타임아웃 (모달): "연결에 시간이 걸리고 있습니다"
     2. 메시지: "네트워크를 확인하고 다시 시도해주세요"
     3. 버튼: [재시도] [로비로 돌아가기]  ← [재시도]는 retryCount < 3일 때만 활성
     4. 재시도 클릭 → RTCPeerConnection 재생성 + ICE 재협상 + 또 다른 30초 대기
     5. N번째 타임아웃 (N > 2) → [재시도] 비활성화, "횟수 초과" 메시지 표시
   - 재시도 로직:
     - `roomStore.retryConnection()`: retryCount 확인 → 3회 미만이면 Room.disconnect() → Room.connect(token) 호출
     - retryCount >= 3이면 early return + "횟수 초과" 토스트
     - 이전 candidates 초기화 + fresh ICE gathering 강제
   - 로깅: Sentry에 RTT/loss/connectionState/iceConnectionState + **retryCount** 기록 (디버깅)
   - MUST NOT: 무한 자동 재시도 금지 (사용자 개입 필수) + 3회 초과 재시도 금지

## Implementation Hints

- **Zustand store**: `roomStore` (connection_state, token, error_msg), `participantStore` (live_participants)
- **Event sources**:
  - LiveKit Room: `onConnect`, `onDisconnect`, `onConnectionLostError`, `onParticipantConnected`, `onParticipantDisconnected`
  - Supabase Edge: `POST /functions/v1/livekit-token` (triggered on room join)
  - Supabase Realtime: `room_participants` table (participant list sync)
- **Side effects**:
  - CONNECTING: show spinner; disable all interactions
  - CONNECTED: enable mic/camera toggles; display participant list
  - FAILED: show error modal; disable "Back to room" (only "Back to lobby")
  - Auto-refresh token: `useEffect(() => { const timer = setTimeout(() => refreshToken(), token_expiry - 5min); }, [token])`
- **DataChannel Setup** (CONNECTED state):
  ```
  const cueChannel = room.createDataChannel('script-cue', { ordered: true });
  const chatChannel = room.createDataChannel('chat', { ordered: true });
  const blendshapeChannel = room.createDataChannel('blendshape', { ordered: false });
  const authorityChannel = room.createDataChannel('room-authority', { ordered: true });
  ```

#### RT-02 blendshape 프레임 포맷 (필수 필드)
```json
{
  "blendshapes": "Float32Array(52)",
  "timestamp_ms": "number (발신 측 monotonic clock)",
  "seq": "number (1-65535 순환, 역전 감지용)",
  "crc16": "number (208바이트 체크섬, 부분 수신 감지)"
}
```
- 총 크기: 208 + 12 = 220바이트 (16KB 한계의 1.4%)

**수신단 검증 플로우**:
1. `crc16` 불일치 → 프레임 드롭 (이전 유효 프레임 유지)
2. `byte_length !== 220` (총 프레임 = 208 데이터 + 12 메타) → 프레임 드롭  <!-- fix: 총 프레임은 220바이트(§207). crc16은 데이터부 208바이트 대상. -->

3. `seq` 갭 감지 (`seq > prev+1`) → 재정렬 버퍼에 홀드
4. 버퍼 홀드 > 150ms → 갭 포기, 최신 프레임으로 점프

## ROOM-10: 재연결 UX + 연결 품질 표시

### § 재연결 중 오버레이 UI

**재연결 중 시각적 피드백**:
1. 반투명 다크 오버레이 (rgba 0,0,0,0.6) — 무대 전체 덮음
2. 중앙: 로딩 스피너 + "재연결 중... (1/3)" 텍스트 표시
3. 재시도 횟수 실시간 갱신 (1/3 → 2/3 → 3/3)
4. 오버레이 중 모든 인터랙션 차단 (pointer-events: auto로 설정, 배경 요소는 pointer-events: none)

**재연결 성공 시 복구**:
1. 오버레이 즉시 제거 (fade-out 0.3s 애니메이션)
2. roomStore 상태 재동기화: participants, stageStore.activeScene, script cue 위치
3. 성공 토스트 메시지: "연결이 복구됐습니다" (3초 후 자동 사라짐)
4. DataChannel 재구독: 4개 채널 모두 재연결 후 재등록
5. blendshape 송신 재개는 DataChannel 재등록과 snapshot reconciliation 이후에만 허용

**재연결 실패 시 (3회 이후) 모달**:
1. 타이틀: "연결이 끊어졌습니다"
2. 버튼 2개: "다시 시도" (30초 대기 후 자동 재시도) / "로비로 돌아가기"
3. 30초 카운트다운 타이머 표시 ("00:30 후 자동 재시도")
4. 자동 재시도 1회 추가 (사용자 개입 없이)

**추가 엣지케이스**:
- **재연결 중 호스트 교체**: 재연결 성공 후 Supabase Realtime에서 최신 host_id 읽어 stageStore 갱신
- **재연결 중 씬 변경**: 재연결 성공 후 rooms 테이블 latest background_url로 씬 복구

### § 연결 품질 표시 (상단 바 인디케이터)

**측정 값**:
- `room.localParticipant.connectionQuality` (LiveKit SDK) — excellent / good / poor
- RTT (round-trip time) ms — `room.localParticipant.lastReport?.rtt`
- 패킷 손실률 % — `room.localParticipant.lastReport?.packetLossRate`

**UI 표현** (상단 바 📶 옆):

| 품질 | 아이콘 | 색상 | 조건 |
|---|---|---|---|
| 우수 | 📶 (3칸) | green #4ADE80 | RTT < 100ms, 손실 < 1% |
| 양호 | 📶 (2칸) | yellow #FACC15 | RTT 100~200ms, 손실 1~5% |
| 나쁨 | 📶 (1칸) | red #F87171 | RTT > 200ms, 손실 > 5% |
| 없음 | ✗ | red | RECONNECTING / FAILED |

**구현 세부사항**:
- 갱신 주기: 3초마다 polling (`setInterval`, CONNECTED 상태에서만)
- Store: `roomStore.connectionQuality: 'excellent'|'good'|'poor'|'none'` 추가
- **중요**: 품질 측정 로직을 UI 컴포넌트 내에 직접 작성하지 않고, roomStore 액션으로 위임

8. **코덱 협상 실패 (G-99)**
   - 상황: SDP 교환 후 브라우저 간 공통 코덱 없음
     - 예: 호스트 Safari (Opus 미지원, AAC만) + 참가자 Chrome (Opus)
     - 또는: 호스트 Safari (H.264 미지원, VP8 only) + 참가자 Chrome (H.264)
   - 감지:
     - RTCPeerConnection.ontrack: track.kind='video' but kind='audio' only
     - SDP setLocalDescription 후 getStats로 발신 없음 (inbound rtp만 존재)
   - 전이: NEGOTIATING → CODEC_FAILED → CONNECTED_AUDIO_ONLY
   - 처리:
     1. 비디오 트랙 pubsub 중단 (localParticipant.unpublishTrack(video))
     2. roomStore.connectionState = 'audio_only' 플래그 설정
     3. Avatar 아바타 렌더 중단 (display: none)
   - UX:
     1. 배너 표시: "이 브라우저에서는 영상이 지원되지 않습니다"
     2. 메시지: "음성만 연결됩니다. 계속 진행하시겠습니까?"
     3. [계속] → audio_only 모드로 진행
     4. [나가기] → LobbyPage 이동
   - 폴백 모드 (audio_only):
     - 아바타 렌더 패널 → 정적 이미지 또는 "음성 참가자" 뱃지로 대체
     - 채팅/DataChannel 정상 작동 (신뢰성 유지)
     - 호스트에게 "○○님은 영상 미지원 기기입니다" 표시
   - 복구: CODEC_FAILED 상태에서 벗어날 수 없음 (세션 종료 시까지)
   - MUST NOT: 비디오 없이 audio로 진행하면서 블렌드셰이프 송수신 금지 (불일치)

## Constraints (MUST NOT)

- **TURN 폴백 중 unreliable DataChannel 유지 금지** → reliable로 전환 (순서 보장)
- **재정렬 버퍼 없이 raw 순서로 One-Euro Filter 입력 금지** — seq 역전 감지 후 버퍼링 필수
- **CODEC_FAILED 상태에서 블렌드셰이프 송수신 금지** — audio_only 모드는 아바타 제외
- **ICE 타임아웃 후 무한 자동 재시도 금지** — 2회 반복 후 수동 개입 필수
