---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->

# 9. AudioMixer

참가자 목소리 / BGM / 메인뷰 사운드 채널별 볼륨 조절. LiveKit audioTrack N개 + HTMLAudioElement(BGM) 동시 제어.

> **as-built (2026-07-10, ROOM-08 MVP):** `stores/audioStore.ts`(masterVolume·participantVolumes·`mixedVolume`=곱·0~1 클램프) + `features/room/AudioMixerPanel.tsx`(무대 우상단 🎚 토글 → 마스터+원격 참가자 슬라이더, 관전자 포함 전원) + `useLiveKitRoom` 브리지(스토어 구독 → `RemoteParticipant.setVolume` 전체 적용, TrackSubscribed 시 저장 볼륨 즉시 적용=재구독 초기화 방지). 스토어는 SDK 미보유(컨벤션 §2). **계약 대비 defer(죽은 코드 방지):** BGM 채널(앱에 BGM 기능 자체 부재)·업링크 헬스 체크(§ROOM-04)·audioTrackPublished 개별 핸들러(TrackSubscribed 로 충분).

## Props Interface

```typescript
interface AudioMixerProps {
  /**
   * UI 표시 여부
   */
  isVisible?: boolean;

  /**
   * 마스터 볼륨 변경 콜백
   */
  onMasterVolumeChange?: (volume: number) => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `roomStore` | `participants` | ✓ | | 참가자 목록 (audioTrack 찾기) |
| `audioStore` | `masterVolume` | ✓ | ✓ | 마스터 볼륨 (0-1) |
| `audioStore` | `participantVolumes` | ✓ | ✓ | 참가자별 볼륨 (dict) |
| `audioStore` | `bgmVolume` | ✓ | ✓ | BGM 볼륨 (0-1) |

## DataChannel 의존성

**구독:** 없음 (LiveKit audioTrack만 사용).

**발행:** 없음.

## LiveKit 이벤트

| 이벤트 | 핸들러 | 작업 |
|--------|--------|------|
| `participant.audioTrackPublished(track)` | AudioMixer | track 추가, 볼륨 설정 |
| `participant.audioTrackUnpublished(track)` | AudioMixer | track 제거 |
| `participant.trackSubscriptionStatusChanged(track)` | AudioMixer | 원격 구독 실패/재시도 상태 표시 |

## ROOM-04 업링크 헬스 체크

- 로컬 마이크 meter가 움직여도 상대가 구독하지 못하면 실패로 본다.
- 각 클라이언트는 5초마다 `audio_uplink_heartbeat`를 presence payload로 보낸다.
- 원격 참가자가 10초 동안 내 audio track subscription ack를 보내지 않으면 UI에 "상대에게 음성이 안 들릴 수 있어요" 배너를 표시한다.
- HostConsole에는 참가자별 `mic_local_active`, `remote_subscribed_count`, `last_audio_ack_at`을 표시한다.

## Supabase 접근

**없음** — 클라이언트 사이드 오디오 제어만.

## 금지 사항 (MUST NOT)

- ❌ 다른 참가자 오디오를 서버에 믹싱 후 전송 (클라이언트 사이드만)
- ❌ 참가자 오디오 수정/필터링 없이 원본 재생 (응답성 문제)
- ❌ master_volume 변경 시 모든 track 반영 안 함 (동일 적용)
- ❌ HTMLAudioElement(BGM) 없이 WebAudio API만 사용 (호환성)
- ❌ 로컬 마이크 meter만 보고 송신 성공으로 표시

## 컴포넌트 관계

```
[AudioMixer]
  ├─ read: roomStore.participants[]
  ├─ read/write: audioStore
  │
  ├─ [Participant Volume Sliders] x N
  │  └─ on change: update participant audioTrack.volume
  │
  ├─ [Master Volume Slider]
  │  └─ on change: scale all volumes by master
  │
  ├─ [BGM Volume Slider]
  │  └─ on change: update HTMLAudioElement.volume
  │
  └─ client-side only (no server mixing)
```
