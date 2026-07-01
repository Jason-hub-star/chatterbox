<!--
  DESIGN-DIRECTION §5.2 참조: 씬 레이어별 재생성 가능하도록 프롬프트 원본 보관.
  
  LAYER DECOMPOSITION v2:
  - 기존: 씬 전체를 단일 JPG로 생성 → 컴포지팅 어려움, 인터랙션 불가
  - 변경: 씬을 레이어별 PNG로 분리 생성 (transparent background, alpha channel)
  - 각 레이어가 PixiJS Sprite로 독립적 인터랙션 (animation, click_event, sound)
  
  저장 절차: 
  1. img_gen API → PNG (transparent bg, alpha channel)
  2. scenes/system/{slug}/layers/{layer_id}.png (Supabase Storage)
  3. scenes_layers 테이블 INSERT (slug, layer, z_order, idle_anim, click_event)
-->

# Scene Prompts — Layer-Decomposed PNG Generation

> 각 씬을 레이어별 PNG로 생성하여 PixiJS 스프라이트로 컴포지팅한다.  
> 투명 배경(alpha channel) 필수. 스타일 가이드는 `DESIGN-DIRECTION §5.1` 참조.

## 공통 스타일 suffix (모든 레이어 프롬프트에 붙임)

```
2D painterly illustration, transparent background (PNG alpha channel required),
isolated element only, no background fill, studio ghibli + nier automata style,
high detail, clean edges for compositing, soft feathered edges to prevent white halos
```

**주의사항 (PNG 생성 시)**:
- ✓ 배경은 **완전 투명** (alpha = 0, RGB는 무관)
- ✓ Anti-aliasing 활성화 (edge 부드럽게)
- ✗ 하얀 후광(white halo) 방지 — background fill 절대 금지
- ✓ 요소 중심 중앙 정렬 (offset 최소화)

---

## 씬 1: campfire-forest
**카테고리**: fantasy | **무드**: warm | **악센트색**: #FF8C2A (warm amber)

### campfire-forest / sky (z=0)
```yaml
slug: campfire-forest
layer: sky
z_order: 0
interaction_type: [idle_anim]
idle_animation:
  type: float
  axis: y
  amplitude: 8
  period_ms: 4000
  easing: sine

prompt:
Starlit night sky with faint green aurora borealis in the distance,
soft glow at horizon, countless stars scattered, peaceful atmosphere,
transparent background (PNG alpha channel required),
2D painterly illustration, studio ghibli style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/campfire-forest/layers/sky.png`

---

### campfire-forest / tree_back (z=1)
```yaml
slug: campfire-forest
layer: tree_back
z_order: 1
interaction_type: [idle_anim]
idle_animation:
  type: sway
  axis: x
  amplitude: 4
  period_ms: 6000
  easing: sine

prompt:
Distant forest treeline silhouette, dark ancient trees fading into background haze,
multiple tree shapes creating depth, soft moonlight on canopy,
transparent background (PNG alpha channel required),
2D painterly illustration, studio ghibli style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/campfire-forest/layers/tree_back.png`

---

### campfire-forest / ground (z=2)
```yaml
slug: campfire-forest
layer: ground
z_order: 2
interaction_type: []
idle_animation: null
click_event: null

prompt:
Ancient stone circular seating arrangement on forest ground, weathered gray stones,
moss patches, scattered earth and small rocks, circular clearing in woods,
warm campfire light casting soft shadows, ground viewed from above,
transparent background (PNG alpha channel required),
2D painterly illustration, studio ghibli style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/campfire-forest/layers/ground.png`

---

### campfire-forest / tree_front (z=3)
```yaml
slug: campfire-forest
layer: tree_front
z_order: 3
interaction_type: [idle_anim]
idle_animation:
  type: sway
  axis: x
  amplitude: 6
  period_ms: 5000
  easing: sine

prompt:
Large ancient trees in foreground, twisted trunks and gnarled branches,
silhouetted against firelight, dark deep green foliage, framing composition,
textured bark with moss, dramatic near-frame elements,
transparent background (PNG alpha channel required),
2D painterly illustration, studio ghibli style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/campfire-forest/layers/tree_front.png`

---

### campfire-forest / fire (z=4)
```yaml
slug: campfire-forest
layer: fire
z_order: 4
interaction_type: [click, idle_anim]
idle_animation:
  type: flicker
  amplitude: 3
  period_ms: 800
  easing: linear
click_event:
  animation: scale_bounce
  duration_ms: 400
  scale_from: 1.0
  scale_to: 1.15
  sound_id: campfire_crackle

prompt:
Bright campfire flames only, isolated on transparent background,
warm amber and orange fire, glowing orange-red core, flickering edges,
dynamic flame shapes reaching upward, glowing embers and coal at base,
no wood, no background, flames only,
transparent background (PNG alpha channel required),
2D painterly illustration, studio ghibli style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/campfire-forest/layers/fire.png`

---

### campfire-forest / smoke (z=5)
```yaml
slug: campfire-forest
layer: smoke
z_order: 5
interaction_type: [idle_anim]
idle_animation:
  type: float
  axis: y
  amplitude: 12
  period_ms: 3000
  easing: sine

prompt:
Soft wispy smoke particles rising from campfire, pale gray-white smoke wisps,
semi-transparent, gentle curling patterns, fading upward,
light diffusion and glow effect, no concrete shapes, atmospheric only,
transparent background (PNG alpha channel required),
2D painterly illustration, studio ghibli style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/campfire-forest/layers/smoke.png`

---

## 씬 2: cyber-rooftop
**카테고리**: sci-fi | **무드**: cool | **악센트색**: #00FFCC (cyan neon)

### cyber-rooftop / sky (z=0)
```yaml
slug: cyber-rooftop
layer: sky
z_order: 0
interaction_type: [idle_anim]
idle_animation:
  type: parallax
  axis: x
  amplitude: 3
  period_ms: 8000
  easing: sine

prompt:
Neon futuristic city skyline at night in distant background, cyan and magenta lights,
tall buildings silhouetted against glowing sky, electrical grid patterns in sky,
light rain streaks visible, dark moody atmosphere with neon glow,
transparent background (PNG alpha channel required),
2D painterly illustration, nier automata style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/cyber-rooftop/layers/sky.png`

---

### cyber-rooftop / building_back (z=1)
```yaml
slug: cyber-rooftop
layer: building_back
z_order: 1
interaction_type: []
idle_animation: null
click_event: null

prompt:
Distant futuristic building structures, tall corporate skyscrapers in background,
geometric neon window patterns, dark silhouette, cyan and magenta accent lights,
architectural detail but far and dark, no center focus,
transparent background (PNG alpha channel required),
2D painterly illustration, nier automata style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/cyber-rooftop/layers/building_back.png`

---

### cyber-rooftop / rain (z=2)
```yaml
slug: cyber-rooftop
layer: rain
z_order: 2
interaction_type: [idle_anim]
idle_animation:
  type: scroll_down
  speed: 40
  period_ms: 2000
  easing: linear

prompt:
Rain streaks and droplets falling diagonally, wet reflective effect,
light gray rain pattern, fine streaks with varying opacity,
light rainfall intensity (not heavy), atmospheric perspective,
transparent background (PNG alpha channel required),
2D painterly illustration, nier automata style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/cyber-rooftop/layers/rain.png`

---

### cyber-rooftop / stage_floor (z=3)
```yaml
slug: cyber-rooftop
layer: stage_floor
z_order: 3
interaction_type: []
idle_animation: null
click_event: null

prompt:
Modern rooftop stage floor with geometric patterns, metallic surface,
holographic projector pedestals positioned at stage corners,
wet reflective surface from rain, neon cyan accent line at stage edge,
viewed slightly from above, precise architectural lines,
transparent background (PNG alpha channel required),
2D painterly illustration, nier automata style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/cyber-rooftop/layers/stage_floor.png`

---

### cyber-rooftop / neon_signs (z=4)
```yaml
slug: cyber-rooftop
layer: neon_signs
z_order: 4
interaction_type: [click, idle_anim]
idle_animation:
  type: flicker
  amplitude: 2
  period_ms: 600
  easing: linear
click_event:
  animation: glow_pulse
  duration_ms: 500
  glow_intensity_from: 1.0
  glow_intensity_to: 2.0
  sound_id: neon_spark

prompt:
Bright neon signs and glowing text elements floating in rooftop space,
cyan and magenta neon tube lights, futuristic kanji and symbols,
sharp bright glow around letters, flickering effect, isolated signs,
no background, signs only, electric glow halos,
transparent background (PNG alpha channel required),
2D painterly illustration, nier automata style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/cyber-rooftop/layers/neon_signs.png`

---

### cyber-rooftop / hologram (z=5)
```yaml
slug: cyber-rooftop
layer: hologram
z_order: 5
interaction_type: [click]
idle_animation: null
click_event:
  animation: scale_bounce
  duration_ms: 400
  scale_from: 1.0
  scale_to: 1.2
  sound_id: hologram_activate

prompt:
Holographic projection display above stage, cyan glowing geometric shapes,
floating particle grid, digital wireframe patterns, volumetric light effect,
semi-transparent hologram with bright cyan core, digital artifact aesthetic,
no background, hologram projection only,
transparent background (PNG alpha channel required),
2D painterly illustration, nier automata style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/cyber-rooftop/layers/hologram.png`

---

## 씬 3: fantasy-stage
**카테고리**: fantasy | **무드**: dark | **악센트색**: #C084FC (purple)

### fantasy-stage / arch_back (z=0)
```yaml
slug: fantasy-stage
layer: arch_back
z_order: 0
interaction_type: []
idle_animation: null
click_event: null

prompt:
Gothic stone arches in background, ancient royal theater interior,
ornate carvings on stone, large archway frames receding into depth,
dark gray-brown stone, atmospheric shadows, architectural detail,
single or double arch visible, framing composition,
transparent background (PNG alpha channel required),
2D painterly illustration, studio ghibli style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/fantasy-stage/layers/arch_back.png`

---

### fantasy-stage / curtain (z=1)
```yaml
slug: fantasy-stage
layer: curtain
z_order: 1
interaction_type: [idle_anim]
idle_animation:
  type: sway
  axis: x
  amplitude: 5
  period_ms: 4000
  easing: sine

prompt:
Luxurious red velvet curtains on stage, rich crimson fabric with deep folds,
theatrical heavy drapes, soft draping texture, subtle shimmer on fabric,
stage left and right curtain edges visible, ornate top valance with gold trim,
elegant fabric movement, fabric only (no background),
transparent background (PNG alpha channel required),
2D painterly illustration, studio ghibli style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/fantasy-stage/layers/curtain.png`

---

### fantasy-stage / candles (z=2)
```yaml
slug: fantasy-stage
layer: candles
z_order: 2
interaction_type: [click, idle_anim]
idle_animation:
  type: flicker
  amplitude: 2
  period_ms: 1000
  easing: linear
click_event:
  animation: glow_pulse
  duration_ms: 500
  glow_intensity_from: 1.0
  glow_intensity_to: 2.5
  sound_id: candle_light

prompt:
Row of lit candles along stage edge, warm golden-orange flame,
multiple candle flames (5-7 visible), glowing warm light, wax candles visible below flames,
candlelight glow radiating outward, theatrical candle holders,
candles and flames only, no background,
transparent background (PNG alpha channel required),
2D painterly illustration, studio ghibli style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/fantasy-stage/layers/candles.png`

---

### fantasy-stage / floor (z=3)
```yaml
slug: fantasy-stage
layer: floor
z_order: 3
interaction_type: []
idle_animation: null
click_event: null

prompt:
Ancient royal theater stage floor, ornate marble or stone surface,
geometric pattern inlays, weathered texture, theater flooring viewed from above at slight angle,
red carpet runner down center (optional), dark ambient shadows,
floor details only, no actors or props,
transparent background (PNG alpha channel required),
2D painterly illustration, studio ghibli style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/fantasy-stage/layers/floor.png`

---

### fantasy-stage / chandelier (z=4)
```yaml
slug: fantasy-stage
layer: chandelier
z_order: 4
interaction_type: [click]
idle_animation: null
click_event:
  animation: scale_bounce
  duration_ms: 600
  scale_from: 1.0
  scale_to: 1.25
  sound_id: crystal_chime

prompt:
Ornate purple crystal chandelier hanging from above, large decorative piece,
purple and violet crystalline elements, bright warm golden light glowing within,
crystal prisms reflecting light, sparkle effect on crystal surfaces,
elaborate metalwork frame (gold or bronze), chandelier centered in frame,
no background, chandelier only,
transparent background (PNG alpha channel required),
2D painterly illustration, studio ghibli style, high detail,
clean edges for compositing, soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/fantasy-stage/layers/chandelier.png`

---

## 레이어 생성 순서 및 가이드

**권장 생성 순서** (하위 레이어부터 생성 권장 — 의존성 순서):

### campfire-forest
1. `ground` (z=2) — 정적, 기준점 설정
2. `tree_back` (z=1) — 배경 레이어
3. `sky` (z=0) — 가장 뒤
4. `smoke` (z=5) — 투명도 레이어
5. `fire` (z=4) — 인터랙티브, 핵심
6. `tree_front` (z=3) — 프레이밍

### cyber-rooftop
1. `stage_floor` (z=3) — 기준점
2. `building_back` (z=1) — 배경
3. `sky` (z=0) — 가장 뒤
4. `rain` (z=2) — 애니메이션 레이어
5. `neon_signs` (z=4) — 인터랙티브
6. `hologram` (z=5) — 최상단 인터랙티브

### fantasy-stage
1. `floor` (z=3) — 기준점
2. `arch_back` (z=0) — 배경
3. `curtain` (z=1) — 배경 요소
4. `candles` (z=2) — 인터랙티브
5. `chandelier` (z=4) — 최상단 인터랙티브

---

## PNG 투명 배경 생성 시 주의사항

**하얀 후광(White Halo) 방지**:
- ✗ 배경을 흰색(#FFFFFF)으로 채우고 제거하는 방식 → 반투명 edge에 하얀 흔적 남음
- ✓ **처음부터 투명 배경으로 생성** — 프롬프트에 `transparent background` 명시
- ✓ **Anti-aliasing 활성화** — 부드러운 edge 자동 생성

**Edge Quality**:
- ✓ Soft feathering 권장 (hard-edge보다 compositing 자연스러움)
- ✓ 요소 주변에 작은 여백 남기기 (offset 1-2px, z-depth 왜곡 방지)

**Alpha Channel**:
- ✓ PNG 8-bit 이상 (24-bit RGB + 8-bit Alpha 권장)
- ✓ Premultiplied alpha 대신 **straight alpha** 사용
- ✗ JPEG 절대 금지 (alpha channel 미지원)

---

## 추가 씬 생성 가이드

새 씬 추가 시:

1. **구조 설계**: 씬을 3~6개 레이어로 분해 (배경→중경→전경, z-order 명확)
2. **이 파일에 추가**: 각 레이어별 블록 생성 (위 템플릿 따름)
3. **이미지 생성**: img_gen API로 PNG 생성 (transparent bg)
4. **Supabase 업로드**: `scenes/system/{slug}/layers/{layer_id}.png` 경로
5. **DB INSERT**: `scenes_layers` 테이블에 메타데이터 입력
   - `scene_slug`, `layer_id`, `z_order`, `interaction_type`, `idle_animation`, `click_event` 등

---

**최종 확인 체크리스트**:
- [ ] PNG alpha channel 생성 확인
- [ ] 프롬프트에 "transparent background" 명시
- [ ] z-order 순서 검증 (낮을수록 뒤)
- [ ] 모든 레이어가 Storage 경로에 업로드됨
- [ ] scenes_layers 테이블 메타데이터 입력 완료
- [ ] PixiJS 스프라이트 로드 테스트 (흰 후광 없음)
