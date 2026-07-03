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
   * 변경 시 project.json(AUTORIG mesh-deform rig, rig-format.md §2) 재로드 트리거
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
| `trackingStore` | `modelRig` | ✓ | | 파싱된 project.json 객체 (deformer/keyform lookup — mesh-deform 구동에 사용, rig-format.md §2) |
| `stageStore` | `createAvatarContainer()` | | ✓ | WebGL Container 할당 |
| `stageStore` | `removeAvatarContainer()` | | ✓ | WebGL Container 정리 |

**읽기 전용 스토어:** userStore, trackingStore(lookup), stageStore(getter)
**쓰기:** trackingStore(loadError 기록), stageStore(생명주기)

## DataChannel 의존성

**구독:**
- **Channel:** `blendshape` (unreliable, unordered)
- **발신자:** 다른 participant (자신이 발신한 blendshape는 구독하지 않음 — publishData는 sender에게 echo 안 함)
- **메시지 형식(SSOT):** **RT-02 220B 바이너리 프레임** — `state-machines/WebRTC.md` §RT-02 + `src/lib/blendshapeCodec.ts`.
  `[0..208) Float32×52 blendshapes(canonical 순서) · [208..216) Float64 timestamp_ms · [216..218) Uint16 seq · [218..220) Uint16 crc16`.
  수신검증: 길이≠220 드롭 · crc16 불일치 드롭 · NaN/Inf 드롭 · seq 역전(`isNewerSeq`) 드롭.
  (구 JSON `{blendshapes[],timestamp_ms,calibration_version}` 예시는 바이너리 프레임으로 대체됨.)
- **빈도:** 30 Hz(발신 스로틀 ~20Hz, unreliable 이므로 패킷 손실 허용)
- **용도:** 표정 애니메이션 드라이빙 — 52 blendshapes → `blendshapesToRigParams()`로 연속 `ParamXxx` 변환 → keyform mesh-deform 적용 (rig-format.md §3)

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
| `models` | project.json 메타(project_url) 조회 | Supabase client (trackingStore 초기화 시) |
| `Storage: /models/{user_id}/{model_id}/project.json` | 아바타 rig 구조 로드 | fetch() (PoC: `avatars/{c}/project.json`) |
| `Storage: …/parts/*.webp` | 텍스처 이미지 로드 | `<img crossOrigin="anonymous">` + Storage CORS |

**Realtime:** 불필요 (static asset, 세션 중 모델 변경 없음)
**렌더러:** `src/lib/pixi/rig/`(경로 B로 `public/aria-player`에서 이식 완료 2026-07-02) — **participant별 `RigAvatar` 인스턴스 = 각자 PixiJS Application(= 각자 WebGL 컨텍스트)**. 파일: `RigAvatar.ts`(수명주기+티커)·`renderer.ts`(draw_pixi 인스턴스화)·`rigMath.ts`(rig+physics 팩토리)·`loader.ts`·`expressionDriver.ts`(blendshape→ParamXxx). 구동: 로컬 `AvatarLayer`(head pose+gaze), 원격 `RemoteAvatar`(RT-02 52ch→인스턴스별 드라이버, head pose 없음·gaze 있음).
> ⚠️ **스케일 ceiling (ponytail)**: 아바타별 Application이라 N명 = N WebGL 컨텍스트(브라우저 한계 ~8–16 → 실질 ~6인) + 같은 49텍스처 ×N 메모리. 6인 초과·메모리 압박 시 **단일 Application + participant별 Container(텍스처 공유)**로 리팩터가 업그레이드 경로. PoC(2탭 E2E)에선 인스턴스별로 충분 검증.
> ⚠️ **이식 필수조건**: `draw_pixi.js`(`let app`·`const nodes`)·`state.js`(`const state`)는 **모듈 싱글턴**이라 그대로면 아바타 1개만 가능(`buildScene`의 `nodes.clear()`가 이전 것 파괴). 인스턴스화(`class`/팩토리로 `{app,nodes,parameters,project,rig,images}` 캡슐화)가 멀티 participant의 전제. `rig.js` 변형 수학은 무수정(`state.` 24참조를 주입 ctx로 치환).

## 금지 사항 (MUST NOT)

- ❌ WebGL context 직접 접근 (`gl.*`, `PIXI.Renderer.context`)
- ❌ trackingStore.model_rig(파싱된 project.json)을 **직접 변경** (blendshapesToRigParams → 파라미터 맵 경유만)
- ❌ 다른 participant의 blendshape를 로컬 상태에 **캐싱** (매번 DataChannel 수신해서 즉시 적용)
- ❌ 모델 로드 중 participant_id/model_id prop 변경 (로드 완료 대기)
- ❌ 동일 participant_id로 여러 AvatarCanvas 생성 (1:1 매칭)
- ❌ 아바타 언로드 시 project.json/텍스처 캐시를 전역으로 유지 (메모리 누수)
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
