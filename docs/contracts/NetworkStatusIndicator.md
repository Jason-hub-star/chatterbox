---
tags: [contract]
---

# NetworkStatusIndicator

실시간 네트워크 연결 품질을 우상단 고정 인디케이터로 시각화. 3단계 상태(좋음/보통/나쁨)를 표시하고, `specs/NetworkAdaptiveQuality.md`의 백엔드 적응 로직을 UI로 노출.

## Props Interface

```typescript
interface NetworkStatusIndicatorProps {
  connectionQuality?: 'good' | 'poor' | 'unknown';
  isConnected?: boolean;
  isReconnecting?: boolean;
  onStatusChange?: (status: NetworkStatus) => void;
  showLabel?: boolean; // 라벨 표시 여부 (기본 true)
}

type NetworkStatus = {
  quality: 'good' | 'poor' | 'unknown';
  latencyMs?: number;
  packetLoss?: number;
  bandwidth?: number;
  audioTrackHealth?: number; // 0-1
  videoTrackHealth?: number; // 0-1
};
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|---|---|---|---|---|
| `roomStore` | `connectionState`, `connectionQuality` | ✓ | ✓ | LiveKit 연결 상태 |
| `audioStore` | `uplinkHealth`, `downlinkHealth` | ✓ | | 음성 및 비디오 링크 상태 |
| `networkStore` | `status`, `latency`, `packetLoss`, `quality` | ✓ | ✓ | 네트워크 메트릭 집계 |

## 데이터 규칙

- **좋음 (green)**: RTT < 80ms + packet loss < 1% + audio/video health > 0.8
- **보통 (yellow)**: 80ms ≤ RTT < 150ms 또는 1% ≤ packet loss < 5%
- **나쁨 (red)**: RTT ≥ 150ms 또는 packet loss ≥ 5% 또는 audio/video health < 0.4
- **알 수 없음 (gray)**: 아직 측정되지 않음 또는 연결 실패
- 상태는 1초마다 업데이트되고, 순간적 스파이크는 moving average (3초 윈도우)로 필터링.
- 재연결 중 = isReconnecting=true, 색상 깜박임 (animation)

## DataChannel

LiveKit의 `ConnectionQuality` 이벤트에서 직접 수신.

```typescript
// LiveKit participant connection quality
const handleConnectionQuality = (quality: ConnectionQualityUpdate) => {
  // quality.connectionQuality: 'excellent' | 'good' | 'poor'
  // quality.participant: LocalParticipant | RemoteParticipant
  networkStore.updateQuality({
    quality: mapConnectionQuality(quality.connectionQuality),
    latency: /* measure from SFU stats */,
    packetLoss: /* from webrtc-internals */,
  });
};
```

## 이벤트 흐름

```
[RoomView 마운트 또는 LiveKit 연결]
  ↓
LiveKit ConnectionQuality 이벤트 구독
  ↓
매 1초마다:
  - getRoomStats() (RTT, packet loss)
  - getConnectionQuality() (quality enum)
  ↓
networkStore.updateStatus(...)
  ↓
[NetworkStatusIndicator 렌더링]
  - 우상단 고정 (fixed, z-index 30)
  - 10px 원형 인디케이터 + 옵션 라벨
  - 호버 → tooltip: latency ms, packet loss %, bandwidth Mbps
  ↓
재연결:
  - isReconnecting=true → yellow 깜박임
  - 재연결 성공 → 원래 상태로 복구
  - 재연결 실패 (>30초) → "연결 끊김" 안내 + "새로고침" 버튼
```

## UI 스펙

```
┌─────────────────────────────────┐
│                           ● Good│ <- 우상단 고정 (16px 아래, 16px 오른쪽)
│                                 │    hover: tooltip 표시 (아래 참조)
│                                 │    반경 6px 원형, 상태별 색상
│        [Stage Layout]           │
│                                 │
│                                 │
│                                 │
└─────────────────────────────────┘

상태별 색상:
- Good (초록)  : #10b981
- Poor (주황)  : #f59e0b
- Bad (빨강)   : #ef4444
- Unknown (회색): #9ca3af
```

## 상태별 Hover Tooltip (G-264)

사용자가 인디케이터 위에 커서를 올렸을 때 표시할 조언 문구.

| 상태 | 색상 | Tooltip 제목 | 조언 문구 | 세부 정보 |
|---|---|---|---|---|
| **Good** | 초록 | 좋은 연결 상태입니다 | 빠르고 안정적입니다. 걱정하지 않으셔도 됩니다. | RTT: {ms}ms, 손실: {%}% |
| **Poor (노랑)** | 주황 | 연결 품질이 약간 저하되었습니다 | Wi-Fi를 확인해보세요. 다른 기기의 다운로드를 중지하면 도움이 될 수 있습니다. | RTT: {ms}ms, 손실: {%}% |
| **Bad (빨강)** | 빨강 | 연결이 불안정합니다 | 네트워크를 확인해주세요. Wi-Fi 신호가 약하거나 패킷 손실이 높습니다. | RTT: {ms}ms, 손실: {%}% |
| **Unknown (회색)** | 회색 | 연결 상태를 측정 중입니다 | 잠시 후 상태가 업데이트됩니다. | 정보 없음 |

**구현**:
```typescript
// src/components/NetworkStatusIndicator.tsx

const tooltipConfig: Record<ConnectionQuality, { title: string; advice: string }> = {
  good: {
    title: '좋은 연결 상태입니다',
    advice: '빠르고 안정적입니다. 걱정하지 않으셔도 됩니다.'
  },
  poor: {
    title: '연결 품질이 약간 저하되었습니다',
    advice: 'Wi-Fi를 확인해보세요. 다른 기기의 다운로드를 중지하면 도움이 될 수 있습니다.'
  },
  bad: {
    title: '연결이 불안정합니다',
    advice: '네트워크를 확인해주세요. Wi-Fi 신호가 약하거나 패킷 손실이 높습니다.'
  },
  unknown: {
    title: '연결 상태를 측정 중입니다',
    advice: '잠시 후 상태가 업데이트됩니다.'
  }
};

function NetworkStatusIndicator({ connectionQuality = 'unknown', ...props }: NetworkStatusIndicatorProps) {
  const { title, advice } = tooltipConfig[connectionQuality];
  const details = networkStore.status;
  
  return (
    <div
      className="network-status-indicator"
      title={`${title}\n${advice}\nRTT: ${details.latencyMs}ms, 손실: ${details.packetLoss?.toFixed(1)}%`}
      data-quality={connectionQuality}
    >
      <div className="dot" />
      {showLabel && <span className="label">{connectionQuality === 'good' ? '좋음' : '...분석 중'}</span>}
    </div>
  );
}
```

**Tooltip 스타일**:
```css
.network-status-indicator {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: help;
}

.network-status-indicator:hover::after {
  content: attr(title);
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.9);
  color: #f5f5f2;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
  max-width: 200px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--network-color);  /* green/yellow/red/gray */
  animation: pulse 800ms ease-in-out infinite;
}

.dot[data-quality="reconnecting"] {
  animation: pulse 600ms ease-in-out infinite;
}
```

**Tooltip 제목 + 조언 결합 렌더 (자체 UI 라이브러리 있을 경우)**:
```tsx
import { Tooltip } from '@/components/ui/Tooltip';

<Tooltip
  content={
    <div className="network-tooltip">
      <div className="title">{tooltipConfig[quality].title}</div>
      <div className="advice">{tooltipConfig[quality].advice}</div>
      <div className="details">
        RTT: {latencyMs}ms | 손실: {packetLoss?.toFixed(1)}%
      </div>
    </div>
  }
  side="bottom"
  align="end"
>
  <div className="network-status-dot" />
</Tooltip>
```

## MUST NOT

- ❌ 상태 변경 시마다 리렌더링 폭주 (debounce 1초 필수)
- ❌ 로컬 네트워크 상태만 표시, 원격 참가자 품질 무시 (remote stats도 포함)
- ❌ 사용자 클릭으로 상태 조작 (읽기 전용)
- ❌ 네트워크 인디케이터가 공간 차지해서 UI 밀림 (fixed overlay로 고정, z-index 제어)
- ❌ 재연결 중에 사용자에게 아무 피드백 없음 (깜박임 또는 로딩 표시 필수)

## 관련 문서

- `../specs/NetworkAdaptiveQuality.md` — 백엔드 적응 로직 (quality tier·bandwidth 선택)
- `../DATA-SCHEMA.md` — connection_quality stats 저장 구조
- `../RUNTIME-HARDENING-REVIEW.md` — WebRTC 장애 복구 정책 (H2·H10)
- `RoomView.md` — 우상단 레이아웃 z-index 정책
- `SettingsPage.md` — SET-05 자동 품질 조절과 연계
