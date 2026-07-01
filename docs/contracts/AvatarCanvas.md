---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->

# 1. AvatarCanvas

단일 participant의 아바타를 렌더링하는 WebGL 캔버스(PixiJS Application 내부 Container).

## Props Interface

```typescript
interface AvatarCanvasProps {
  /**
   * 이 아바타의 소유자 participant_id (LiveKit participant ID)
   * room_participants 테이블의 user_id와 매칭 가능
   */
  participantId: string;

  /**
   * 렌더링할 모델 ID (models 테이블 primary key)
   * 변경 시 rig.json 재로드 트리거
   */
  modelId: string;

  /**
   * PixiJS Application 싱글턴 래퍼
   * Container 생성/제거 진행 (내부에서만 사용)
   */
  application: PIXI.Application;

  /**
   * 아바타가 소속한 ParticipantSlot의 위치/크기 정보
   * (선택) 없으면 기본값 사용
   */
  slotPosition?: { x: number; y: number; scale: number };

  /**
   * 로드 완료 콜백
   * signature: () => void
   */
  onReady?: () => void;

  /**
   * 로드 실패 콜백
   * signature: (error: Error) => void
   */
  onError?: (error: Error) => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `userStore` | `selectedModelId` | ✓ | | 현재 사용자의 기본 모델 ID (처음 로드 시) |
| `userStore` | `avatarData` | ✓ | | 사용자 아바타 메타 (skin tone 등, 예정) |
| `trackingStore` | `avatarState[participantId]` | ✓ | | 현재 participant의 blendshape 상태 |
| `trackingStore` | `loadError` | ✓ | ✓ | 로드 에러 기록 |
| `trackingStore` | `modelRig` | ✓ | | 파싱된 rig.json 객체 (ParameterDriver가 쓰는 lookup table) |
| `stageStore` | `createAvatarContainer()` | | ✓ | WebGL Container 할당 |
| `stageStore` | `removeAvatarContainer()` | | ✓ | WebGL Container 정리 |

**읽기 전용 스토어:** userStore, trackingStore(lookup), stageStore(getter)
**쓰기:** trackingStore(loadError 기록), stageStore(생명주기)

## DataChannel 의존성

**구독:**
- **Channel:** `blendshape` (unreliable, unordered)
- **발신자:** 다른 participant (자신이 발신한 blendshape는 구독하지 않음)
- **메시지 형식:**
  ```json
  {
    "blendshapes": [0.5, 0.2, 0.0, ...],  // Float32Array[52] ARKit
    "timestamp_ms": 1624561200000,
    "calibration_version": 1
  }
  ```
- **빈도:** 30 Hz (unreliable 이므로 패킷 손실 허용)
- **용도:** 표정 애니메이션 드라이빙 (ParameterDriver 거쳐서 rig 파라미터 적용)

**발행:** 없음 (수신 전용)

## LiveKit 이벤트

| 이벤트 | 핸들러 | 작업 |
|--------|--------|------|
| `room.onParticipantConnected(participant)` | ParticipantSlot | 아바타 로드 시작 (AvatarCanvas mount) |
| `room.onParticipantDisconnected(participant)` | ParticipantSlot | 컨테이너 제거 + WebGL 메모리 해제 |
| `participant.audioTrackPublications` | ParticipantSlot | 오디오 여부 (UI 표시용, AvatarCanvas 영향 없음) |

**AvatarCanvas가 직접 구독하지 않음:** ParticipantSlot이 mount/unmount로 관리.

## Supabase 접근

| 테이블/Storage | 작업 | 방법 |
|---|---|---|
| `models` | rig.json 메타 조회 | Supabase client (trackingStore 초기화 시) |
| `Storage: /models/{user_id}/rig.json` | 아바타 구조 로드 | fetch() via signed URL |
| `Storage: /models/{user_id}/parts/*.png` | 텍스처 이미지 로드 | Pixi.Loader |

**Realtime:** 불필요 (static asset, 세션 중 모델 변경 없음)

## 금지 사항 (MUST NOT)

- ❌ WebGL context 직접 접근 (`gl.*`, `PIXI.Renderer.context`)
- ❌ trackingStore.model_rig 파라미터를 **직접 변경** (ParameterDriver 경유만 허용)
- ❌ 다른 participant의 blendshape를 로컬 상태에 **캐싱** (매번 DataChannel 수신해서 즉시 적용)
- ❌ 모델 로드 중 participant_id/model_id prop 변경 (로드 완료 대기)
- ❌ 동일 participant_id로 여러 AvatarCanvas 생성 (1:1 매칭)
- ❌ 아바타 언로드 시 rig.json 캐시를 전역으로 유지 (메모리 누수)
- ❌ PixiJS `Application.destroy()` 호출 전 LiveKit DataChannel listener 미제거 (room.off('dataReceived', blendshapeHandler) 명시 필수)
- ❌ blendshape 핸들러에서 React state를 직접 참조 (**stale closure**, useRef 활용)
- ❌ rAF 루프 안에서 언마운트된 DisplayObject에 접근 (destroyChildren 후 render frame 발생 금지)
- ❌ WebGL context loss를 무시하고 음성만 정상인 참가자를 정상 렌더로 표시 (Ghost Speaker)

## Implementation Hints

**언마운트 순서 (반드시 이 순서):**
```
1. isDestroying = true (ref)
2. LiveKit DataChannel 리스너 명시 제거 (room.off('dataReceived', handler))
3. rAF 루프 cancel (cancelAnimationFrame)
4. PixiJS app.destroy(true, { children: true, texture: true })
```

**주의:**
- cleanup useEffect에서 위 순서를 엄격히 준수
- renderer.render() 호출 중 DisplayObject tree 조작 금지
- blendshape handler에서는 항상 `isDestroying` ref를 먼저 체크한 후 처리
- `webglcontextlost` 발생 시 AvatarCanvas의 핸들러가 `is_webgl_degraded = true` 플래그를 설정하면, Avatar.md § Edge Case 4에서 React가 감지해 static/voice-only badge로 렌더 전환 (상태 머신은 RENDERING 유지, 플래그 기반 UI 전환)
- host에게 `avatar_render_failed` 상태 알림 (HostConsole tracking health telemetry)

## 컴포넌트 관계

```
[ParticipantSlot]
  ├─ mount/unmount on peer connected/disconnected
  └─ [AvatarCanvas]
      ├─ subscribe blendshape (DataChannel)
      ├─ read trackingStore.avatar_state
      └─ render rig + apply blendshapes
```
