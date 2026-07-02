---
tags: [spec]
---

<!--
  Haiku 공식문서 조사 → Opus 검토 완료 (초안 2026-06-29 · G-03)
  정정 2026-07-02 (Opus): 실 렌더러(public/aria-player)·실 에셋(Storage avatars/aria/project.json)과
  대조 결과, 아래 v1 "variant-swap rig.json"은 실재하지 않는 옛 설계였음. 실제 파이프라인은
  Vtube AUTORIG의 mesh-deform `project.json`을 **다운컨버전 없이 직접 렌더**한다(경로 B).
  → 포맷 SSOT를 실제(AUTORIG project.json)로 교체. v1 variant-swap는 §9에 이력으로 보존(구현 안 됨).
-->

# rig 포맷 스펙 — ChatterBox 2D 아바타

> **SSOT(현행): Vtube AUTORIG `project.json` (mini_cubism mesh-deform rig).**
> 연속 파라미터(`ParamXxx`) → 키폼/디포머 격자 변형으로 PNG(webp) 파츠 메시를 워프한다.
> 렌더러는 `public/aria-player/src/core/{rig.js,draw_pixi.js}`(PixiJS v8)로 **이미 구현·검증됨**.
> 경로 B = 이 렌더러를 `src/lib/pixi/aria/`로 네이티브 이식해 원격 파라미터로 구동.

---

## 1. 기존 표준 현황 (배경)

| 포맷 | 라이브러리 | PixiJS 호환 | 스키마 공개 | 결정 |
|---|---|---|---|---|
| Live2D Cubism `model3.json` | pixi-live2d-display | ✓ | ❌ 비공개(SDK 라이선스) | 제외 |
| Spine 2D `.json` | @pixi-spine | ✓ | ✓ | 참고만 |
| **AUTORIG `project.json`** | ChatterBox 자체 렌더러(rig.js/draw_pixi.js) | ✓ | ✓ | **채택** |

> **G-12 결정**: Live2D Cubism SDK 라이선스 회피 + PNG 파츠 자동 리깅. Vtube AUTORIG가 마스터 이미지를
> 43~49 파츠로 분해하고 **Cubism 등가의 mesh-deform rig**(`project.json`)를 생성한다. ChatterBox는 이
> 포맷을 직접 소비한다 — Live2D 런타임도, 별도 변환 단계도 쓰지 않는다.

---

## 2. AUTORIG `project.json` 스키마 (SSOT)

`schema_version` 부여된 AUTORIG 산출물. 실 아리아 에셋 실측 기준(파츠 49 · 파라미터 25 · 물리 13):

```jsonc
{
  "schema_version": 1,
  "project_kind": "mini_cubism_rig_v0",
  "generated_at": "2026-…",        // 캐시버스트 쿼리(?v=)에 사용
  "canvas_size": [2048, 2048],     // 렌더 좌표계
  "canvas_origin": [x, y],         // (선택) 스테이지 전역 오프셋 — 얼굴 중심 보정

  "parts": [                       // 그리기 대상 레이어 (draw_order 오름차순 렌더)
    {
      "id": "hair_back_0",
      "source_path": "parts/hair_back_0.webp",   // _project_base_url 기준 상대경로 (webp)
      "bbox": [170, 1003, 342, 887],             // [x, y, w, h] 알파 크롭 영역
      "draw_order": 100,
      "deformer_node": "back_hair_warp",          // 이 파츠를 워프하는 디포머
      "opacity": 1.0,                             // (선택)
      "skin_blend": { "secondary_deformer": "...", "weights": [...] }, // (선택) 이음새 스키닝
      "skin_lbs":   { "joints": ["..."], "weights": [[...]] }          // (선택) N-관절 LBS
    }
  ],

  "meshes": [                      // 파츠별 삼각 메시 (part_id로 매칭)
    {
      "part_id": "hair_back_0",
      "vertices": [[x, y], …],     // 기준 정점 (canvas 좌표)
      "triangles": [[a, b, c], …], // 정점 인덱스 삼각형
      "uvs": [[u, v], …],          // (draw_pixi는 bbox 크롭 기준으로 재계산)
      "vertex_keyforms": [         // (선택) 정점 자체를 파라미터로 보간 (EYE-NATURAL-002)
        { "parameter_id": "ParamMouthOpenY",
          "keys": [ { "value": 0, "vertices": [[x,y],…] }, { "value": 1, "vertices": [[x,y],…] } ] },
        { "parameter_ids": ["ParamAngleX","ParamAngleY"],   // 2D 조합 키폼 (MULTI-KEYFORM-2D-001)
          "values_x": [-30,0,30], "values_y": [-30,0,30], "grid": [[ [[x,y],…], … ], …] }
      ]
    }
  ],

  "deformers": [                   // FFD 격자 워프 노드 (부모→자식 체인 누적)
    {
      "id": "Mouth", "parent_id": "Head_X", "child_ids": ["mouth_*"],
      "bounds": [x, y, w, h],      // 격자가 덮는 영역
      "lattice": { "cols": 5, "rows": 5 },
      "pivot": [px, py],           // 회전·스케일 중심
      "pin_edges": ["bottom", "left", "right"]  // 방향별 가장자리 고정 (또는 edge_pinned:true)
    }
  ],

  "parameters": [                  // 연속 구동 파라미터 (아래 §3)
    { "id": "ParamMouthOpenY", "min": 0, "max": 1, "default": 0 }
  ],

  "keyform_bindings": [            // 파라미터 → 디포머/파츠 강체 트랜스폼 키프레임
    { "parameter_id": "ParamAngleZ", "target_id": "Head_X", "key_value": 30,
      "deltas": { "translate": [dx,dy], "scale": [sx,sy], "rotate": deg, "opacity": 1 } }
  ],

  "part_opacity_keyframes": [      // 파라미터 → 파츠 불투명도 (표정 파츠 페이드)
    { "part_id": "mouth_smile", "parameter_id": "ParamMouthForm",
      "keyframes": [ { "value": 0, "opacity": 0 }, { "value": 1, "opacity": 1 } ],
      "mode": "linear" }           // 또는 "step_nearest"
  ],

  "vertex_weights": [ { "part_id": "...", "weights": [w0, w1, …] } ], // 물리 오프셋 가중
  "physics_profiles": [ … ],       // 머리카락·액세서리 흔들림 (13개; v1 정적, ponytail defer)

  "_mini_rig": {                   // 렌더 정책 오버레이 (normalizeRig 기본값과 병합)
    "render_mode": "mesh",         // "mesh"=격자변형 | (그 외)=스프라이트+강체
    "clipping": { "enabled": true,
      "pairs": { "eye_L_white": ["eye_L_iris","eye_L_pupil","eye_L_highlight"], "…": [] } },
    "eye_socket_covers": { "enabled": true, "L": { "bbox": […], "fade_start": 0.96, … }, "R": {…} },
    "keyform_overrides": [], "mesh_overrides": {}
  },

  "_project_base_url": "https://<proj>.supabase.co/storage/v1/object/public/avatars/aria/"
}
```

**변형 파이프라인(요약, ground truth = `rig.js`):**
`ParamXxx` 값 → ① `keyform_bindings` 보간으로 디포머 격자 제어점 변위(`latticeDisplaced`) → ② 정점당 격자 이중선형 보간 + 부모→자식 체인 누적(`chainDisplacementAt`) → ③ `vertex_keyforms`(정점 직접 보간)·`skin_lbs`/`skin_blend`·물리 오프셋 가산 → 최종 정점을 `MeshSimple`에 write. 불투명도는 `part_opacity_keyframes`로 별도 구동. 눈 클리핑(홍채↔흰자 마스크)·눈두덩 커버는 `_mini_rig`가 제어.

---

## 3. 트래킹 → `ParamXxx` 매핑

**Ground truth = `public/aria-player/drive.html`의 `convert(ch)`(검증된 로컬 드라이버).** 아래 표는 그 함수 실측. 경로 B는 이 로직을 `blendshapesToRigParams()`로 이식하되, **로컬 경로와 원격 경로가 입력이 다르다**:

- **로컬(웹캠)**: FaceLandmarker blendshapes + 랜드마크 기하(head pose·eye_gaze) + Pose(어깨) → 전 채널 구동.
- **원격(RT-02 220B, `blendshapeCodec.ts`)**: **52 blendshape 카테고리만** 전송된다. head pose·eye_gaze(랜드마크 기하)·어깨(Pose)는 **프레임에 없음** → 원격에선 해당 파라미터 =0/중립. (헤드포즈 전송은 ponytail Phase 2.)

| 파라미터 | 로컬 소스 (`convert`) | 범위 | 원격(RT-02) |
|---|---|---|---|
| `ParamEyeLOpen` = `ParamEyeROpen` | **양눈 링크**: `max(eyeBlinkL, eyeBlinkR)` → 적응 데드존 → 1.0 SNAP. THA4 리그 특성상 per-eye 독립 불가(뜬눈 디테일이 한 파라미터 공유) → 두 눈 **반드시 동일값** | [0.27, 1] | ✅ `eyeBlink*`로 동일 구동 |
| `ParamMouthOpenY` | `remapDeadzone(jawOpen, 0.05, 0.32)` (게인↑로 말소리도 열림) | [0, 1] | ✅ `jawOpen` |
| `ParamMouthForm` | `avg(mouthSmileL,R) − avg(mouthFrownL,R)` (미소+ / 찡그림−) | [−1, 1] | ✅ smile/frown |
| `ParamAngleX` / `Z` | headYaw / headRoll 정규화 ×30 ×**M(−1)** (셀피 수평 미러) | [−30, 30] | ❌ **원격=0** (헤드포즈 미전송) |
| `ParamAngleY` | headPitch 정규화 ×30 (미러 없음) | [−30, 30] | ❌ **원격=0** |
| `ParamEyeBallX` / `Y` | eye_gaze_x ×M / eye_gaze_y (랜드마크 기하) | [−1, 1] | △ `eyeLookIn/Out/Up/Down*` blendshape로 근사 가능(B2 결정) |
| `ParamBodyTrackX` / `Z`, `ParamBodyAngleY` | Pose 어깨 1:1(없으면 head 폴백), 스프링 평활 | 각 min/max | ❌ **원격=0/중립** (Pose 미전송) |
| `ParamBreath` | idle sine `0.5+0.5·sin(2πt)` | [0, 1] | ✅ 로컬 idle (표정 무관) |
| `ParamBrow*·Cheek·EyeSmile·EyeExpr·Gloom·Tear·Sweat·Hair*` | **현재 매핑 미구동** (수동/연출/향후) | 각 min/max | — |

> - `M = -1`: 프리뷰가 셀카 거울(scaleX -1)이라 **수평·롤 채널만** 반전해 "왼쪽으로 꺾으면 캐릭터도 왼쪽"을 맞춤(MIRROR-OFF-001). 수직(pitch)·개폐는 불변.
> - 눈 개폐는 단순 `1−blink`가 아니라 **적응 데드존 + baseline 추종**(EYE-DRIFT-TRACK-001)으로 어떤 고개각에서도 뜸 유지·깜빡임만 감김. drive.html `convert` 그대로 이식할 것 — 재도출 금지.
> - 스케일 클램프는 각 `parameters[].min/max`(`setParameterValue` 등가). 스무딩 표준은 **One-Euro Filter**(현 EMA/데드존 위에 도입 권장, `avatar-pipeline.md` §4).
> - `ParamAngleY`는 실측 구동 채널이나 aria-player 에디터 `PARAM_LABELS`에 라벨 누락(에디터 UI 한정 cosmetic, 렌더/구동 무영향).
> - **표정 계층은 별도**: `ParamMouthForm`·`ParamEyeExpr[0~6]`(6감정)·`ParamCheek`·`Gloom/Tear/Sweat`는 **UI 표정 번들(.exp3 등가, 핫키)** 로도 구동되며 트래킹과 공존한다(`avatar-pipeline.md` §3). 위 표는 *트래킹* 소스만.

---

## 4. TypeScript 타입 (project.json)

```typescript
// src/types/rig.ts — AUTORIG project.json (mesh-deform)
export interface RigVec2 { 0: number; 1: number }
export interface RigTransformDeltas {
  translate?: [number, number]; scale?: [number, number]; rotate?: number; opacity?: number;
}
export interface RigPart {
  id: string; source_path: string; bbox: [number, number, number, number];
  draw_order: number; deformer_node?: string; opacity?: number;
  skin_blend?: { secondary_deformer: string; weights: number[] };
  skin_lbs?: { joints: string[]; weights: number[][] };
}
export interface RigMesh {
  part_id: string; vertices: [number, number][]; triangles: [number, number, number][];
  uvs?: [number, number][];
  vertex_keyforms?: Array<
    | { parameter_id: string; keys: Array<{ value: number; vertices: [number, number][] }> }
    | { parameter_ids: [string, string]; values_x: number[]; values_y: number[]; grid: [number, number][][][] }
  >;
}
export interface RigDeformer {
  id: string; parent_id?: string; child_ids: string[];
  bounds: [number, number, number, number];
  lattice?: { cols: number; rows: number }; pivot?: [number, number];
  pin_edges?: Array<'top' | 'bottom' | 'left' | 'right'>; edge_pinned?: boolean;
}
export interface RigParameter { id: string; min: number; max: number; default: number }
export interface RigKeyformBinding {
  parameter_id: string; target_id: string; key_value: number; deltas?: RigTransformDeltas;
}
export interface RigOpacityKeyframe {
  part_id: string; parameter_id: string;
  keyframes: Array<{ value: number; opacity: number }>; mode?: 'linear' | 'step_nearest'; purpose?: string;
}
export interface RigProject {
  schema_version: number; project_kind: string;
  canvas_size: [number, number]; canvas_origin?: [number, number];
  parts: RigPart[]; meshes: RigMesh[]; deformers: RigDeformer[];
  parameters: RigParameter[]; keyform_bindings: RigKeyformBinding[];
  part_opacity_keyframes?: RigOpacityKeyframe[];
  vertex_weights?: Array<{ part_id: string; weights: number[] }>;
  physics_profiles?: unknown[];
  _mini_rig?: {
    render_mode?: string;
    clipping?: { enabled: boolean; pairs: Record<string, string[]> };
    eye_socket_covers?: { enabled: boolean; L?: Record<string, unknown>; R?: Record<string, unknown> };
    keyform_overrides?: RigKeyformBinding[]; mesh_overrides?: Record<string, unknown>;
  };
  _project_base_url: string;
}
```

---

## 5. 파일 구조 (Supabase Storage)

```
avatars/{character}/                 ← 현행 PoC (예: avatars/aria/)
  ├── project.json                   ← §2 스키마 (SSOT)
  └── parts/*.webp                   ← 크롭 파츠 텍스처

models/{user_id}/{model_id}/         ← 사용자 모델 (MOD-01, 향후)
  ├── project.json
  ├── parts/*.webp
  └── preview.png                    ← 썸네일 (ModelSelector)
```

- 텍스처는 크로스오리진 → `<img crossOrigin="anonymous">` + Storage CORS 필수(WebGL 업로드 조건).
- `_project_base_url`가 파츠 상대경로의 베이스. `?v={generated_at}`로 캐시버스트.
- **버킷 공개 여부**: 보안 정책은 `contracts/AvatarCanvas.md` §Supabase 접근 참조(현행 PoC는 public 버킷).

---

## 7. Vtube AUTORIG 파이프라인 연동

### 7.1 G-12 결정: AUTORIG mesh-deform 채택

**Live2D Cubism 런타임 제외.** 사용자가 임의 PNG를 직접 업로드하지 않으며, 모든 아바타는 **Vtube 자동 리깅
파이프라인(AUTORIG)** 을 거쳐 `project.json`(§2)을 생성한다. ChatterBox는 이를 **직접 렌더**한다(다운컨버전 없음).

### 7.2 사용자 아바타 생성 흐름

```
프롬프트 → ChatterBox UI → Vtube 파이프라인 호출
  → Codex/fal.ai: 마스터 2048² + 표정 시트
  → See-through 자동 분해: 43~49 PNG 파츠 + 메시/디포머/키폼 산출
  → AUTORIG: project.json 생성 (§2 스키마, mesh-deform)
  → Supabase Storage 업로드: avatars/{c}/ 또는 models/{user}/{model}/
  → models 테이블 INSERT { user_id, model_id, name, project_url, … }
```

> **옛 설계와의 차이**: 초기 초안은 "mini_rig → 단순 variant-swap rig.json 변환 후 렌더"였으나(§9),
> 실제 구현은 AUTORIG `project.json`을 **그대로 mesh-deform 렌더**한다. 스프라이트 교체 대비 연속 워프로
> 품질이 우월하고 변환 단계가 없다.

### 7.3 마스터 이미지 생성 조건 (11개)

Vtube `AUTORIG-MASTER-SPEC.md` 준수(Codex 프롬프트가 강제):
1. 정면 상반신 · 2. 눈 활짝 · 3. 입 다문 미소선 명확 · 4. 목 노출 · 5. 귀 보임(최소 한쪽) ·
6. 2048² 이상 RGB(A) · 7. 배경 단색/제거가능 · 8. 조명 균일 · 9. 피부톤 일관 · 10. 의류 윤곽 명확 · 11. 정적 포즈.

### 7.4 Vtube 파츠 → project 파츠 (설명용)

See-through 분해 산출 파츠(대략). `deformer_node`/`meshes`가 각 파츠의 워프를 결정한다:
`L/R_eye_white·iris·pupil·highlight`(눈, 클리핑 마스크) · `L/R_upper/lower_lash` · `mouth_*`(neutral/open/smile, opacity 키폼) ·
`nose` · `hair_front_*·side_*·back_*`(디포머+물리) · `cheek`(ParamCheek) · `neck·torso_base·shoulder_*·arm_*`(Body) · `accessory_*`.

### 7.5 결정론적 보장 & 렌더러 컨벤션 계약

- 파이프라인 필수 통과(임의 PNG 업로드 불가) → 파츠/디포머 구조 일관.
- `project.json` 완성 후 §4 타입 유효성 검사.
- 동일 프롬프트 → 동일 마스터 → 동일 rig(UUID 제외).

**렌더러는 아리아 전용이 아니라 AUTORIG 산출 모든 모델에 통하는 데이터 구동**이다(변형 수학에 캐릭터 상수 없음). 단 아래 **AUTORIG 이름 컨벤션에 결합**되어 있으므로, 파이프라인이 이를 모든 캐릭터에 일관 보장해야 한다(위반 시 전 모델 깨짐):
- **파트↔디포머 링크**(핵심 불변식): 각 파트는 자신을 워프하는 디포머의 `child_ids`에 등재되고, 그 디포머 id가 `part.deformer_node`와 일치해야 한다. `rig.js primaryDeformerForPart`는 `child_ids` 역참조(첫 매칭)로 primary를 고르며, 실측상 이 값이 `deformer_node`와 **49/49 일치**(2026-07-02 아리아 project.json 검증). 실제 디포머 id는 `*_warp` 명명(`root_warp`·`upper_warp`·`head_z_warp`·`head_angle_warp`·`eye_L_warp`·`eye_R_warp`·`mouth_warp`·`back_hair_warp`…)이고 `parent_id`로 root까지 체인을 이룬다. ⚠️ `primaryDeformerForPart`의 대문자 선호목록(`Eye_L`·`Mouth`·`Head_X`·`Root`)은 **현행 AUTORIG 산출과 이름이 안 맞아 사문(死文)** — 선택은 항상 `child_ids` fallback 경로로 이뤄진다(런타임·네이티브 이식 동일).
- **파츠 ID 접두어**: `eye_L_`·`eye_R_`(+`_white`/`_iris`/`_pupil`/`_highlight`/`_closed_lid`/`_blink`)·`mouth_`·`hair_front_`/`_side_`/`_back_`·body(`torso_base`·`neck`·`shoulder_L/R`·`arm_*`) (`neutralActivationParametersForPart`·`eyeOpenDetailOpacity`·clipping pairs).
- **파라미터 집합**: 표준 Cubism `ParamXxx`(§3) — AUTORIG가 매 캐릭터 방출.
- **caveat**: `normalizeRig()`의 fallback `eye_socket_covers` bbox/색상은 아리아-모양 상수(하드닝 시 `inferredEyeSocketCoverBbox`로 대체 권장). `_mini_rig`가 covers를 주면 미사용(아리아 포함) → 저위험.
- **경로 B 요구**: 렌더러/`AvatarCanvas`는 **modelId/projectUrl로 파라미터화**(아리아 URL 하드코딩 금지). PoC `AriaPocPage`만 `avatars/aria/` 고정.

### 7.6 참조
- 파이프라인 개요·표정 계층: **`specs/avatar-pipeline.md`**(증류) — 깊이는 그 문서의 원천 링크로.
- Vtube 원천(로컬 `/Users/family/jason/Vtube/docs/ref/`, 복제 금지): `AUTORIG-PIPELINE-V2.md`(현행, V1은 LEGACY) · `AUTORIG-MASTER-SPEC.md` · `SEETHROUGH-THA-FUSION-001.md`(분해) · `AUTORIG-EXPR-SET-001.md`(표정) · `AUTORIG-VOICE-ROOM-001.md`(52ch 매핑).
- 렌더러 ground truth: `public/aria-player/src/core/{rig.js,draw_pixi.js,state.js,utils.js}` · 매핑 검증본 `public/aria-player/drive.html convert()`.

---

## 8. 참고
- [Apple ARKit BlendShapeLocation](https://developer.apple.com/documentation/arkit/arfaceanchor/blendshapelocation)
- [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) — Live2D를 쓸 경우 대안(미채택)
- [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) — 참고 구현체

---

## 9. 이력 — 미구현 v1 "variant-swap rig.json" (SUPERSEDED)

> 2026-06-29 초안의 `rig.json` v1은 **PNG variant 교체 + bone lerp** 방식이었다(예: `eye_left_open.png ↔
> eye_left_closed.png`, `blendshape_map`의 이산 `part_variant`/`lerp_transform`). **렌더러도 에셋도 생성되지
> 않았고**, AUTORIG가 mesh-deform `project.json`을 직접 산출하면서 대체됨. 신규 구현·문서는 §2를 따를 것.
> variant-swap 스키마 원문이 필요하면 git 이력(이 파일 2026-07-02 이전)을 참조.
