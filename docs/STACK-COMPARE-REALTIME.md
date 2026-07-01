---
tags: [guide]
---

<!-- opencode: 2026-06-26 - Realtime media/data stack comparison for Vtuber theater. Coded with OpenCode; high-cost model review recommended. -->

# STACK-COMPARE-REALTIME — 실시간 미디어/데이터 스택 대안 비교

## BLUF
**LiveKit을 유지한다.** Cloudflare RealtimeKit은 Beta 무상과 낮은 분 단위 가격이 매력적이나, 현재 아바타 동기화에 필요한 low-latency lossy 데이터 채널이 **signaling-channel broadcast(클리아언트 기본 1초 5회 rate limit)와 실시간 KV store**로 제한되어 있다. LiveKit은 WebRTC data tracks(lossy)와 data packets(reliable/lossy)를 모두 제공하며, React SDK/Components가 성숙하고 자체 SFU 호스팅도 가능하다. Cloudflare RealtimeKit이 WebRTC data tracks를 추가하거나, latency SLA와 아바타 파라미터 브로드캐스트에 대한 실측 데이터를 공개하면 재평가한다.

## 평가축

| 대안 | 미디어/데이터 기능 | React 지원/성숙도 | 운영/비용 | 보안/라이선스 | 성능/지연 | 리스크 |
|---|---|---|---|---|---|---|
| **LiveKit (현재 선택)** | 오픈소스 WebRTC SFU. audio/video/screen share, **data tracks(lossy continuous)** 및 **data packets(reliable/lossy, 최대 15KiB/1.3KiB)**. RPC, text/byte streams, participant attributes/room metadata. | `@livekit/components-react` + `livekit-client` + React Native. npm unpacked: livekit-client 10.9MB, components-react 3.1MB. 문서/예제 풍부. | 서버는 오픈소스로 자체 호스팅 가능; Cloud는 사용량 기반. | Apache-2.0(LiveKit server), SDK MIT/Apache. E2EE 지원. | WebRTC low-latency. data tracks는 프레임 단위 lossy, data packets는 SCTP 기반. | self-host시 WebRTC 포트/UDP 운영 부담; Cloud 사용 시 vendor lock-in. |
| **Cloudflare RealtimeKit** | 고수준 SDK. audio/video meeting, broadcast message(signaling), realtime KV store, chat/polls/recording/transcription/UI Kit. | UI Kit + Core SDK, React/Angular/Web Components 예제 존재. `@cloudflare/realtimekit` npm 5.3MB. | **Beta 기간 무상**. GA 후 audio/video $0.002/min, audio-only $0.0005/min, export $0.010/min. | Cloudflare 상용 SaaS. 데이터 처리는 Cloudflare 정책 따름. | broadcast는 signaling channel로 rate-limited. 클라이언트 기본 5/s(1s period)이며 `updateRateLimits`로 조정 가능하나 서버측 한계는 여전히 적용. payload는 boolean/number/string/Date/ActiveTab. KV store는 세션 동안 유지. **low-latency WebRTC data track 공식 문서에 없음.** | Beta 기능 변동; lossy 고주파 데이터에 부적합; Cloudflare lock-in. |
| **Cloudflare Realtime SFU** | 저수준 WebRTC SFU. audio/video/data. 직접 PeerConnection/Tracks 관리. | SDK 없음. 모든 WebRTC 라이브러리와 조합 가능. | $0.05/GB egress, 매월 첫 1,000GB 무상. TURN은 Realtime SFU와 함께 사용 시 무상. | Cloudflare 인프라. | 전문가 수준 튜닝 시 낮은 지연 가능. data channel 직접 구현 필요. | 구현/운영 난이도 높음; signaling/presence 직접 작성. |
| **Socket.io / Custom WebSocket** | 텍스트/바이너리 메시지, room broadcast. 미디어는 별도(WebRTC P2P or SFU). | 임의 구현. | 매우 낮음(자체 서버). | 자체 코드/오픈소스. | WebSocket은 TCP 기반, head-of-line blocking 가능. 실시간 미디어와 통합되지 않음. | 아바타 동기화 + 음성/영상을 한 플랫폼에서 처리할 수 없어 복잡도 증가. |

## 상세 비교

### LiveKit
- **데이터 기능**: LiveKit 문서는 text streams, byte streams, RPC, data tracks, data packets, state sync를 명확히 구분. data tracks는 "lossy, continuous"로 센서/텔레메트리/게임 상태에 적합하며, data packets는 reliable/lossy 선택 가능. reliable 모드 최대 15KiB, lossy 모드 권장 1,300B.
- **React 지원**: `@livekit/components-react`와 `livekit-client`를 함께 설치. Next.js voice agent starter, `ControlBar`, `RoomAudioRenderer`, `useSession`, `SessionProvider` 등 성숙한 컴포넌트 제공.
- **출처**: https://docs.livekit.io/transport/data, https://docs.livekit.io/transport/data/data-tracks, https://docs.livekit.io/transport/data/packets, https://docs.livekit.io/transport/sdk-platforms/react
- **npm 크기**: `livekit-client@latest` dist.unpackedSize = 10,900,406B, `@livekit/components-react@latest` = 3,062,912B (2026-06-26).

### Cloudflare RealtimeKit
- **데이터 기능**: `broadcastMessage` API는 signaling channel을 통해 모든 참가자(또는 특정 participant/preset/meeting)에게 boolean/number/string/Date/ActiveTab payload를 전송. 클라이언트측 기본 rate limit은 1초당 5회(maxInvocations=5, period=1s)이며 `rateLimitConfig`/`updateRateLimits`로 조정 가능하나, 서버측 limit도 별도 적용될 수 있다. Stores API는 실시간 key-value(store value: string/number/object/array)를 세션 동안 유지. 둘 다 채팅/손들기/상태 동기화에는 적합하지만, 60fps 아바타 파라미터/텔레메트리에는 부적합.
- **비용**: Pricing 페이지에 따른 Beta 기간 무상. GA 후 audio/video 참가자 $0.002/min, audio-only $0.0005/min.
- **출처**: https://developers.cloudflare.com/realtime/realtimekit/broadcast-apis/, https://developers.cloudflare.com/realtime/realtimekit/collaborative-stores/, https://developers.cloudflare.com/realtime/realtimekit/pricing/
- **npm 크기**: `@cloudflare/realtimekit@latest` dist.unpackedSize = 5,270,482B (2026-06-26).

### Cloudflare Realtime SFU
- **개요**: "Build real-time serverless video, audio, and data applications" — WebRTC SFU/브로드캐스트 CDN 중간 형태. 직접 WebRTC 로직을 작성해야 하며 SDK는 제공되지 않는다.
- **비용**: egress $0.05/GB, 첫 1,000GB/월 무상.
- **출처**: https://developers.cloudflare.com/realtime/sfu/, https://developers.cloudflare.com/realtime/

### Socket.io / Custom WebSocket
- **개요**: 메시지 브로커로서 실시간 데이터를 주고받을 수 있지만, WebRTC 미디어 라이프사이클(data tracks, simulcast, TURN)을 직접 연결해야 한다.
- **리스크**: 미디어와 데이터를 분리하면 동기화, 재연결, E2EE, 모바일 배터리 최적화에서 LiveKit 같은 통합 플랫폼 대비 많은 엔지니어링이 필요.

## 결정

**ARCHITECTURE-B의 현재 선택(LiveKit)을 바꿔야 하는가? NO.**

- Cloudflare RealtimeKit은 회의/음성 에이전트 UI에는 적합하지만, 아바타 파라미터 브로드캐스트에 필요한 lossy low-latency 데이터 채널이 공식 문서에 보이지 않는다.
- LiveKit의 data tracks/data packets를 그대로 사용하고, 필요 시 self-hosted LiveKit로 전환하여 운영비를 조절한다.
- 다음 조건에서 Cloudflare RealtimeKit/SFU를 재평가한다:
  - RealtimeKit Core SDK에 WebRTC data tracks 또는 60fps 이상의 lossy broadcast API가 추가될 때.
  - LiveKit Cloud 비용이 매출 대비 비율로 부담스러워지고, Cloudflare egress 가격이 유리해질 때.
