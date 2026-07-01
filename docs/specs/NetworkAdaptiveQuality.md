---
tags: [spec]
---

> G-119 산출 문서. LiveKit 네트워크 적응형 품질 제어.

# 네트워크 적응형 품질 제어 (Adaptive Quality)

## 개요

LiveKit는 네트워크 상태에 따라 자동으로 비디오 품질을 조정하는 기능을 제공합니다.  
본 문서는 `setPublishingQuality()` API와 `ConnectionQuality` 이벤트를 기반으로 한 구현 방법을 정의합니다.

---

## 1. 핵심 API

### 1.1 `room.localParticipant.setPublishingQuality(quality: VideoQuality)`

**시그니처:**
```typescript
setPublishingQuality(maxQuality: VideoQuality): void
```

**매개변수:**
| 값 | 설명 | 해상도 | 비트레이트(참고) |
|---|---|---|---|
| `VideoQuality.OFF` | 비디오 비활성화 | — | 0 kbps |
| `VideoQuality.LOW` | 저품질 (모바일 등) | 320×180 | ~100 kbps |
| `VideoQuality.MEDIUM` | 중품질 (기본값) | 640×360 | ~300 kbps |
| `VideoQuality.HIGH` | 고품질 (데스크톱) | 1280×720 | ~800 kbps |

**사용 예:**
```typescript
import { VideoQuality } from 'livekit-client';

const room = useRoomStore((s) => s.room);
if (room) {
  room.localParticipant.setPublishingQuality(VideoQuality.MEDIUM);
}
```

---

## 2. 네트워크 품질 이벤트

### 2.1 `room.on('connectionQualityChanged')`

네트워크 상태가 변경될 때 발생하는 이벤트.

**콜백 시그니처:**
```typescript
room.on(
  'connectionQualityChanged',
  (quality: ConnectionQuality, participant?: Participant) => {
    // quality: 'excellent' | 'good' | 'poor' | 'lost'
    // participant: 해당 참가자 (생략 시 로컬 참가자)
  }
);
```

**ConnectionQuality enum:**
| 값 | 의미 | 권장 조치 |
|---|---|---|
| `ConnectionQuality.Excellent` | 네트워크 매우 좋음 | HIGH 품질로 업그레이드 |
| `ConnectionQuality.Good` | 네트워크 양호 | MEDIUM 유지 |
| `ConnectionQuality.Poor` | 네트워크 불안정 | LOW 다운그레이드 |
| `ConnectionQuality.Lost` | 연결 끊김 | OFF (비디오 비활성화) |

**구현 예:**
```typescript
// hooks/useNetworkQuality.ts
import { useEffect } from 'react';
import { ConnectionQuality, VideoQuality } from 'livekit-client';
import { useRoomStore } from '../stores/roomStore';

export function useNetworkQuality() {
  const room = useRoomStore((s) => s.room);
  const updateQuality = useRoomStore((s) => s.updatePublishingQuality);

  useEffect(() => {
    if (!room) return;

    const handleQualityChange = (
      quality: ConnectionQuality,
      participant?: any
    ) => {
      // 로컬 참가자의 품질만 제어
      if (participant && participant !== room.localParticipant) {
        return;
      }

      let newQuality: VideoQuality;

      switch (quality) {
        case ConnectionQuality.Excellent:
          newQuality = VideoQuality.HIGH;
          console.log('📶 Network excellent → HIGH quality');
          break;

        case ConnectionQuality.Good:
          newQuality = VideoQuality.MEDIUM;
          console.log('📊 Network good → MEDIUM quality');
          break;

        case ConnectionQuality.Poor:
          newQuality = VideoQuality.LOW;
          console.warn('⚠️ Network poor → LOW quality');
          break;

        case ConnectionQuality.Lost:
          newQuality = VideoQuality.OFF;
          console.error('❌ Network lost → VIDEO OFF');
          break;

        default:
          return;
      }

      // LiveKit API 호출
      room.localParticipant.setPublishingQuality(newQuality);
      
      // Zustand store 업데이트
      updateQuality(newQuality);
    };

    room.on('connectionQualityChanged', handleQualityChange);

    return () => {
      room.off('connectionQualityChanged', handleQualityChange);
    };
  }, [room, updateQuality]);
}
```

---

## 3. Simulcast 레이어 설정

Simulcast를 사용하면 서버가 여러 해상도로 인코딩하고, 구독자가 네트워크에 맞게 선택할 수 있습니다.

### 3.1 발행 시 Simulcast 활성화

```typescript
import { VideoCodec } from 'livekit-client';

// Room 연결 시 트랙 설정
const videoTrack = await createLocalVideoTrack({
  resolution: { width: 1280, height: 720 }, // 최대 해상도
  simulcast: true, // Simulcast 활성화
});

await room.localParticipant.publishTrack(videoTrack);
```

### 3.2 3단계 Simulcast 레이어

LiveKit는 자동으로 3개 레이어를 생성합니다:

| 레이어 | 해상도 | 비트레이트 |
|---|---|---|
| High | 1280×720 | ~800 kbps |
| Mid | 640×360 | ~300 kbps |
| Low | 320×180 | ~100 kbps |

구독자는 자신의 네트워크에 맞게 자동 선택.

**수동 레이어 선택 (고급):**
```typescript
// 특정 참가자의 레이어 선택
const subscription = room.subscribers.get(participantId)?.videoTrack;
if (subscription) {
  subscription.setSimulcastFeasibility({
    high: true,
    medium: true,
    low: true,
  });
}
```

---

## 4. 통합 예시: RoomStore + useNetworkQuality

### 4.1 Zustand store 정의

```typescript
// stores/roomStore.ts
import { create } from 'zustand';
import { VideoQuality, Room } from 'livekit-client';

interface RoomState {
  room: Room | null;
  currentQuality: VideoQuality;
  updatePublishingQuality: (quality: VideoQuality) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  currentQuality: VideoQuality.MEDIUM,
  updatePublishingQuality: (quality) => {
    set({ currentQuality: quality });
  },
}));
```

### 4.2 컴포넌트에서 사용

```typescript
// components/Room.tsx
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import { useRoomStore } from '../stores/roomStore';

export function Room() {
  // 자동 네트워크 품질 모니터링 시작
  useNetworkQuality();

  const currentQuality = useRoomStore((s) => s.currentQuality);

  return (
    <div className="room">
      <div className="quality-badge">
        📊 Quality: {currentQuality.name || 'MEDIUM'}
      </div>
      {/* 나머지 room UI */}
    </div>
  );
}
```

---

## 5. 네트워크 상태 UI 표시

사용자에게 네트워크 상태를 시각적으로 피드백:

```typescript
// components/NetworkStatus.tsx
import { ConnectionQuality, VideoQuality } from 'livekit-client';

interface NetworkStatusProps {
  quality: ConnectionQuality;
  videoQuality: VideoQuality;
}

export function NetworkStatus({ quality, videoQuality }: NetworkStatusProps) {
  const getStatusColor = () => {
    switch (quality) {
      case ConnectionQuality.Excellent:
        return 'text-green-500';
      case ConnectionQuality.Good:
        return 'text-blue-500';
      case ConnectionQuality.Poor:
        return 'text-yellow-500';
      case ConnectionQuality.Lost:
        return 'text-red-500';
    }
  };

  const getStatusIcon = () => {
    switch (quality) {
      case ConnectionQuality.Excellent:
        return '📶';
      case ConnectionQuality.Good:
        return '📊';
      case ConnectionQuality.Poor:
        return '⚠️';
      case ConnectionQuality.Lost:
        return '❌';
    }
  };

  return (
    <div className={`flex items-center gap-2 ${getStatusColor()}`}>
      <span>{getStatusIcon()}</span>
      <span>{quality}</span>
      <span className="text-xs">({videoQuality})</span>
    </div>
  );
}
```

---

## 6. 고급: 수동 품질 제어

자동 조정 외에 사용자가 수동으로 품질을 선택할 수 있도록:

```typescript
// components/QualitySelector.tsx
import { VideoQuality } from 'livekit-client';
import { useRoomStore } from '../stores/roomStore';

export function QualitySelector() {
  const room = useRoomStore((s) => s.room);
  const currentQuality = useRoomStore((s) => s.currentQuality);
  const updateQuality = useRoomStore((s) => s.updatePublishingQuality);

  const handleSelectQuality = (quality: VideoQuality) => {
    if (room) {
      room.localParticipant.setPublishingQuality(quality);
      updateQuality(quality);
    }
  };

  return (
    <div className="flex gap-2">
      {[
        { label: 'OFF', value: VideoQuality.OFF },
        { label: 'LOW', value: VideoQuality.LOW },
        { label: 'MEDIUM', value: VideoQuality.MEDIUM },
        { label: 'HIGH', value: VideoQuality.HIGH },
      ].map(({ label, value }) => (
        <button
          key={label}
          className={`px-3 py-1 rounded ${
            currentQuality === value
              ? 'bg-blue-500 text-white'
              : 'bg-gray-300 text-black'
          }`}
          onClick={() => handleSelectQuality(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

---

## 7. MUST NOT

- ❌ **`setPublishingQualityForSub()` 사용 금지** — 이 API는 존재하지 않음
- ❌ **구독자 품질 강제 제어** — 구독자의 로컬 품질 설정만 가능, 발행자는 제어 불가
- ❌ **Simulcast 비활성화 후 레이어 선택** — Simulcast 활성화 필수
- ❌ **네트워크 이벤트 핸들러 등록 후 정리 미흡** — 반드시 `room.off()` 호출해서 메모리 누수 방지

---

## 8. 측정 및 모니터링

네트워크 적응 효과를 검증:

```typescript
// lib/monitoring.ts
export function logNetworkQualityMetrics(
  quality: ConnectionQuality,
  videoQuality: VideoQuality
) {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] Network: ${quality} → Video: ${videoQuality}`
  );

  // Analytics 전송 (선택사항)
  // analytics.track('network_quality_changed', {
  //   quality,
  //   videoQuality,
  //   timestamp,
  // });
}
```

---

## 참고 문서

- LiveKit Client JS: https://docs.livekit.io/client-sdk-js/
- VideoQuality enum: `livekit-client` v1.6.0+
- ConnectionQuality enum: `livekit-client` v0.15.0+
