---
tags: [reference]
---

<!-- reference/patterns: LiveKit 클라이언트 연결 패턴. 버전 고정·공식 출처. 설치 버전 대조 필수. Created 2026-07-02 -->

# LiveKit 클라이언트 연결 패턴 (livekit-client)

> ⚠️ **버전 민감**: 아래는 `livekit-client@^2.19.0` 기준. 구현 시 `package.json` 설치 버전과 [공식문서](https://docs.livekit.io/reference/client-sdk-js/) 재확인 필수.
>
> **검수 노트(Opus, 2026-07-02):** ①blendshape 프레임 검증은 **220바이트**(208 데이터 + 12 메타)로 할 것 — 본문 §3의 `payload.length !== 208`은 오류다(총 프레임은 220, `state-machines/WebRTC.md §RT-02`; crc16만 데이터 208바이트 대상). ②§5.6 `room.updateToken()`은 SDK 버전에 없을 수 있으니, 토큰 갱신은 §4.2 `prepareConnection → disconnect → connect` 경로를 정본으로 삼을 것. ③SDK 버전(v2.19.x)·API 시그니처는 설치 후 공식문서로 재확인.

## 0. 버전·출처

| 항목 | 값 | 최종확인일 |
|------|-----|---------|
| **SDK 버전** | v2.19.0 ~ v2.19.2 | 2026-07-02 |
| **공식 문서** | https://docs.livekit.io/reference/client-sdk-js/ | 2026-07-02 |
| **설치** | `npm install livekit-client` | — |
| **타입** | TypeScript 내장 | — |

**Breaking Changes (v2.0)**: v1.x에서 마이그레이션 시 [공식 마이그레이션 가이드](https://docs.livekit.io/client-sdk-js/) 필독.

---

## 1. 골든패스: 연결 흐름 (Room 생성 → connect → 이벤트)

### 1.1 최소 연결 코드

```typescript
import { Room, RoomEvent, VideoPresets } from 'livekit-client';

// (1) Room 생성 (옵션: 화질·다이나캐스트·적응형 스트림)
const room = new Room({
  adaptiveStream: true,      // 네트워크 품질에 따라 자동 해상도 조정
  dynacast: true,            // 저해상도 프로브 먼저 전송, 고해상도 대기
  videoCaptureDefaults: {
    resolution: VideoPresets.h720.resolution,  // 캡처 해상도 기본값
  },
});

// (2) 이벤트 리스너 등록 (연결 전!)
room.on(RoomEvent.Connected, () => {
  console.log('Connected to room:', room.name);
});

room.on(RoomEvent.Disconnected, () => {
  console.log('Disconnected from room');
});

room.on(RoomEvent.ConnectionLostError, (error) => {
  console.error('Connection lost:', error);
});

// (3) LiveKit 서버에 연결
const url = 'wss://your-livekit-server.com';
const token = '...'; // Supabase Edge Function에서 발급받은 JWT
await room.connect(url, token);

console.log('Connected! Room name:', room.name);

// (4) 정리 (언마운트 또는 명시적 퇴장 시)
await room.disconnect();
```

### 1.2 Room 옵션 (자세히)

```typescript
new Room({
  // ─ 적응형 스트림 (동적 해상도 조정)
  adaptiveStream: true,
  
  // ─ 다이나캐스트 (저→고 해상도 프로브 순서)
  dynacast: true,
  
  // ─ 캡처 기본값 (카메라)
  videoCaptureDefaults: {
    resolution: { width: 1280, height: 720, frameRate: 30 },
  },
  
  // ─ 오디오 캡처 기본값
  audioCaptureDefaults: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  
  // ─ E2EE (엔드투엔드 암호화, optional)
  e2ee: {
    keyProvider: new DefaultKeyProvider(),
  },
});
```

---

## 2. 트랙 발행·구독 (마이크·카메라 없이 DataChannel만 필요 시)

### 2.1 마이크·카메라 활성화 (Avatar 렌더링 필요 시)

```typescript
// 호스트/액터만 활성화 (grant 기준)
const { audioTrack, videoTrack } = 
  await room.localParticipant.enableCameraAndMicrophone();

console.log('Camera & Mic enabled:', videoTrack?.sid, audioTrack?.sid);
```

### 2.2 개별 트랙 발행

```typescript
// 커스텀 미디어 스트림 트랙 발행
const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
const videoTrack = mediaStream.getVideoTracks()[0];

const pub = await room.localParticipant.publishTrack(videoTrack, {
  name: 'custom-camera',
  simulcast: true,           // 다중 해상도 송신
  source: Track.Source.Camera,
});

console.log('Published track:', pub.trackSid);
```

### 2.3 원격 참가자 트랙 구독 (수신)

```typescript
// 모든 데이터 수신 (오디오·비디오·데이터)
room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
  console.log(`Track subscribed from ${participant.identity}:`, track.kind);
  
  if (track.kind === 'video') {
    // 비디오 엘리먼트에 트랙 추가
    const videoEl = document.createElement('video');
    videoEl.id = `participant-${participant.sid}`;
    videoEl.autoplay = true;
    videoEl.playsinline = true;
    track.attach(videoEl);
    document.body.appendChild(videoEl);
  } else if (track.kind === 'audio') {
    // 오디오 트랙 자동 재생
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    track.attach(audioEl);
  }
});

room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
  console.log(`Track unsubscribed from ${participant.identity}`);
  track.detach();
});
```

---

## 3. DataChannel: 토픽별 디스패치 (4개 채널)

### 3.1 개요 (우리 설계와의 연결)

우리 설계([WebRTC.md](../../state-machines/WebRTC.md) § DataChannel Multiplexing)에 정의된 4개 토픽:

| 토픽 | Reliable | Freq | Payload | 역할 |
|------|----------|------|---------|------|
| `room-authority` | ✅ Yes | ~0.1 Hz | Host ID, authority_epoch, slot grants | 방장/권한 상태 |
| `script-cue` | ✅ Yes | ~0.5 Hz | `{cue_index, ts}` | 스크립트 큐 네비게이션 |
| `chat` | ✅ Yes | Variable | `{sender, text, ts}` | 텍스트 메시지 |
| `blendshape` | ❌ No | 30 Hz | 52 float32 + seq + crc16 | 표정 추적 |

### 3.2 DataChannel 발행 (publishData)

```typescript
import { RoomEvent, DataPacket_Kind } from 'livekit-client';

// ─────────────────────────────────────────────────────────────
// (1) 신뢰성 있는 토픽 발행 (script-cue, chat, room-authority)
// ─────────────────────────────────────────────────────────────

// script-cue: 호스트만 발행 (다른 모든 참가자에게)
const cueTopic = 'script-cue';
const cuePayload = new TextEncoder().encode(JSON.stringify({
  cue_index: 5,
  ts: Date.now(),
}));

await room.localParticipant.publishData(cuePayload, {
  reliable: true,           // 반드시 전달, 순서 보장
  topic: cueTopic,
  // destinationIdentities 생략 → 모든 참가자에게 방송
});

// chat: 누구나 발행 가능 (다른 모든 참가자에게)
const chatTopic = 'chat';
const chatPayload = new TextEncoder().encode(JSON.stringify({
  sender: room.localParticipant.identity,
  text: 'Hello everyone!',
  ts: Date.now(),
}));

await room.localParticipant.publishData(chatPayload, {
  reliable: true,
  topic: chatTopic,
});

// room-authority: 호스트만 발행 (상태 브로드캐스트)
const authTopic = 'room-authority';
const authPayload = new TextEncoder().encode(JSON.stringify({
  host_id: room.localParticipant.identity,
  authority_epoch: stageStore.authorityEpoch,
  locked: stageStore.locked,
  slots: stageStore.slots,
  ts: Date.now(),
}));

await room.localParticipant.publishData(authPayload, {
  reliable: true,
  topic: authTopic,
});

// ─────────────────────────────────────────────────────────────
// (2) 비신뢰성 고주기 토픽 발행 (blendshape)
// ─────────────────────────────────────────────────────────────

// blendshape: 30Hz로 추적 데이터 송신 (손실 허용)
function sendBlendshape(
  blendshapes: Float32Array,
  sequenceNum: number,
  crc16: number
) {
  // Float32Array 52개 + metadata = 208 바이트
  const payloadSize = 52 * 4 + 4 + 4 + 4; // 52 float32 + seq + ts_ms + crc16
  const buffer = new ArrayBuffer(payloadSize);
  const view = new Float32Array(buffer);
  const uint32View = new Uint32Array(buffer);
  
  // 52 blendshape 값 (float32)
  view.set(blendshapes, 0);
  
  // metadata (Uint32 슬롯에 저장)
  uint32View[52] = sequenceNum;         // seq (1-65535 순환)
  uint32View[53] = Date.now() & 0xFFFFFFFF; // timestamp_ms (하위 32비트)
  uint32View[54] = crc16;               // crc16 체크섬
  
  const payload = new Uint8Array(buffer);
  
  // unreliable 발행 (손실 허용, 순서 보장 없음)
  room.localParticipant.publishData(payload, {
    reliable: false,        // 속도 우선, 손실 허용
    topic: 'blendshape',
  });
}

// 30Hz 타이머 (trackingStore에서 호출)
setInterval(() => {
  sendBlendshape(currentBlendshapes, sequenceNum++, calculateCrc16(...));
}, 1000 / 30);
```

### 3.3 DataChannel 수신 (리스너 등록)

```typescript
// ─────────────────────────────────────────────────────────────
// (3) 모든 DataChannel 수신 (단일 리스너)
// ─────────────────────────────────────────────────────────────

room.on(RoomEvent.DataReceived, (
  payload: Uint8Array,
  participant: Participant,
  kind: DataPacket_Kind,
  topic?: string
) => {
  console.log(`DataReceived from ${participant.identity}:`, {
    topic,
    size: payload.length,
    reliable: kind === DataPacket_Kind.RELIABLE,
  });

  // 토픽별 디스패치
  switch (topic) {
    case 'room-authority':
      handleAuthorityUpdate(payload, participant);
      break;
    case 'script-cue':
      handleScriptCue(payload, participant);
      break;
    case 'chat':
      handleChatMessage(payload, participant);
      break;
    case 'blendshape':
      handleBlendshape(payload, participant);
      break;
    default:
      console.warn('Unknown topic:', topic);
  }
});

// ─────────────────────────────────────────────────────────────
// (4) 토픽별 핸들러 (예시)
// ─────────────────────────────────────────────────────────────

function handleAuthorityUpdate(payload: Uint8Array, participant: Participant) {
  try {
    const text = new TextDecoder().decode(payload);
    const data = JSON.parse(text);
    
    // roomStore/stageStore에 반영
    console.log('Authority update:', data);
  } catch (e) {
    console.error('Failed to parse authority update:', e);
  }
}

function handleScriptCue(payload: Uint8Array, participant: Participant) {
  if (!isHost(participant.identity)) {
    console.warn('Script cue from non-host, ignoring');
    return;
  }
  
  const text = new TextDecoder().decode(payload);
  const { cue_index, ts } = JSON.parse(text);
  
  // scriptStore에서 cue_index로 점프
  console.log('Jump to cue:', cue_index);
}

function handleChatMessage(payload: Uint8Array, participant: Participant) {
  const text = new TextDecoder().decode(payload);
  const { sender, text: msg, ts } = JSON.parse(text);
  
  // chatStore에 추가
  console.log(`Chat from ${sender}: ${msg}`);
}

function handleBlendshape(payload: Uint8Array, participant: Participant) {
  // 208 바이트 검증 (§RT-02 참조)
  if (payload.length !== 208) {
    console.warn('Blendshape frame size mismatch, dropping:', payload.length);
    return;
  }
  
  const view = new Float32Array(payload.buffer, payload.byteOffset, 52);
  const uint32View = new Uint32Array(payload.buffer, payload.byteOffset + 52 * 4);
  
  const seq = uint32View[0];
  const tsMs = uint32View[1];
  const crc16Received = uint32View[2];
  
  // CRC16 검증 (부분 수신 감지)
  const crc16Calc = calculateCrc16(view);
  if (crc16Calc !== crc16Received) {
    console.warn('CRC16 mismatch, dropping frame');
    return;
  }
  
  // 수신단 재정렬 버퍼 (seq 역전 감지, 최대 5프레임 홀드)
  enqueueBlendshapeFrame({ blendshapes: view, seq, ts: tsMs }, participant.identity);
}
```

---

## 4. 토큰 갱신·재연결 (WebRTC.md H2 포기 정합)

### 4.1 토큰 만료 5분 전 갱신 (자동)

우리 설계([livekit-edge-fn.md](../../specs/livekit-edge-fn.md) § 7.2)에 따라:

```typescript
import { useEffect, useState } from 'react';

export function useTokenRefresh(
  roomId: string,
  onRefreshed: (newToken: string) => void
) {
  const [token, setToken] = useState<string>('');
  
  useEffect(() => {
    if (!token) return;
    
    // TTL = 10분 (600s), 5분 전 갱신
    const TTL_MS = 10 * 60 * 1000;
    const REFRESH_BEFORE_MS = 5 * 60 * 1000;
    const refreshTime = TTL_MS - REFRESH_BEFORE_MS; // 5분 후 갱신 시작
    
    const timer = setTimeout(async () => {
      try {
        // Supabase Edge Function 호출
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-livekit-token`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
            body: JSON.stringify({ roomName: roomId }),
          }
        );
        
        if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
        
        const { token: newToken } = await res.json();
        setToken(newToken);
        onRefreshed(newToken);
        
        console.log('Token refreshed successfully');
      } catch (err) {
        console.error('Token refresh failed:', err);
        // fallback: 사용자 UX 안내
      }
    }, refreshTime);
    
    return () => clearTimeout(timer);
  }, [token, roomId, onRefreshed]);
  
  return { token, setToken };
}
```

### 4.2 재연결 시 prepareConnection() 활용

토큰 갱신 후 재연결 순서([WebRTC.md](../../state-machines/WebRTC.md) § H2):

```typescript
async function reconnectWithTokenRefresh(
  room: Room,
  url: string,
  newToken: string
) {
  try {
    // (1) DNS/TLS 워밍 (선택적, 클라우드 배포 권장)
    console.log('Preparing connection...');
    await room.prepareConnection(url, newToken);
    
    // (2) 기존 연결 해제
    console.log('Disconnecting old connection...');
    await room.disconnect();
    
    // (3) 새 토큰으로 재연결
    console.log('Reconnecting with new token...');
    await room.connect(url, newToken);
    
    console.log('Reconnection successful');
    
    // (4) 재연결 후 상태 복구 (WebRTC.md H2 § 4)
    await recoverAfterReconnect(room);
    
  } catch (err) {
    console.error('Reconnection failed:', err);
    // FAILED 상태로 전이 (사용자 모달 표시)
  }
}

async function recoverAfterReconnect(room: Room) {
  // a. snapshot fetch (stageStore, room_participants 최신화)
  const { data: snapshot } = await supabase
    .from('rooms')
    .select('id, status, host_id, background_url, script_id, authority_epoch')
    .eq('id', room.name)
    .single();
  
  stageStore.updateFromSnapshot(snapshot);
  
  // b. DataChannel 재등록 (4개 채널)
  registerDataChannelListeners(room);
  
  // c. blendshape 송신 재개 (trackingStore 30Hz 타이머 시작)
  trackingStore.resumeTransmission();
}
```

### 4.3 토큰 갱신 실패 시 Fallback

```typescript
room.on(RoomEvent.ConnectionLostError, async (error) => {
  console.error('Connection lost:', error);
  
  // 1. 토큰 갱신 자동 재시도 (최대 2회)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`Reconnection attempt ${attempt}/2...`);
      const newToken = await fetchFreshToken(roomId);
      await reconnectWithTokenRefresh(room, serverUrl, newToken);
      return; // 성공
    } catch (retryErr) {
      console.warn(`Attempt ${attempt} failed:`, retryErr);
    }
  }
  
  // 2. 2회 실패 후 FAILED 상태 + 사용자 모달
  roomStore.setConnectionState('FAILED');
  // 모달: "연결이 끊어졌습니다" + 로비로 돌아가기 버튼
});
```

---

## 5. 자주 틀리는 지점 (2026 SDK 버전별 차이)

### 5.1 DataChannel API 변화 (v1 → v2)

| 시점 | v1.x (구형) | v2.x (현재) | 주의 |
|------|-----------|----------|------|
| **DataChannel 생성** | `room.createDataChannel(...)` | `room.on(RoomEvent.DataReceived, ...)` 리스너 | v1 API 사용 금지 |
| **데이터 발행** | `localParticipant.publishData(...)` | `publishData(payload, options)` with `topic` | v2.19+에서 `topic` 지원 |
| **신뢰성 옵션** | `ordered: true/false` | `reliable: true/false` | 옵션명 변경 |
| **이벤트 핸들러** | `onDataChannelMessage` | `RoomEvent.DataReceived` | 이벤트명 변경 |

**❌ 구형 패턴 (금지)**:
```typescript
// 절대 금지: v1 API
room.createDataChannel('mychannel');
channel.onMessage = (msg) => { ... };
```

**✅ 최신 패턴 (권장)**:
```typescript
// 올바름: v2.19+
room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
  // topic별 처리
});
```

### 5.2 Token Refresh vs. prepareConnection() 혼동

- **`prepareConnection(url, token?)`**: DNS/TLS 워밍만 수행, 실제 연결 X
- **`connect(url, token)`**: 실제 WebSocket 연결 수립
- **토큰 갱신 시 순서**:
  1. 새 토큰 발급받음
  2. `prepareConnection(url, newToken)` 호출 (선택)
  3. `disconnect()` 호출
  4. `connect(url, newToken)` 호출

❌ 실수:
```typescript
// 틀림: prepareConnection만 호출하고 connect 안 함
await room.prepareConnection(url, newToken);
// → 실제 연결 안 됨!
```

### 5.3 unreliable DataChannel에서 버퍼링

blendshape 같은 고주기 unreliable 채널에서 seq 역전 시:

```typescript
// ❌ 틀림: 재정렬 버퍼 없이 raw 순서로 필터 입력
applyOneEuroFilter(blendshapesRaw);

// ✅ 올바름: 최대 5프레임 재정렬 버퍼 사용
enqueueToReorderBuffer(blendshapes, seq);
if (bufferIsSorted() || bufferHoldTime > 150ms) {
  const [sortedFrames] = drainReorderBuffer();
  sortedFrames.forEach(f => applyOneEuroFilter(f));
}
```

### 5.4 reliable 채널인데 unreliable 옵션 사용

```typescript
// ❌ 틀림: chat은 반드시 reliable이어야 함
await room.localParticipant.publishData(chatPayload, {
  reliable: false,  // 메시지 손실 가능!
  topic: 'chat',
});

// ✅ 올바름: reliable=true
await room.localParticipant.publishData(chatPayload, {
  reliable: true,
  topic: 'chat',
});
```

### 5.5 데이터 인코딩 누락

```typescript
// ❌ 틀림: 문자열을 직접 전송 (SDK가 Uint8Array 기대)
await room.localParticipant.publishData("hello", { ... });

// ✅ 올바름: TextEncoder로 인코딩
const payload = new TextEncoder().encode("hello");
await room.localParticipant.publishData(payload, { ... });

// 또는 JSON
const data = JSON.stringify({ msg: "hello" });
const payload = new TextEncoder().encode(data);
await room.localParticipant.publishData(payload, { ... });
```

### 5.6 토큰 만료 후 자동 갱신 누락

```typescript
// ❌ 틀림: 토큰 갱신 타이머 없음 → 1시간 후 연결 끊김
const res = await fetchToken();
await room.connect(url, res.token);
// → 600초 후 token expire, 갱신 없음 → 연결 단절

// ✅ 올바름: 5분 전 갱신 타이머 설정 (useTokenRefresh 호출)
const { token } = useTokenRefresh(roomId, (newToken) => {
  room.updateToken(newToken);  // SDK 토큰 갱신 (있으면)
  // 또는 수동: reconnectWithTokenRefresh()
});
```

---

## 6. 공식 링크 (조회일 2026-07-02)

| 자료 | URL |
|------|-----|
| **SDK 레퍼런스 (v2.19)** | https://docs.livekit.io/reference/client-sdk-js/ |
| **GitHub 저장소** | https://github.com/livekit/client-sdk-js |
| **DataPackets 가이드** | https://docs.livekit.io/home/client/data/packets/ |
| **JavaScript 빠른시작** | https://docs.livekit.io/home/quickstarts/javascript/ |
| **npm 패키지** | https://www.npmjs.com/package/livekit-client |

### 6.1 로컬 TypeScript 정의 확인

```bash
# 설치된 SDK의 타입 정의 확인
cat node_modules/livekit-client/package.json | grep -A2 '"types"'

# Room, LocalParticipant, RoomEvent 등 시그니처 확인
grep -r "export class Room" node_modules/livekit-client/src/room/

# DataPacket_Kind enum 확인
grep -r "DataPacket_Kind" node_modules/livekit-client/src/
```

---

## 7. 우리 설계와의 정합성 체크

| 설계 명세 | SDK 구현 | 상태 |
|----------|---------|------|
| **토큰 발급** ([livekit-edge-fn.md](../../specs/livekit-edge-fn.md)) | Edge Function에서 `AccessToken(api_key, secret)` 생성 후 JWT 반환 | ✅ |
| **4개 DataChannel 토픽** ([WebRTC.md](../../state-machines/WebRTC.md)) | `publishData(..., { topic: 'room-authority' \| 'script-cue' \| 'chat' \| 'blendshape' })` | ✅ |
| **Reliable 채널** (script-cue, chat, room-authority) | `reliable: true` + `topic` | ✅ |
| **Unreliable 채널** (blendshape 30Hz) | `reliable: false` + `topic: 'blendshape'` | ✅ |
| **토큰 갱신 H2 순서** ([livekit-edge-fn.md](../../specs/livekit-edge-fn.md) § 7.2) | `prepareConnection(url, newToken)` → `disconnect()` → `connect(url, newToken)` | ✅ |
| **토큰 철회 웹훅** ([livekit-edge-fn.md](../../specs/livekit-edge-fn.md) § 6.3) | 웹훅 리스너는 서버(Supabase) 구현, 클라이언트는 `Realtime 구독 + 10s 폴링` | ✅ |
| **ICE 타임아웃 30s** ([WebRTC.md](../../state-machines/WebRTC.md) § G-98) | 클라이언트 로직으로 구현 (SDK는 기본 제공 X, 커스텀 타이머 필요) | ⚠️ 구현 필요 |
| **재정렬 버퍼** (blendshape seq 역전) | SDK는 제공 X, 수신측 핸들러에서 구현 필요 ([WebRTC.md](../../state-machines/WebRTC.md) § 3) | ⚠️ 구현 필요 |

---

## 8. 체크리스트: 구현 시 필독

- [ ] `package.json`에서 `livekit-client` 버전 확인 (^2.19.0 권장)
- [ ] `.env`에 `VITE_LIVEKIT_URL` (wss://...) 설정
- [ ] Supabase Edge Function에서 토큰 발급 확인 ([livekit-edge-fn.md](../../specs/livekit-edge-fn.md))
- [ ] `room.on(RoomEvent.DataReceived, ...)` 리스너에서 4개 토픽 처리 구현
- [ ] blendshape 발행 시 `reliable: false` 설정 (고주기용)
- [ ] 토큰 갱신 타이머 설정 (5분 전, TTL 10분 기준)
- [ ] 재연결 후 snapshot fetch + DataChannel 재등록 구현
- [ ] blendshape 수신측에서 seq 역전 감지 및 재정렬 버퍼 구현
- [ ] ICE 타임아웃 30s 타이머 + 재시도 2회 제한 구현
- [ ] Sentry/로깅에 connection state, RTT, packet loss 기록

---

## 9. 예제 레포: 전체 연결 흐름

```typescript
// src/hooks/useLiveKitRoom.ts
import { useEffect, useRef } from 'react';
import { Room, RoomEvent, DataPacket_Kind } from 'livekit-client';
import { useAuthStore } from '../stores/authStore';
import { useRoomStore } from '../stores/roomStore';
import { useStageStore } from '../stores/stageStore';

export function useLiveKitRoom(roomId: string) {
  const roomRef = useRef<Room | null>(null);
  const { session } = useAuthStore();
  const { setConnectionState, setError } = useRoomStore();
  
  useEffect(() => {
    if (!session) return;
    
    (async () => {
      try {
        // 1. Room 생성
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });
        roomRef.current = room;
        
        // 2. 토큰 발급
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-token`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ roomName: roomId }),
          }
        );
        const { token, server_url } = await res.json();
        
        // 3. 이벤트 리스너 등록
        room.on(RoomEvent.Connected, () => {
          console.log('Connected!');
          setConnectionState('CONNECTED');
        });
        
        room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
          handleDataChannelMessage(payload, participant, topic);
        });
        
        room.on(RoomEvent.ConnectionLostError, (error) => {
          setError(`Connection lost: ${error}`);
          setConnectionState('RECONNECTING');
        });
        
        // 4. 연결
        await room.connect(server_url, token);
        
        // 5. 토큰 갱신 타이머 (매 5분마다)
        const refreshInterval = setInterval(async () => {
          try {
            const newRes = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-livekit-token`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ roomName: roomId }),
              }
            );
            const { token: newToken } = await newRes.json();
            
            // 선택: prepareConnection 호출
            await room.prepareConnection(server_url, newToken);
            console.log('Token refreshed');
          } catch (err) {
            console.error('Token refresh failed:', err);
          }
        }, 5 * 60 * 1000);
        
        return () => {
          clearInterval(refreshInterval);
          room.disconnect();
        };
      } catch (err) {
        console.error('Failed to join room:', err);
        setError(`Join failed: ${err}`);
        setConnectionState('FAILED');
      }
    })();
  }, [roomId, session]);
  
  return roomRef.current;
}

function handleDataChannelMessage(
  payload: Uint8Array,
  participant: any,
  topic?: string
) {
  switch (topic) {
    case 'room-authority': {
      const data = JSON.parse(new TextDecoder().decode(payload));
      useStageStore.setState({ hostId: data.host_id });
      break;
    }
    case 'script-cue': {
      const data = JSON.parse(new TextDecoder().decode(payload));
      console.log('Jump to cue:', data.cue_index);
      break;
    }
    case 'chat': {
      const data = JSON.parse(new TextDecoder().decode(payload));
      console.log(`Chat from ${data.sender}: ${data.text}`);
      break;
    }
    case 'blendshape': {
      // 208 바이트 검증
      if (payload.length === 208) {
        const view = new Float32Array(payload.buffer, payload.byteOffset, 52);
        console.log('Blendshape received:', view);
      }
      break;
    }
  }
}
```

---

## 주석·리뷰 이력

- **2026-07-02**: 초판 작성. v2.19.0~v2.19.2 공식문서 기준.
