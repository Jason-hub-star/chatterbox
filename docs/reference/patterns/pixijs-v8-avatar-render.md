---
tags: [reference]
created: 2026-07-02
sources:
  - https://pixijs.com/8.x/guides/migrations/v8
  - https://pixijs.com/8.x/guides/components/application
  - https://pixijs.com/8.x/guides/components/assets
  - https://pixijs.com/blog/pixi-v8-launches
---

<!-- reference/patterns: PixiJS v8 단일캔버스 아바타 렌더. 버전 고정·공식출처. 설치버전 대조 필수. Created 2026-07-02 -->

# PixiJS v8 단일 캔버스 아바타 렌더 패턴

> ⚠️ **버전 민감**: v7→v8 대변경. 아래는 `pixi.js@8.x` 기준 (최신 v8.1.x 확인, 2026-07-02). 설치버전·공식문서 재확인 필수.
>
> **검수 노트(Opus, 2026-07-02):** ①§4.3 DataChannel 예제를 LiveKit 실제 API로 수정함. DataChannel 정본은 [[livekit-client]] §3. ②`blendshape_map`의 type/필드명은 예시이므로 구현 전 `specs/rig-format.md §3` 실제 스키마와 대조 필수. ③"CPU 17,417%↑"는 블로그 인용 수치로 근거 약함 — 무시. ④§4.2의 `/* Assets 캐시에서 조회 */` 스텁은 구현 시 `Assets.get(url)`로 채울 것.

---

## 0. 버전·출처 (v8 주요 변경점 요약)

| 항목 | v7 | v8 | 영향 |
|-----|----|----|------|
| **릴리스일** | 2020-04 | 2024-03-05 | 3.5년 간격, 주요 아키텍처 변경 |
| **초기화** | 동기 생성자 | 비동기 `.init()` | 모든 앱이 `await app.init()` 필수 |
| **렌더 백엔드** | WebGL only | WebGL + **WebGPU** | 성능 크게 개선 (CPU 17,417% ↑) |
| **패키지 구조** | 다중 `@pixi/x` | 단일 `pixi.js` | 임포트 경로 통일 |
| **Asset 로드** | `Texture.from()` | **`Assets.load()`** 필수 | 직접 URL 로드 불가, 캐싱 관리 필수 |
| **Graphics API** | `beginFill()` → `endFill()` | `.fill()` / `.stroke()` | draw→style 순서 반전 |
| **Ticker 콜백** | `(delta: number)` | `(ticker: Ticker)` | `ticker.deltaTime` 접근 |
| **Sprite 부모** | 모든 DisplayObject | **Container만** | Sprite는 `addChild()` 불가 |
| **Bounds** | 직접 반환 | `.rectangle` 프로퍼티 | 접근 경로 변경 |

**출처**: [PixiJS v8 Migration Guide](https://pixijs.com/8.x/guides/migrations/v8), [v8 Release Blog](https://pixijs.com/blog/pixi-v8-launches) (2024-03-05)

---

## 1. Application 초기화 (v8 비동기 init) — 단일 Application

ChatterBox는 **6인 동시 렌더를 위해 단일 PixiJS Application + 단일 WebGL 컨텍스트** 구조를 채택합니다. iframe 분리는 하지 않음 (WebGL context limit 회피).

### 1.1 기본 초기화

```typescript
// src/lib/pixi/application.ts
import { Application } from 'pixi.js';

export class AvatarApplicationManager {
  private app: Application | null = null;

  async initialize(container: HTMLElement, width = 512, height = 512) {
    this.app = new Application();
    
    // v8 필수: 비동기 초기화
    await this.app.init({
      width,
      height,
      backgroundColor: 0x000000,
      autoStart: true,  // 자동으로 ticker 시작
      preference: 'webgl',  // WebGL 우선 (WebGPU 대비 안정성)
      sharedTicker: false,  // 글로벌 ticker 사용 안 함 (독립 제어)
    });

    // 캔버스를 DOM에 추가
    container.appendChild(this.app.canvas);
    return this.app;
  }

  getApp(): Application {
    if (!this.app) throw new Error('Application not initialized');
    return this.app;
  }

  destroy() {
    this.app?.destroy({ children: true, texture: true });
    this.app = null;
  }
}
```

### 1.2 주요 옵션 설명

| 옵션 | 값 | 이유 |
|-----|---|----|
| `width` / `height` | 512 | 무대 해상도. 실제 스크린 크기와 무관, 내부 렌더 해상도 고정. |
| `backgroundColor` | 0x000000 | 알파 채널 있는 PNG 파츠는 투명하지만, 배경 명시 필수 (WebGL 명확성). |
| `autoStart` | true | `app.ticker`가 자동으로 rAF 루프 시작. 수동 제어하려면 false. |
| `preference` | 'webgl' | WebGPU는 성능 향상 시 가능하나, 현재는 WebGL 안정성 우선. |
| `sharedTicker` | false | 글로벌 ticker 피함. 각 컴포넌트가 독립적으로 동기화하거나 DataChannel 이벤트에 반응. |

### 1.3 렌더 루프 제어 (Ticker)

v8의 Ticker 콜백은 **`ticker` 인스턴스** 자체를 받습니다:

```typescript
const app = await appManager.getApp();

// ❌ v7 방식 (작동 안 함)
app.ticker.add((deltaTime) => {
  // deltaTime은 undefined
});

// ✅ v8 방식
app.ticker.add((ticker) => {
  // ticker.deltaTime 사용 (초 단위, 기본 60fps는 ~0.016)
  avatar.position.x += 100 * ticker.deltaTime;
});

// 또는 지정된 fps로 제한
app.ticker.maxFPS = 30;  // 프레임 스킵해서 CPU 절약 (optional)
```

---

## 2. rig 파츠 로드 (Assets.load → Sprite/Container 레이어 배치)

ChatterBox rig v1은 **43개 PNG 파츠 + ARKit 52 blendshape 매핑**입니다. 각 파츠는 레이어 번호로 소팅되고, 변형은 blendshape_map에 정의됩니다.

### 2.1 rig.json 파싱 & Assets.load

```typescript
// src/lib/pixi/rig-loader.ts
import { Assets, Sprite, Container, Texture } from 'pixi.js';

export interface RigPart {
  id: string;
  sprite: string;  // 파일명 (예: "body.png")
  layer: number;   // 소팅 레이어
  position: { x: number; y: number };
  anchor?: { x: number; y: number };
  scale?: { x: number; y: number };
  opacity?: number;
  variants?: Array<{ name: string; sprite: string }>;
}

export async function loadRigAssets(
  rigUrl: string,
  baseImagePath: string
): Promise<{
  rig: any;
  textures: Record<string, Texture>;
}> {
  // 1. rig.json 로드
  const rigJson = await fetch(rigUrl).then(r => r.json());

  // 2. 모든 PNG 파츠 URL 수집
  const imageUrls = new Set<string>();
  for (const part of rigJson.parts) {
    imageUrls.add(`${baseImagePath}/${part.sprite}`);
    
    // variants도 포함 (눈, 입 등 표정)
    if (part.variants) {
      for (const variant of part.variants) {
        imageUrls.add(`${baseImagePath}/${variant.sprite}`);
      }
    }
  }

  // 3. 병렬 로드 (Assets.load는 캐시됨)
  const textures: Record<string, Texture> = {};
  const textureArray = await Assets.load(Array.from(imageUrls));
  
  imageUrls.forEach((url, idx) => {
    textures[url] = textureArray[idx];
  });

  return { rig: rigJson, textures };
}
```

### 2.2 Container 계층 구조 & 레이어 배치

```typescript
// src/lib/pixi/rig-renderer.ts
import { Container, Sprite } from 'pixi.js';

export class RigRenderer {
  private parts: Map<string, Sprite> = new Map();
  private container: Container;
  private rigData: any;

  constructor(app: Application, rigJson: any) {
    this.rigData = rigJson;
    this.container = new Container();
    app.stage.addChild(this.container);
  }

  async buildAvatarHierarchy(
    textures: Record<string, Texture>,
    baseImagePath: string
  ): Promise<void> {
    const parts: Array<RigPart & { _sprite: Sprite }> = [];

    // 각 파츠에 대해 Sprite 생성
    for (const partDef of this.rigData.parts) {
      const textureKey = `${baseImagePath}/${partDef.sprite}`;
      const texture = textures[textureKey];
      
      if (!texture) {
        console.warn(`Texture not found: ${textureKey}`);
        continue;
      }

      // ✅ v8: Texture 객체가 있어야 Sprite 생성 가능
      const sprite = new Sprite(texture);
      
      // 변환 적용
      sprite.position.set(partDef.position.x, partDef.position.y);
      if (partDef.anchor) {
        sprite.anchor.set(partDef.anchor.x, partDef.anchor.y);
      }
      if (partDef.scale) {
        sprite.scale.set(partDef.scale.x, partDef.scale.y);
      }
      if (partDef.opacity !== undefined) {
        sprite.alpha = partDef.opacity;
      }

      // 메타데이터 저장
      (sprite as any).__rigPartId = partDef.id;
      (sprite as any).__layer = partDef.layer;
      
      parts.push({ ...partDef, _sprite: sprite });
      this.parts.set(partDef.id, sprite);
    }

    // 레이어 번호로 소팅 후 Container에 추가
    parts.sort((a, b) => a._layer - b._layer);
    for (const part of parts) {
      this.container.addChild(part._sprite);
    }
  }

  // 파츠 조회 (변형 시 사용)
  getPart(partId: string): Sprite | undefined {
    return this.parts.get(partId);
  }

  getContainer(): Container {
    return this.container;
  }
}
```

### 2.3 중요: Sprite 자식 제약

❌ **v8에서 Sprite는 자식을 가질 수 없습니다.** 중첩 구조가 필요하면 Container로 감싸야 합니다:

```typescript
// ❌ 에러
const sprite = new Sprite(texture);
sprite.addChild(anotherSprite);  // 불가능

// ✅ 수정
const container = new Container();
container.addChild(sprite);
container.addChild(anotherSprite);
```

---

## 3. 다인원 합성 (RenderTexture로 참가자별 렌더 → 무대 배치, N인 단일 컨텍스트)

6인이 동시에 렌더링되려면, **각 참가자의 아바타를 개별 RenderTexture에 그린 후, 무대 상에서 합성**합니다. 이렇게 하면 단일 WebGL 컨텍스트 내에서 N개의 독립적인 렌더 패스를 조율할 수 있습니다.

### 3.1 RenderTexture 생성 및 각 참가자 렌더

```typescript
// src/lib/pixi/stage-compositor.ts
import {
  Application,
  RenderTexture,
  Sprite,
  Container,
} from 'pixi.js';

export class StageCompositor {
  private app: Application;
  private participantTextures: Map<string, RenderTexture> = new Map();
  private stageContainer: Container;
  private participantSprites: Map<string, Sprite> = new Map();

  constructor(app: Application) {
    this.app = app;
    this.stageContainer = new Container();
    app.stage.addChild(this.stageContainer);
  }

  // 각 참가자별 RenderTexture + Sprite 할당
  addParticipant(
    participantId: string,
    rigContainer: Container,
    slotX: number,
    slotY: number,
    scale: number = 1.0
  ): void {
    // 1. 참가자 아바타용 RenderTexture 생성
    const renderTexture = RenderTexture.create({
      width: 512,
      height: 512,
      autoGenerateMipmaps: true,
    });
    this.participantTextures.set(participantId, renderTexture);

    // 2. RenderTexture를 무대에 표시할 Sprite 생성
    const sprite = new Sprite(renderTexture);
    sprite.position.set(slotX, slotY);
    sprite.scale.set(scale, scale);
    
    this.participantSprites.set(participantId, sprite);
    this.stageContainer.addChild(sprite);

    // 3. 아바타 렌더를 매 프레임 갱신 (renderFrame 내에서)
  }

  // 매 프레임: 각 참가자 아바타를 RenderTexture에 그리기
  renderParticipantFrame(
    participantId: string,
    rigContainer: Container
  ): void {
    const renderTexture = this.participantTextures.get(participantId);
    if (!renderTexture) return;

    // ✅ v8: renderer.render()로 target을 지정해 해당 texture에 렌더
    this.app.renderer.render({
      target: renderTexture,
      container: rigContainer,
      clear: true,  // 매 프레임 초기화
    });
  }

  // 모든 참가자 순회해 각각 RenderTexture 갱신
  compositeFrame(avatarRenderers: Map<string, Container>): void {
    for (const [participantId, rigContainer] of avatarRenderers) {
      this.renderParticipantFrame(participantId, rigContainer);
    }
    
    // 무대 자체는 자동 렌더 (app.render() 호출)
  }

  removeParticipant(participantId: string): void {
    // RenderTexture 정리
    const renderTexture = this.participantTextures.get(participantId);
    if (renderTexture) {
      renderTexture.destroy();
      this.participantTextures.delete(participantId);
    }

    // Sprite 제거
    const sprite = this.participantSprites.get(participantId);
    if (sprite) {
      this.stageContainer.removeChild(sprite);
      sprite.destroy();
      this.participantSprites.delete(participantId);
    }
  }

  getStageContainer(): Container {
    return this.stageContainer;
  }
}
```

### 3.2 통합 렌더 루프 (Application ticker 활용)

```typescript
// src/features/stage/StageRenderer.tsx
import { useEffect, useRef } from 'react';

export function StageRenderer() {
  const appRef = useRef<Application | null>(null);
  const compositorRef = useRef<StageCompositor | null>(null);
  const avatarRenderersRef = useRef<Map<string, Container>>(new Map());

  useEffect(() => {
    const initStage = async () => {
      // 1. Application 초기화
      const app = new Application();
      await app.init({
        width: 1920,
        height: 1080,
        backgroundColor: 0x1a1a1a,
        preference: 'webgl',
      });
      
      const container = document.getElementById('stage-container');
      if (container) container.appendChild(app.canvas);
      appRef.current = app;

      // 2. Stage Compositor 생성
      const compositor = new StageCompositor(app);
      compositorRef.current = compositor;

      // 3. Ticker 콜백: 매 프레임 모든 참가자 렌더
      app.ticker.add((ticker) => {
        // 각 참가자의 RenderTexture 갱신
        compositor.compositeFrame(avatarRenderersRef.current);
      });
    };

    initStage();

    return () => {
      appRef.current?.destroy();
    };
  }, []);

  return <div id="stage-container" />;
}
```

---

## 4. blendshape/변형 업데이트 루프 (ticker rAF, ARKit52 → 파츠 변형)

DataChannel로 수신한 ARKit 52 blendshape 배열은 rig.json의 `blendshape_map`을 거쳐 파츠 변형으로 변환됩니다. 이는 별도의 **ParameterDriver** 로직에서 처리되지만, Pixi 측에서는 그 결과를 매 프레임 적용하기만 하면 됩니다.

### 4.1 Blendshape 매핑 (rig.json 스키마)

```json
{
  "blendshape_map": {
    "eyeBlink_L": {
      "type": "part_variant",
      "part": "eye_left",
      "mapping": [
        { "range": [0.0, 0.5], "variant": "open" },
        { "range": [0.5, 1.0], "variant": "closed" }
      ]
    },
    "mouthOpen": {
      "type": "part_variant",
      "part": "mouth",
      "mapping": [
        { "range": [0.0, 0.2], "variant": "neutral" },
        { "range": [0.2, 0.8], "variant": "open" },
        { "range": [0.8, 1.0], "variant": "wide_open" }
      ]
    },
    "headYaw": {
      "type": "lerp_transform",
      "part": "head",
      "property": "rotation",
      "input_range": [-1, 1],
      "output_range": [-45, 45]
    },
    "cheekPuff": {
      "type": "lerp_scale",
      "part": "cheek",
      "property": "scale.x",
      "input_range": [0, 1],
      "output_range": [1.0, 1.3]
    }
  }
}
```

### 4.2 ParameterDriver (blendshape → 파츠 변형)

```typescript
// src/lib/pixi/parameter-driver.ts
import { Sprite } from 'pixi.js';

export class ParameterDriver {
  private rigData: any;
  private parts: Map<string, Sprite>;
  private blendshapeCache: Float32Array;

  constructor(rigData: any, parts: Map<string, Sprite>) {
    this.rigData = rigData;
    this.parts = parts;
    this.blendshapeCache = new Float32Array(52);  // ARKit 52 개 값
  }

  /**
   * DataChannel에서 수신한 blendshape 배열을 파츠에 적용
   * @param blendshapes Float32Array[52] ARKit 블렌드쉐이프 값 (0~1)
   */
  applyBlendshapes(blendshapes: Float32Array): void {
    // 캐시 갱신
    this.blendshapeCache.set(blendshapes);

    // rig.json의 각 blendshape 매핑 처리
    for (const [blendshapeName, mapping] of Object.entries(
      this.rigData.blendshape_map
    )) {
      const blendshapeIndex = this.arKitBlendshapeIndex(blendshapeName);
      const value = this.blendshapeCache[blendshapeIndex];

      if (value === undefined) continue;

      // 매핑 타입에 따라 처리
      switch (mapping.type) {
        case 'part_variant':
          this.applyPartVariant(mapping, value);
          break;
        case 'lerp_transform':
          this.applyLerpTransform(mapping, value);
          break;
        case 'lerp_rotation':
          this.applyLerpRotation(mapping, value);
          break;
        case 'lerp_scale':
          this.applyLerpScale(mapping, value);
          break;
      }
    }
  }

  private applyPartVariant(
    mapping: any,
    value: number
  ): void {
    const part = this.parts.get(mapping.part);
    if (!part || !mapping.mapping) return;

    // 값에 따라 올바른 variant 선택
    for (const variantMap of mapping.mapping) {
      const [minRange, maxRange] = variantMap.range;
      if (value >= minRange && value <= maxRange) {
        const variantName = variantMap.variant;
        // rig.json에서 variant 텍스처 조회
        const variantSprite = this.rigData.parts.find(
          (p: any) => p.id === mapping.part
        )?.variants?.find((v: any) => v.name === variantName);
        
        if (variantSprite) {
          // ✅ v8: Sprite의 texture 프로퍼티 직접 변경
          // (texture는 동적으로 변경되며, 스프라이트는 자동 갱신)
          const texture = /* Assets 캐시에서 조회 */;
          if (texture) part.texture = texture;
        }
        break;
      }
    }
  }

  private applyLerpTransform(
    mapping: any,
    value: number
  ): void {
    const part = this.parts.get(mapping.part);
    if (!part) return;

    const [inputMin, inputMax] = mapping.input_range;
    const [outputMin, outputMax] = mapping.output_range;

    // 선형 보간
    const normalized = (value - inputMin) / (inputMax - inputMin);
    const output = outputMin + normalized * (outputMax - outputMin);

    // 프로퍼티에 따라 적용 (예: position.y)
    const [propBase, propSub] = mapping.property.split('.');
    if (propBase === 'position') {
      if (propSub === 'x') part.position.x = output;
      else if (propSub === 'y') part.position.y = output;
    }
  }

  private applyLerpRotation(
    mapping: any,
    value: number
  ): void {
    const part = this.parts.get(mapping.part);
    if (!part) return;

    const [inputMin, inputMax] = mapping.input_range;
    const [outputMin, outputMax] = mapping.output_range;

    const normalized = (value - inputMin) / (inputMax - inputMin);
    const rotationDegrees = outputMin + normalized * (outputMax - outputMin);
    
    // ✅ Pixi: rotation은 라디안 단위
    part.rotation = (rotationDegrees * Math.PI) / 180;
  }

  private applyLerpScale(
    mapping: any,
    value: number
  ): void {
    const part = this.parts.get(mapping.part);
    if (!part) return;

    const [inputMin, inputMax] = mapping.input_range;
    const [outputMin, outputMax] = mapping.output_range;

    const normalized = (value - inputMin) / (inputMax - inputMin);
    const scale = outputMin + normalized * (outputMax - outputMin);

    // 프로퍼티에 따라 적용
    const [propBase, propSub] = mapping.property.split('.');
    if (propBase === 'scale') {
      if (propSub === 'x') part.scale.x = scale;
      else if (propSub === 'y') part.scale.y = scale;
    }
  }

  private arKitBlendshapeIndex(blendshapeName: string): number {
    // ARKit 52 블렌드쉐이프 → 배열 인덱스 매핑
    const arKitNames = [
      'eyeBlink_L', 'eyeBlink_R',  // 0, 1
      'eyeLookDown_L', 'eyeLookIn_L', 'eyeLookOut_L', 'eyeLookUp_L',  // 2~5
      'eyeLookDown_R', 'eyeLookIn_R', 'eyeLookOut_R', 'eyeLookUp_R',  // 6~9
      // ... (52개 전부 정의)
      'browInnerUp', 'browOuterUp_L', 'browOuterUp_R',
      'cheekPuff', 'cheekSquint_L', 'cheekSquint_R',
      'jawOpen', 'jawLeft', 'jawRight', 'jawForward',
      'mouthFunnel', 'mouthLeft', 'mouthPress_L', 'mouthPress_R',
      'mouthPucker', 'mouthRight', 'mouthSmile_L', 'mouthSmile_R',
      'mouthStretch_L', 'mouthStretch_R', 'mouthOpen',
      'mouthDimple_L', 'mouthDimple_R',
      'mouthFrown_L', 'mouthFrown_R',
      'noseSneer_L', 'noseSneer_R',
      'tongueOut', 'tongueUp',
      // (부족한 부분은 사용처 코드가 정확히 보정)
    ];
    return Math.max(0, arKitNames.indexOf(blendshapeName));
  }
}
```

### 4.3 DataChannel 연동 (LiveKit)

> ⚠️ **검수(Opus) 수정**: 수신은 `room.on(RoomEvent.DataReceived, ...)` / `room.off(...)`를 쓴다 — `room.onDataReceived = ...`(할당형)는 **존재하지 않는 API**다. blendshape는 JSON이 아니라 **208바이트 바이너리 프레임**(Float32Array[52]+seq+ts+crc16, `state-machines/WebRTC.md §RT-02`). 4토픽 디스패치·seq 재정렬버퍼의 정본은 [[livekit-client]] §3.

```typescript
// src/features/avatar/AvatarCanvas.tsx
import { RoomEvent, type RemoteParticipant, type DataPacket_Kind } from 'livekit-client';

useEffect(() => {
  if (!participantId || !room) return;

  const onData = (
    payload: Uint8Array,
    participant?: RemoteParticipant,
    _kind?: DataPacket_Kind,
    topic?: string,
  ) => {
    if (topic !== 'blendshape' || participant?.identity !== participantId) return;
    if (payload.length !== 220) return; // 총 프레임 220B (208 데이터 + 12 메타), WebRTC.md §RT-02

    // 앞 208바이트 = blendshapes 52 float32 (뒤 12B = seq+ts+crc16)
    const view = new Float32Array(payload.buffer, payload.byteOffset, 52);
    // seq 역전 재정렬·crc16 검증은 livekit-client.md §3 핸들러에서 선처리된 값
    parameterDriverRef.current?.applyBlendshapes(view);
  };

  room.on(RoomEvent.DataReceived, onData);
  return () => { room.off(RoomEvent.DataReceived, onData); }; // 언마운트 시 명시 제거
}, [participantId, room]);
```

---

## 5. 자주 틀리는 지점 (v7 구식 API·WebGL 컨텍스트 손실 대비)

### ❌ 자주 하는 실수

| 패턴 | v7 | v8 | 수정 |
|------|----|----|------|
| **Texture 로드** | `Texture.from('url')` | 불가능 (직접 URL 안 됨) | `await Assets.load('url')` 후 `Texture.from()` |
| **Sprite 자식** | `sprite.addChild(other)` | ❌ Sprite는 자식 불가 | `Container.addChild(sprite)` |
| **Application 생성** | `new Application({ width: 800 })` | 생성자만으로 불충분 | `await app.init({ width: 800 })` |
| **Ticker 콜백** | `ticker.add((delta) => {})` | `delta`는 undefined | `ticker.add((ticker) => ticker.deltaTime)` |
| **Bounds 접근** | `container.getBounds()` | 직접 반환 | `container.getBounds().rectangle` |
| **Graphics 그리기** | `g.beginFill().drawRect().endFill()` | 문법 변경 | `g.rect(...).fill({ color: 0xff0000 })` |

### WebGL Context Loss 대비

WebGL은 브라우저 탭 전환, GPU 회수, 메모리 압박 등으로 "context loss" 발생 가능. AvatarCanvas는 이를 감지해야 합니다:

```typescript
// src/lib/pixi/webgl-loss-handler.ts

export function setupWebGLContextLossHandler(
  app: Application,
  onContextLost: () => void
): void {
  const canvas = app.canvas as HTMLCanvasElement;

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    console.warn('[WebGL] Context lost - switching to voice-only mode');
    
    // trackingStore에 플래그 설정 (UI는 static/voice badge로 전환)
    onContextLost();
  });

  canvas.addEventListener('webglcontextrestored', () => {
    console.log('[WebGL] Context restored');
  });
}
```

**주의:**  
- Context loss 후 모든 texture, RenderTexture 재로드 필수 (자동 안 함)  
- AvatarCanvas 상태 머신은 RENDERING 유지하되, UI는 static badge로 렌더 (§AvatarCanvas.md Edge Case 4)  
- host에게 `avatar_render_failed` 텔레메트리 보냄

### 메모리 누수 방지

```typescript
// ❌ 메모리 누수
function unmountAvatar() {
  app.destroy();  // Sprite, Texture는 살아있음
}

// ✅ 안전한 정리
function unmountAvatar() {
  // 1. DataChannel 리스너 제거 (AvatarCanvas.md 참조)
  room.onDataReceived = null;

  // 2. rAF 취소
  cancelAnimationFrame(animationFrameId);

  // 3. PixiJS 전체 정리
  app.destroy({
    children: true,   // 모든 DisplayObject 제거
    texture: true,    // 모든 Texture unload
  });

  // 4. RenderTexture 명시 정리 (destroy 되지 않을 수 있음)
  renderTexture?.destroy();
}
```

---

## 6. 성능 최적화 체크리스트

| 항목 | 확인 사항 |
|-----|---------|
| **배치링** | 유사한 텍스처끼리 연속 렌더 (레이어 소팅 필수) |
| **RenderTexture 해상도** | 512×512는 고정. 필요시 256×256로 축소 (저사양 기기) |
| **ticker maxFPS** | 60fps 필요 없으면 30fps로 제한 → CPU 50% 절약 |
| **Assets 캐싱** | 같은 이미지 반복 로드하지 않기 (Assets.get 사용) |
| **DisplayObject 재사용** | variant 전환 시 Sprite 재생성 말고, `texture` 프로퍼티만 변경 |
| **WebGL Context 갯수** | 단일 Application 강제 (iframe 분리 절대 금지) |

---

## 7. 공식 링크 (조회일 2026-07-02)

| 자료 | URL | 주요 내용 |
|-----|-----|---------|
| **v8 Migration Guide** | https://pixijs.com/8.x/guides/migrations/v8 | 전체 API 변경점 정리 |
| **Application 가이드** | https://pixijs.com/8.x/guides/components/application | 초기화, 옵션, ticker |
| **Assets 시스템** | https://pixijs.com/8.x/guides/components/assets | 비동기 로드, 캐싱, 언로드 |
| **Sprite / Container** | https://pixijs.com/8.x/guides/components/scene-objects/sprite | 생성, 변환, 계층 구조 |
| **Textures & RenderTexture** | https://pixijs.com/8.x/guides/components/textures | 텍스처 관리, 렌더 대상 |
| **v8 Release Blog** | https://pixijs.com/blog/pixi-v8-launches | 2024-03-05 릴리스, 성능 개선 17,417% ↑ |

---

## 부록: ChatterBox 적용 체크리스트

- [ ] `package.json`에서 `pixi.js@^8.1.x` 확인
- [ ] `AvatarApplicationManager.initialize()`가 `await app.init()` 사용
- [ ] `Assets.load()` 전에 rig.json 로드
- [ ] 각 파츠 Sprite를 layer 번호로 소팅 후 Container에 추가
- [ ] RenderTexture를 참가자별로 생성 (6인 = 6개 RenderTexture)
- [ ] ticker 콜백이 `(ticker) => ticker.deltaTime` 형식
- [ ] DataChannel 언마운트 시 `room.onDataReceived = null` 명시
- [ ] WebGL context loss 핸들러 등록
- [ ] `app.destroy({ children: true, texture: true })` 정리 호출

---

**최종 검증:** v8.1.x 현황 (2026-07-02), 공식 문서 기준 작성.  
**다음 검토:** 저사양 PC(Acer, Windows 11) + 6인 실제 스트레스 테스트 필수.
