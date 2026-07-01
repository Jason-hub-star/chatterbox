---
tags: [spec]
---

<!--
  Haiku 공식문서 조사 → Opus 검토 완료
  Updated: 2026-06-29 · GAP-MATRIX G-03
-->

# rig JSON 포맷 스펙 — ChatterBox 2D 아바타

> **결정**: Live2D Cubism(스키마 비공개) · Spine 2D(게임 특화) 대신,
> **ChatterBox 자체 포맷**을 정의한다. Spine JSON 구조를 참고해 PNG 파츠 + ARKit 52 blendshape 직접 매핑.

---

## 1. 기존 표준 현황

| 포맷 | 라이브러리 | PixiJS 호환 | 스키마 공개 | 결정 |
|---|---|---|---|---|
| Live2D Cubism `model3.json` | pixi-live2d-display | ✓ | ❌ 비공개 | 제외 |
| Spine 2D `.json` | @pixi-spine | ✓ | ✓ | 참고만 |
| **ChatterBox rig v1** | 자체 PixiJS 렌더러 | ✓ | ✓ | **채택** |

> **pixi-live2d-display 대안**: Vtube 프로젝트의 Live2D 모델을 그대로 쓰려면 `pixi-live2d-display`를 사용할 수 있음. 단, Cubism SDK 라이선스 필요. → **G-12 확정: PNG 파츠 리그 채택.** 자세한 파이프라인은 §7 참조.

---

## 2. ChatterBox rig JSON v1 스키마

```json
{
  "version": "1.0",
  "metadata": {
    "name": "캐릭터명",
    "width": 512,
    "height": 512,
    "textureAtlas": "atlas.json"
  },

  "parts": [
    {
      "id": "body",
      "sprite": "body.png",
      "layer": 0,
      "position": { "x": 0, "y": 0 },
      "scale": { "x": 1.0, "y": 1.0 },
      "anchor": { "x": 0.5, "y": 0.5 },
      "opacity": 1.0
    },
    {
      "id": "eye_left",
      "sprite": "eye_left_open.png",
      "layer": 10,
      "position": { "x": 120, "y": 150 },
      "variants": [
        { "name": "open",   "sprite": "eye_left_open.png" },
        { "name": "closed", "sprite": "eye_left_closed.png" },
        { "name": "happy",  "sprite": "eye_left_happy.png" }
      ]
    },
    {
      "id": "mouth",
      "sprite": "mouth_neutral.png",
      "layer": 8,
      "position": { "x": 200, "y": 220 },
      "variants": [
        { "name": "neutral",   "sprite": "mouth_neutral.png" },
        { "name": "smile",     "sprite": "mouth_smile.png" },
        { "name": "open",      "sprite": "mouth_open.png" },
        { "name": "wide_open", "sprite": "mouth_wide_open.png" }
      ]
    }
  ],

  "bones": [
    { "id": "root", "parent": null,   "position": { "x": 0,   "y": 0   }, "rotation": 0 },
    { "id": "head", "parent": "root", "position": { "x": 0,   "y": 100 }, "rotation": 0 }
  ],

  "blendshape_map": {
    "eyeBlink_L": {
      "type": "part_variant",
      "part": "eye_left",
      "mapping": [
        { "range": [0.0, 0.5], "variant": "open" },
        { "range": [0.5, 1.0], "variant": "closed" }
      ]
    },
    "eyeBlink_R": {
      "type": "part_variant",
      "part": "eye_right",
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
    "mouthSmile_L": {
      "type": "lerp_rotation",
      "part": "mouth",
      "property": "rotation",
      "input_range": [0, 1],
      "output_range": [0, 15]
    },
    "headYaw": {
      "type": "lerp_transform",
      "bone": "head",
      "property": "rotation",
      "input_range": [-1, 1],
      "output_range": [-45, 45]
    },
    "headPitch": {
      "type": "lerp_transform",
      "bone": "head",
      "property": "position.y",
      "input_range": [-1, 1],
      "output_range": [-20, 20]
    },
    "browInnerUp": {
      "type": "lerp_transform",
      "part": "eyebrow_inner",
      "property": "position.y",
      "input_range": [0, 1],
      "output_range": [0, -15]
    },
    "cheekPuff": {
      "type": "lerp_scale",
      "part": "cheek",
      "property": "scale.x",
      "input_range": [0, 1],
      "output_range": [1.0, 1.3]
    }
  },

  "animations": {
    "idle": {
      "loop": true,
      "duration": 4.0,
      "keyframes": []
    }
  }
}
```

---

## 3. ARKit 52 → 파츠 매핑 전체 표

| ARKit Blendshape | 대상 파츠/본 | 매핑 타입 | 출력 범위 |
|---|---|---|---|
| `eyeBlink_L` | eye_left | part_variant | open ↔ closed |
| `eyeBlink_R` | eye_right | part_variant | open ↔ closed |
| `eyeLookUp_L/R` | eye_pupil | lerp_transform Y | 0 ~ -30px |
| `eyeLookDown_L/R` | eye_pupil | lerp_transform Y | 0 ~ +30px |
| `eyeLookIn_L`, `eyeLookOut_L` | eye_pupil | lerp_transform X | ±20px |
| `mouthOpen` | mouth | part_variant | neutral→open→wide |
| `mouthSmile_L/R` | mouth_corner | lerp_rotation | 0 ~ 20° |
| `mouthFrown_L/R` | mouth | part_variant | > 0.5 → sad |
| `jawOpen` | jaw_bone | lerp_transform Y | 0 ~ +30px |
| `jawLeft/Right` | jaw_bone | lerp_transform X | ±25px |
| `browInnerUp` | eyebrow_inner | lerp_transform Y | 0 ~ -15px |
| `browOuterUp_L/R` | eyebrow_outer | lerp_transform Y | 0 ~ -15px |
| `cheekPuff` | cheek | lerp_scale X | 1.0 ~ 1.3 |
| `tongueOut` | tongue | part_visibility | > 0.5 → show |
| `headYaw` (MediaPipe) | head bone | lerp_rotation | -45 ~ +45° |
| `headPitch` (MediaPipe) | head bone | lerp_transform Y | -20 ~ +20px |
| `headRoll` (MediaPipe) | root bone | lerp_rotation | -30 ~ +30° |

---

## 4. TypeScript 타입 정의

```typescript
// src/types/rig.ts

export type MappingType =
  | 'part_variant'
  | 'lerp_transform'
  | 'lerp_rotation'
  | 'lerp_scale'
  | 'part_visibility';

export interface RigPart {
  id: string;
  sprite: string;
  layer: number;
  position: { x: number; y: number };
  scale?: { x: number; y: number };
  anchor?: { x: number; y: number };
  opacity?: number;
  variants?: Array<{ name: string; sprite: string }>;
}

export interface RigBone {
  id: string;
  parent: string | null;
  position: { x: number; y: number };
  rotation: number;
  scale?: { x: number; y: number };
}

export interface BlendshapeMapping {
  type: MappingType;
  part?: string;
  bone?: string;
  property?: string;
  input_range?: [number, number];
  output_range?: [number, number];
  mapping?: Array<{ range: [number, number]; variant: string }>;
}

export interface RigJSON {
  version: '1.0';
  metadata: {
    name: string;
    width: number;
    height: number;
    textureAtlas?: string;
  };
  parts: RigPart[];
  bones: RigBone[];
  blendshape_map: Record<string, BlendshapeMapping>;
  animations: Record<string, {
    loop: boolean;
    duration: number;
    keyframes: unknown[];
  }>;
}
```

---

## 5. 파일 구조 (Supabase Storage)

```
models/{user_id}/{model_id}/
├── rig.json          ← 이 스펙
├── atlas.json        ← 텍스처 아틀라스 (선택)
├── parts/
│   ├── body.png
│   ├── eye_left_open.png
│   ├── eye_left_closed.png
│   ├── mouth_neutral.png
│   └── ...
└── preview.png       ← 썸네일 (ModelSelector 표시용)
```

---

## 7. Vtube 파이프라인 연동

### 7.1 G-12 결정: PNG 파츠 아바타 확정

**Live2D Cubism 제외.** ChatterBox는 **PNG 파츠 기반 rig v1만 지원**합니다.  
사용자가 직접 PNG를 업로드할 수 없으며, 모든 아바타는 **Vtube 자동 리깅 파이프라인을 거쳐야 합니다.**

### 7.2 사용자 아바타 생성 흐름

```
사용자 프롬프트 입력 (캐릭터 설명)
  ↓
ChatterBox API (UI)
  ↓
Vtube 파이프라인 호출
  ↓
Codex/fal.ai
  마스터 이미지 생성 (2048×2048)
  + 표정 시트 3종 (mouth, eyes, accent)
  ↓
See-through 자동 분해
  43개 PNG 파츠 추출 + mini_rig.json 생성
  ↓
자동 리깅 (Vtube)
  mini_rig.json → 레이어·offset 계산
  ↓
ChatterBox 변환
  mini_rig.json → rig.json (§2 스키마)
  ↓
Supabase Storage 업로드
  models/{user_id}/{model_id}/ → rig.json + parts/*
  ↓
models 테이블 INSERT
  {user_id, model_id, name, rig_url, created_at, ...}
```

### 7.3 마스터 이미지 생성 조건 (11개)

Vtube `AUTORIG-MASTER-SPEC.md` 준수. Codex 프롬프트는 이 조건을 강제합니다:

1. **정면 상반신** — 우측이나 후면 아님
2. **눈 활짝 열림** — 기본 상태가 반감기 아님
3. **입 다문 미소선 명확** — 입가 윤곽이 뚜렷함
4. **목 노출** (흉쇄유돌근 하단까지)
5. **귀 보임** (최소 한쪽)
6. **해상도 2048×2048** (최소) · RGB 또는 RGBA
7. **배경 단색 또는 제거 가능** (검정/흰색 권장)
8. **조명 균일** (한쪽에만 강한 그림자 없음)
9. **피부 톤 일관성** (얼굴과 목 색상 매칭)
10. **의류 명확한 윤곽** (가장자리 안티앨리어싱 없음)
11. **움직임 없음** (정적 포즈)

### 7.4 Vtube 파츠 → ChatterBox 매핑

Vtube 파이프라인에서 생성한 43개 PNG를 ChatterBox rig v1로 변환할 때 사용하는 부분 매핑:

| Vtube mini_rig.json | ChatterBox rig v1 | 계층 | 기본 상태 |
|---|---|---|---|
| `L_eye_white` | eye_left (variant: open) | 10 | eye_left_open.png |
| `L_iris` + `L_pupil` | eye_left (pupils sub-part) | 11 | − |
| `R_eye_white`, `R_iris`, `R_pupil` | eye_right | 10 | eye_right_open.png |
| `L_upper_lash`, `R_upper_lash` | eyelash_upper | 12 | − |
| `mouth_closed_master` | mouth (variant: neutral) | 8 | mouth_neutral.png |
| `mouth_open` | mouth (variant: open) | 8 | mouth_open.png |
| `mouth_smile` | mouth (variant: smile) | 8 | mouth_smile.png |
| `nose` | nose | 7 | nose.png |
| `hair_front_L`, `hair_front_R` | hair_front | 6 | − |
| `hair_back` | hair_back | 2 | − |
| `hair_sides` | hair_side | 3 | − |
| `accent_blush` | cheek | 9 | cheek.png |
| `body_neck` | neck | 4 | − |
| `body_torso` | body | 0 | body.png |
| `accessories_*` | accessory_* | 15+ | − |

> **See-through 분해 보장**: 마스터 조건 11개를 준수하면, See-through는 항상 동일한 파츠 리스트를 생성합니다.

### 7.5 결정론적 보장

- **파이프라인 필수 통과**: 임의 PNG 업로드 불가 → 레이어 구조 항상 일관성
- **스키마 검증**: rig.json 완성 후 TypeScript 타입 (§4) 기준 유효성 검사 필수
- **버전 고정**: ChatterBox rig v1.0 고정 → 향후 호환성 보장
- **재생성 가능**: 동일 프롬프트 → 동일 마스터 이미지 → 동일 rig (UUID 제외)

### 7.6 참조

- `Vtube/docs/ref/AUTORIG-PIPELINE-V1.md` — P0~P6 8단계 파이프라인
- `Vtube/docs/ref/AUTORIG-MASTER-SPEC.md` — 마스터 조건 SSOT
- `Vtube/docs/ref/SEE-THROUGH-PARSER.md` — PNG 분해 명세

---

## 6. 참고

- [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) — Live2D 모델 쓸 경우 대안
- [Apple ARKit BlendShapeLocation](https://developer.apple.com/documentation/arkit/arfaceanchor/blendshapelocation)
- [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) — 참고 구현체
