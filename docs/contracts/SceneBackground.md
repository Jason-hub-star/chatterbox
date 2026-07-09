---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->

# 14. SceneBackground [Layer-Based Interactive Scenes]

배경 씬을 레이어별 PNG로 분리해서 PixiJS 스프라이트로 올리고, 각 레이어가 마우스 인터랙션(클릭·호버)과 idle 애니메이션에 반응한다.  
하스스톤 게임 맵처럼 계층화된 배경으로, 씬의 분위기를 효과적으로 표현한다.

**관련 문서**: DESIGN-DIRECTION.md §4, DATA-SCHEMA.md (scenes.layers_json), SoundSystem.md (click 이벤트 오디오)

> **as-built (2026-07-09, 배포됨·`773738f`)** — 배경 **교체 MVP**만 구현(레이어 인터랙션 아님 = ROOM-26/G-207 그대로 defer). 구현분: Edge `set-room-background`(호스트검증 + `isSafeBackgroundUrl` allowlist=`/scenes/`·`..` 차단) → `rooms.background_url` UPDATE → `bg_change` `room-authority` broadcast → `stores/stageStore.backgroundUrl` → `features/stage/Stage.tsx` CSS 배경레이어(`bg-cover bg-center opacity-60`). 정적 목록 `lib/stageBackgrounds.ts`(none/theater/teahouse/workshop/plaza), HostConsole 썸네일 버튼(`host.background`). 렌더는 낙관적 로컬셋이 아니라 **서버 broadcast 왕복**이라 전 참가자 동기. 라이브검증: 호스트 극장 클릭→무대 배경 실렌더, 콘솔 무에러. **defer(트랙 B/ROOM-26)**: 아래 계약이 기술하는 레이어별 PNG PixiJS 스프라이트·클릭/호버 인터랙션·idle 애니·`sound_trigger`·씬 전환 fade — 전부 미구현(현재는 단일 배경 이미지 교체).

---

## Props Interface

```typescript
type SceneBackgroundProps = {
  roomId: string;
  // layers_json은 stageStore.activeScene.layers_json 에서 읽음
};
```

---

## SceneLayer 타입 정의

```typescript
type InteractionType = 'idle_anim' | 'click' | 'hover' | 'none';

type IdleAnimation = {
  type: 'sway' | 'pulse' | 'flicker' | 'float';
  amplitude: number;      // 도(deg) 또는 px
  period_ms: number;      // 밀리초, 루프 주기
};

type ClickEvent = {
  animation: 'scale_bounce' | 'shake' | 'glow';
  duration_ms: number;
  sound_id?: string;      // sounds 테이블 참조 (선택), 호스트만 발행
};

type HoverEvent = {
  animation: 'sway_amplify' | 'brightness_up' | 'glow';
  duration_ms: number;
};

// 2026-07-07 추가: 요소 레이어(부유섬·랜턴 등 비풀프레임)의 배치·스케일.
// 실합성 검증에서 필요 확인 — 초기값은 design/scene-prompts.md "생성·검증 실측" 참조.
type LayerTransform = {
  x: number;                           // px, 1536×1024 기준 캔버스 좌표 (음수 = 프레임 밖 크롭)
  y: number;
  scale_x?: number;                    // 기본 1.0
  scale_y?: number;                    // 기본 1.0 (비균등 허용 — 예: waves_mid (1.15, 0.5))
};

type SceneLayer = {
  id: string;                          // 레이어 식별자 (e.g., "fire_layer")
  name: string;                        // 사람이 읽는 이름 (e.g., "Campfire")
  image_url: string;                   // Supabase Storage PNG URL (투명 배경 필수)
  z_order: number;                     // 렌더 순서 (낮을수록 뒤, 0~1000)
  transform?: LayerTransform;          // 없으면 (0,0) 풀프레임
  interaction_type: InteractionType[]; // 복수 가능 (e.g., ['idle_anim', 'click'])
  idle_animation?: IdleAnimation;      // interaction_type에 'idle_anim' 포함 시 필수
  click_event?: ClickEvent;            // interaction_type에 'click' 포함 시 필수
  hover_event?: HoverEvent;            // interaction_type에 'hover' 포함 시 필수
};

// scenes 테이블 확장
type Scene = {
  id: string;
  name: string;
  accent_color: string;        // CSS hex color (기존)
  background_url?: string;     // legacy: CSS background-image (호환성)
  layers_json: SceneLayer[];   // 신규: 레이어 배열
  particle_config?: {
    type: 'stars' | 'sparks' | 'none';
    intensity: number;         // 0.0 ~ 1.0
  };
  // ... 기타 필드
};
```

### 예시 (campfire-forest)

```json
{
  "id": "campfire-forest",
  "name": "숲 모닥불",
  "accent_color": "#FFA500",
  "layers_json": [
    {
      "id": "sky_layer",
      "name": "밤하늘",
      "image_url": "gs://bucket/scenes/campfire-forest/sky_layer.png",
      "z_order": 0,
      "interaction_type": ["idle_anim"],
      "idle_animation": {
        "type": "pulse",
        "amplitude": 0.05,
        "period_ms": 4000
      }
    },
    {
      "id": "tree_back_layer",
      "name": "뒷배경 나무",
      "image_url": "gs://bucket/scenes/campfire-forest/tree_back_layer.png",
      "z_order": 1,
      "interaction_type": ["idle_anim"],
      "idle_animation": {
        "type": "sway",
        "amplitude": 0.5,
        "period_ms": 3000
      }
    },
    {
      "id": "ground_layer",
      "name": "지면",
      "image_url": "gs://bucket/scenes/campfire-forest/ground_layer.png",
      "z_order": 3,
      "interaction_type": ["none"]
    },
    {
      "id": "fire_layer",
      "name": "모닥불",
      "image_url": "gs://bucket/scenes/campfire-forest/fire_layer.png",
      "z_order": 2,
      "interaction_type": ["click", "idle_anim"],
      "idle_animation": {
        "type": "flicker",
        "amplitude": 0.08,
        "period_ms": 200
      },
      "click_event": {
        "animation": "scale_bounce",
        "duration_ms": 600,
        "sound_id": "fire_crackle"
      }
    },
    {
      "id": "leaves_layer",
      "name": "낙엽",
      "image_url": "gs://bucket/scenes/campfire-forest/leaves_layer.png",
      "z_order": 4,
      "interaction_type": ["hover"],
      "hover_event": {
        "animation": "sway_amplify",
        "duration_ms": 300
      }
    }
  ],
  "particle_config": {
    "type": "stars",
    "intensity": 0.6
  }
}
```

---

## Store 의존성

| Store | 읽기 | 쓰기 |
|---|---|---|
| `stageStore` | `activeScene: Scene` (+ `layers_json`) | — |
| `stageStore` | `focusedSlot: number \| null` | — |

**신규 요구**:  
`stageStore.activeScene.layers_json: SceneLayer[]` 포함 필수. 기존 필드 (`accent_color`, `background_url`) 유지.

---

## DataChannel 의존성

| 채널 | 방향 | 타입 | 처리 | 호스트만 |
|---|---|---|---|---|
| `room-authority` | 수신 | `bg_change` | 씬 교체 실행 (layers_json 파싱) | — |
| `room-authority` | 발행 | `sound_trigger` | 클릭 이벤트 오디오 동기화 | ✓ |

**sound_trigger 페이로드**:
```typescript
{
  type: 'sound_trigger';
  payload: {
    sound_id: string;        // ClickEvent.sound_id
    layer_id: string;        // 어느 레이어인지 추적용
    timestamp_ms: number;
  };
}
```

---

## 동작 명세

### 1. 씬 로딩 및 레이어 렌더

```
[SceneBackground mount] 또는 [stageStore.activeScene 변화]
  → 기존 스프라이트 destroy (있으면)
  → layers_json 파싱
  → z_order 순서로 PixiJS Sprite 생성
  → Supabase Storage에서 PNG 텍스처 로드
  → scene_root Container에 추가 (z 순서 유지)
  → fade transition 0.5s (opacity: 0 → 1)
```

### 2. Idle 애니메이션

각 레이어의 idle_animation이 있으면, GSAP 또는 PixiJS ticker로 **무한 루프** 실행:

- **sway**: `rotation` ±amplitude(도) → 주기 period_ms
- **pulse**: `scale` 1.0 → (1.0 + amplitude) → 1.0 → 주기 period_ms
- **flicker**: `alpha` 1.0 ↔ (1.0 - amplitude) → 빠른 깜빡임, 주기 period_ms
- **float**: `y` ±amplitude(px) → 주기 period_ms (수직 부상)

**중요**: 각 레이어마다 독립적인 ticker/tween. 한 레이어의 애니메이션이 다른 레이어에 영향 없음.

### 3. 클릭 인터랙션

```
[사용자가 레이어 클릭]
  → PixiJS pointerdown 이벤트 감지 (Sprite.interactive = true)
  → click_event.animation 실행 (GSAP tween)
     ├─ 'scale_bounce': scale 1.0 → 1.4 → 1.0, duration 600ms, easeOutBounce
     ├─ 'shake': rotation ±2deg, 반복 5회, duration 600ms
     └─ 'glow': alpha 펄스, 혹은 tint 색상 변경
  → click_event.sound_id 있으면:
     └─ room-authority 채널에 sound_trigger 발행 (호스트만)
  → 다른 유저 클라이언트는 sound_trigger 이벤트로 같은 애니메이션 + 오디오 동기화
```

### 4. 호버 인터랙션

```
[사용자가 레이어 위로 마우스 이동]
  → PixiJS pointerover 이벤트 감지
  → hover_event.animation 실행 (duration_ms)
     ├─ 'sway_amplify': idle sway 진폭 2배 강화, 복귀 duration_ms 후 원래대로
     ├─ 'brightness_up': tint 증가 또는 alpha 상승
     └─ 'glow': 외곽 발광 효과
  → pointerout 이벤트: 애니메이션 복구 (원래 idle 상태로 fade-back)
```

**로컬 전용 (DataChannel 불필요)**: 호버는 각 클라이언트가 독립적으로 처리.

### 5. 씬 전환

```
[stageStore.activeScene 변화]
  → fade out 0.25s (scene_root opacity: 1 → 0)
  → 기존 스프라이트 destroy, idle ticker/tween 정리
  → 신규 layers_json 로드 및 렌더 (위의 "1. 씬 로딩" 참고)
  → fade in 0.25s (opacity: 0 → 1)
  → document.documentElement.style.setProperty('--scene-accent', scene.accent_color)
```

### 6. 포커스 인터랙션 (기존 유지)

```
[stageStore.focusedSlot 변화]
  → 해당 slot의 position을 기반으로 스포트라이트 위치 업데이트
  → 스포트라이트는 particles_overlay 내 별도 PixiJS Sprite
```

---

## PixiJS 렌더 구조

```
[SceneBackground]
  ├─ PixiJS Application (싱글턴, AvatarCanvas와 공유)
  │
  ├─ Container: scene_root (z_depth = 0, opacity fade-in/out)
  │  │
  │  ├─ Sprite: layer_0 (sky_layer, z_order=0, interactive=true)
  │  │  ├─ idle ticker: sway/pulse/flicker/float
  │  │  ├─ pointerdown → click_event.animation + sound_trigger
  │  │  └─ pointerover/out → hover_event.animation
  │  │
  │  ├─ Sprite: layer_1 (tree_back_layer, z_order=1, interactive=true)
  │  │  └─ idle ticker: sway
  │  │
  │  ├─ Sprite: layer_2 (ground_layer, z_order=3, interactive=false)
  │  │
  │  ├─ Sprite: layer_3 (fire_layer, z_order=2, interactive=true)
  │  │  ├─ idle ticker: flicker
  │  │  └─ pointerdown → scale_bounce (1.0→1.4→1.0) + 'fire_crackle' sound_trigger
  │  │
  │  └─ Sprite: layer_4 (leaves_layer, z_order=4, interactive=true)
  │     └─ pointerover → sway_amplify (2배 진폭)
  │
  └─ Container: particles_overlay (z_depth = 1, pointer-events: none)
     ├─ Sprite: spotlight (focusedSlot 위치 추적)
     └─ ParticleEmitter: ambient_particles (stars / sparks, particle_config.intensity)
```

---

## 인터랙션 이벤트 흐름

### 레이어 클릭 → 전체 동기화

```
[Client A: 불꽃 레이어 클릭]
  1. PixiJS pointerdown 감지 (sprite.on('pointerdown', ...))
  2. click_event.animation 실행
     → GSAP.to(sprite, { scale: 1.4, duration: 0.3 })
     → GSAP.to(sprite, { scale: 1.0, duration: 0.3, delay: 0.3 }, ...)
  3. 오디오 (호스트만):
     → room-authority 발행:
        {
          type: 'sound_trigger',
          payload: {
            sound_id: 'fire_crackle',
            layer_id: 'fire_layer',
            timestamp_ms: Date.now()
          }
        }
  4. 모든 클라이언트:
     → room-authority 수신: sound_trigger
     → AudioMixer.trigger('fire_crackle')
     → (이미 애니메이션은 Local 시각에서 실행됨)

[Client B, C, ...]
  → sound_trigger 이벤트 수신 → 오디오만 재생 (애니메이션은 각자 실행)
```

**중요**: 각 클라이언트가 동일한 layers_json을 보유하면, 클릭 순간 GSAP 애니메이션이 로컬에서 즉시 보이고, 오디오는 room-authority를 통해 동기화.

---

## 성능 & 제약

| 항목 | 제약 | 이유 |
|---|---|---|
| 최대 레이어 수 | 8개 | PixiJS 렌더 성능, 텍스처 메모리 |
| PNG 해상도 | ≤ 2048x2048 (레이어당) | GPU VRAM 절약 |
| Idle 애니메이션 주기 | ≥ 200ms | 부드러운 애니메이션 |
| Click 애니메이션 | ≤ 1000ms | 반응성 |
| 동시 Tween 수 | ≤ 8 (GSAP) | 충돌 방지 |

---

## 금지 사항 (MUST NOT)

- ❌ 레이어 PNG가 **불투명 배경** (solid color background) → 반드시 **alpha channel 필수**
- ❌ 레이어당 별도 PixiJS Application 생성 → **싱글턴 재사용** (AvatarCanvas와 공유)
- ❌ 인터랙션 이벤트를 DataChannel 없이 **로컬에서만 처리** → 호스트가 sound_trigger 발행하면 전체 동기화
- ❌ `scenes` 테이블 직접 Supabase 쿼리 금지 → `stageStore.activeScene` 읽기
- ❌ `layers_json` 하드코딩 금지 → 씬 메타에서 주입
- ❌ 씬 전환 중 DataChannel 없이 `layers_json` 직접 변경 금지
- ❌ 호버 애니메이션 중 idle 애니메이션 중단 금지 → 호버 종료 후 idle 복구
- ❌ 다른 유저의 클릭/호버 이벤트를 로컬에서 **차단 또는 무시** → 모든 클라이언트가 같은 애니메이션 재생

---

## 개발 체크리스트

- [ ] `SceneLayer` 타입 정의 (util/types.ts)
- [ ] `stageStore.activeScene.layers_json` 추가
- [ ] SceneBackground 컴포넌트 리팩토링 (PixiJS 레이어 렌더)
- [ ] Idle 애니메이션 (sway, pulse, flicker, float) 구현
- [ ] Click 애니메이션 (scale_bounce, shake, glow) + sound_trigger 발행
- [ ] Hover 애니메이션 (sway_amplify, brightness_up, glow)
- [ ] PNG 텍스처 로드 (Supabase Storage)
- [ ] 씬 전환 fade transition (0.5s)
- [ ] `--scene-accent` CSS 변수 주입
- [ ] 호스트 authority 확인 (sound_trigger 발행)
- [ ] 멀티 유저 동기화 테스트
- [ ] 성능 테스트 (8개 레이어, 동시 애니메이션)
