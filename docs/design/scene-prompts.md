<!--
  DESIGN-DIRECTION §5.2 참조: 씬 레이어별 재생성 가능하도록 프롬프트 원본 보관.

  LAYER DECOMPOSITION v2:
  - 기존: 씬 전체를 단일 JPG로 생성 → 컴포지팅 어려움, 인터랙션 불가
  - 변경: 씬을 레이어별 PNG로 분리 생성 (transparent background, alpha channel)
  - 각 레이어가 PixiJS Sprite로 독립적 인터랙션 (animation, click_event, sound)

  2026-07-07 라인업 개편: cyber-rooftop·fantasy-stage 폐기(프롬프트는 git 히스토리 보존),
  신규 4종 등재 — landing-meadow(랜딩 히어로 겸용)·ocean-cove·pirate-ship·twilight-castle.
  톤 앵커: 승인된 무드샷 chatterbox_landing_concept.png (gpt-image-2, 지브리풍 몽환).

  저장 절차:
  1. img_gen API → PNG (z≥1 은 background:"transparent" 파라미터 강제, z0 배경은 불투명 풀블리드)
  2. scenes/system/{slug}/layers/{layer_id}.png (Supabase Storage)
  3. scenes.layers_json 갱신 — DATA-SCHEMA §1.7 확정: 단일 scenes 테이블의 SceneLayer[] JSONB
     (transform·idle_animation·click_event 포함, 타입은 contracts/SceneBackground.md)
-->

# Scene Prompts — Layer-Decomposed PNG Generation

> 각 씬을 레이어별 PNG로 생성하여 PixiJS 스프라이트로 컴포지팅한다.
> **z≥1 레이어는 투명 배경(alpha channel) 필수, z0 배경 레이어만 불투명 풀블리드.**
> 스타일 가이드는 `DESIGN-DIRECTION §5.1` 참조.

## STYLE ANCHOR v2 (2026-07-08 아트 피벗 — 신카이풍 시네마틱, 이후 신규 생성의 기본)

> 주인님 레퍼런스 5장(`~/Documents/채터박스/reference/`) 기준: 초채도·HDR 블룸·역광·초현실(하늘=바다·고래)·세계를 바라보는 뒷모습.
> **모든 생성 프롬프트는 실행 전 주인님 콜 필수(절대 게이트).**

```
cinematic semi-realistic anime film illustration, ultra-saturated colors,
HDR bloom and volumetric light rays, dramatic backlighting,
surreal dreamlike atmosphere, rich painterly detail,
deep contrast between warm gold and deep blue, inspired by Makoto Shinkai films
```

### 신규 씬 (페이지 재배정 2026-07-08 — 플랜 virtual-leaping-hedgehog)

**시간축 variant(2026-07-08 확정):** 로그인·로비는 접속 시각 기준 variant 를 공유한다(`pickTimeVariant`: 06~17시=`morning` / 18~05시=`night`) — 로그인만 시간을 알면 다음 씬과 어색해지므로 **시간은 세계 전체의 축**. 오전 세트부터 개발(주인님 결정), 밤 세트는 이미지만 선행.

**시간축 = 문화축(2026-07-08 주인님 확정):** **오전 = 서양 판타지**(석조·목골 상점가·연철 가로등·스트링 라이트, 간판은 글자 없는 문양 — 한자·종이랜턴 금지) / **밤 = 중국풍**(홍등·처마·현판·동양 용). 동물은 양쪽 다 고래·물고기(용은 밤 로그인 전용).

**화풍 고정 기법(2026-07-08 확립 — 파이프라인 규칙):** 신규 씬은 **`images/edits`에 `login_splash.png` 원본을 입력 이미지로 물리고** "exact same painting style/palette/lighting … a different scene from the same world" 프롬프트로 생성한다 — edits 의 "전역 재생성" 함정(매팅엔 독)을 화풍 복제에 역이용. lobby-street-day v1(한자 간판·문화축 위반, generations 단독)은 이 기법의 v2 로 교체됨. 이후 밤 세트·룸 씬도 동일 기법.

| slug | 페이지 | variant | 상태 |
|---|---|---|---|
| `login-splash` | 로그인/가입/리셋 (LoL식 우측 스플래시 + 입장 영상 원판) | morning | 생성·적용 완료(2026-07-08) + **입장 영상 완료**: Seedance 2.0 fast i2v(0번 프레임=원본·5.0s·720p·무음·주인님 토큰 미로테이트 승인) → **Topaz 업스케일 2x+48fps 보간**(fal `fal-ai/topaz/upscale/video`, 5s×$0.08≈$0.40, 112s) → 2560×1440·48fps → VP9 crf45 WebM **2.33MB** `enter.webm`(720p 원본·1440p mp4는 `~/Documents/채터박스/v2/` 보관). 훅=로그인 성공 1회(localStorage)·클릭/Esc 스킵·reduced-motion 생략·로드실패 즉시 내비·프리로드·'인트로 다시 보기'. E2E 11/11 + 1440p 실재생 확인 |
| `login-splash` (eastern) | **동양(eastern) 월드 로그인** — 묶은머리 여인 뒷모습, **한복(韓服) 차림**(중국 한푸 아님·주인님 정정), 빨간 유지우산(비단·분홍 꽃·새 문양), 특정 국가 무표기 범동양 야경(처마·기와·홍등, 한·일·중 블렌드), 밤하늘 발광 동양 용, 하늘바다 물고기·보름달. 청보라+금 랜턴. | eastern | **생성·적용 완료(2026-07-09)** — gpt-image-2 → fal ESRGAN 2x → `login-splash/eastern.webp`(3072×2048·757KB). 시간축 아님, **월드축**([[WORLD-SYSTEM.md]]). 구 "중국풍" 초안은 한복·범동양으로 대체 |
| `lobby-street-day` | 로비 — 입장 영상이 도착하는 **서양 판타지** 상점가(아이레벨·무인물·문양 간판·고래/어군) | morning | **v2 생성·적용 완료(2026-07-08)** — edits+splash 레퍼런스(화풍 고정)·WebP 555KB `public/scenes/lobby-street/day.webp`·실렌더 확인. v1(한자 간판)은 폐기 |
| `lobby-street-night` | 〃 같은 거리의 밤(랜턴·야광 고래/물고기) | night | 초안 등재·생성 대기(콜 게이트) |
| `theater-stage` | 방 무대 배경 — **무대 전용 대극장**(객석 최전열 시점 빈 무대·풋라이트·성좌 배경막). stageBackgrounds 'theater' 가 로비 매표소 원화를 재사용하던 "무대 전용 아트는 후속" 부채(F-8) 해소용 | western | **후보 생성(2026-07-13)** — 화풍고정 edits, gpt-image-2 세이프티 오탐 400→gpt-image-1 폴백 66s. 계보 `~/Documents/채터박스/v2/theater_stage_v1.png` + webp 후보 `public/scenes/room-stage/theater-stage.webp`(미커밋) — **채택 취향 판정 대기**(채택 시 stageBackgrounds 항목 교체) |
| `world-panorama` | ~~인앱 랜딩~~ → **인앱 랜딩 폐지**(마케팅은 외부 snack-web 담당). 생성본은 snack-web 랜딩 히어로 이관 후보(`~/Documents/채터박스/v2/world_panorama.png`) | — | 생성 완료·미사용 |
| ~~`lobby-lantern-night`~~ | → `lobby-street-*` 로 대체(입장 영상 도착 지점과 서사 연속) | — | 폐기 |

> 앱 진입 = 게임 런처식: `/` 는 세션 기반 리다이렉트(로그인↔로비), 첫 화면은 LoL식 로그인.
> **로비 v2 = 광장 허브 맵(2026-07-08 주인님 채택 — PoC 검수 5회전)**: 가게 = **방이 아니라 기능 목적지**(방은 가게보다 적거나 많아 매핑 불성립 — 주인님 판정). 랜드마크 6+예비 1: 대극장(방 목록·관전·예약 매표소)·찻집(최근 함께한·재초대, 후일 친구)·공방(방 만들기)·의상실(아바타·설정, 후일 프로필)·야외 연습 무대(연습방)·**극단 회관(COM-01 길드 — 그림만 선점, UI '준비 중')**·무간판 셔터 점포(미래 기능 예비). 전용 생성 원화 `lobby_plaza_hub_v1.png`(화풍 고정 edits, 프롬프트는 계보 보관본 참조).
> **블록 스트리트 확장 규격**: 로비 맵은 가로 팬 스트립의 블록 배열(`manifest hub.blocks`) — 신기능 구역은 **새 블록을 별도 생성해 오른쪽에 append**(기존 블록 픽셀·핫스팟 좌표 불변). 이음 = **새 블록의 좌단 석조 아치**가 경계 담당(신규 블록 프롬프트에 "left edge framed by a stone archway" 필수). edits 로 기존 그림 연장은 전역 재생성 함정으로 금지.
> **유도 3단(PoC 확정)**: ①입장 웨이브 1회(reduced-motion 생략) ②휴지 숨쉬기 글로우(~34%) ③호버 강점등+주변 포커스 딤(`--dim` 0→0.30, 상시 그레이드 금지 — 원화 보존). 함정 2: blend 레이어는 씬 레벨 형제(버튼 안이면 스티커화)·off 상태는 `animation:none`(flicker 가 opacity 덮음).
> 구 로비 v1(배경+스크림, day.webp)은 모바일 배경으로 유지. 거리-맵 인터랙션 P2 항목은 이 v2 로 승급 구현(UX-GAPS §3).
> **로비 v3(2026-07-08 주인님 확정 — 레거시 걷어내기)**: 광장이 로비 화면의 전부(뷰포트 채움), 레거시 섹션은 **내부 4관으로 전가·삭제**: `/lobby/theater`(방 목록·검색·예약 매표소) · `/lobby/workshop`(생성 — 현판 실시간 반영) · `/lobby/teahouse`(최근 함께한 — 테이블 칩→매표소 예약 연계) · `/lobby/atelier`(아바타·언어 — 거울 프리뷰, `/settings` 리다이렉트). 내부 원화 4장 = 화풍 고정 병렬 생성(`{theater,workshop,teahouse,atelier}_interior_v1`). **호버 = A+B**(컬러 스포트라이트+카메라 푸시 — 연구소 6모드 검수 채택, 글로우 폐기), 클릭 = 푸시 심화→내부 크로스페이드. **기본 UI 즉시 오픈 원칙**(진입 후 추가 클릭 0 — 공방 autofocus), **살아있는 앵커 관당 1**(액자 포스터·현판·테이블 칩·거울 — "그림이 상태를 안다"). 내부는 aspect 3/2 무대 프레임(앵커 % 정합)·모바일은 배너+세로 폴백. 밤 확장 = variant 등재만(interiors 부분 등재 시 morning 폴백 — useInterior). 다음: 앰비언트 페이즈(고래 매팅+PixiJS 메시 유영·구름 드리프트 — 승인됨, 본 공사 후).
> **로비는 영상 루프 금지 판정**: i2v 클립은 루프 이음새 점프컷 + 체류 화면 상시재생 비용 — 정적 원화 + 앰비언트 레이어(부품 모션·GlowMotes)로.

#### 생성 대기 프롬프트 초안 (실행 전 원문 재확인 → 콜)

- **login-splash night**: `A lone young woman seen from behind, her long black hair tied back in a ponytail, standing at the same high vantage point at night, a red silk oil-paper umbrella with painted blossoms resting against her shoulder, gazing out over a vast Chinese-fantasy city glowing with countless red lanterns, a colossal luminous eastern dragon with a long serpentine body swimming slowly through the starry night sky among moonlit clouds, deep blue-violet palette with warm red-gold lantern light` + ANCHOR v2
- **lobby-street-day v2(서양 판타지 — 재생성 대기)**: `A western European fantasy shopping street in warm morning light, seen at eye level down the street, no people, cobblestone road, timber-framed and stone storefronts with round glass windows, wooden signboards with simple painted symbols and no letters, flower boxes and market stalls with striped awnings, wrought-iron street lamps and hanging string lights, ivy on the walls, the sky above is a luminous ocean — whales and schools of small fish swimming among sunlit clouds, god rays falling between buildings, gold-and-deep-blue palette` + ANCHOR v2
- **lobby-street-night v2(중국풍 — 밤 세트)**: `A Chinese-fantasy street at night, no people, glowing red and gold paper lanterns lining wooden shophouses with upturned eaves and hanging banners, the sky-ocean above dark and starry with faintly bioluminescent whales and small fish drifting slowly, warm shop light spilling onto the stone road, deep blue-violet palette with red-gold lantern accents` + ANCHOR v2

아래 v1(지브리 수채) suffix·씬들은 **룸 씬 스타일 교체 전까지의 기존 자산 기록**으로 유지.

## 공통 스타일 suffix v1 (기존 — 모든 레이어 프롬프트에 붙임)

```
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
(z>=1 레이어만) transparent background (PNG alpha channel required), isolated element only, no background fill
```

**주의사항 (PNG 생성 시)**:
- ✓ z≥1 배경은 **완전 투명** (alpha = 0) — 프롬프트 명시 + API `background:"transparent"` 파라미터 이중 강제
- ✓ Anti-aliasing 활성화 (edge 부드럽게)
- ✗ 하얀 후광(white halo) 방지 — background fill 절대 금지
- ✓ 요소 중심 중앙 정렬 (offset 최소화)

---

## 씬 1: campfire-forest (유지 — 생성은 후순위)
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

## 씬 2: landing-meadow (신규 — 랜딩 히어로 겸 룸 씬)
**카테고리**: fantasy | **무드**: dreamy | **악센트색**: #FFD98A (soft gold)
**톤 앵커**: `chatterbox_landing_concept.png` (승인 무드샷) — 언덕 위 초원에서 먼 판타지 세상 조망.
빛 입자·민들레 씨앗은 PNG가 아니라 코드 파티클(`_shared/glow_dust.png` 재사용).

### landing-meadow / sky (z=0) — 불투명 풀블리드
```yaml
slug: landing-meadow
layer: sky
z_order: 0
interaction_type: [idle_anim]
idle_animation:
  type: float
  axis: x
  amplitude: 6
  period_ms: 9000
  easing: sine

prompt:
Vast dreamy golden-hour sky, luminous soft cumulus clouds tinted peach and violet,
gentle god rays streaming from upper left, wide open airy composition,
upper two-thirds is sky, soft gradient from warm gold horizon to clear blue zenith,
full-bleed opaque backdrop, no ground elements,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail
```

**Storage**: `scenes/system/landing-meadow/layers/sky.png`

---

### landing-meadow / floating_islands (z=1)
```yaml
slug: landing-meadow
layer: floating_islands
z_order: 1
interaction_type: [click, idle_anim]
idle_animation:
  type: float
  axis: y
  amplitude: 10
  period_ms: 7000
  easing: sine
click_event:
  animation: scale_bounce
  duration_ms: 500
  scale_from: 1.0
  scale_to: 1.08
  sound_id: wind_chime

prompt:
Two or three small floating islands drifting in the sky, lush greenery and tiny trees on top,
exposed rocky underside with hanging vines, soft golden light catching their edges,
varied sizes creating depth, islands only, nothing else,
transparent background (PNG alpha channel required), isolated elements only, no background fill,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/landing-meadow/layers/floating_islands.png`

---

### landing-meadow / city_far (z=2)
```yaml
slug: landing-meadow
layer: city_far
z_order: 2
interaction_type: []
idle_animation: null
click_event: null

prompt:
Distant luminous fantasy castle city on a valley floor, slender white spires catching golden light,
winding river with small bridges, patchwork fields and a lake around the city,
layered blue-violet mountains behind fading into pastel haze, atmospheric perspective,
occupies lower-middle band of frame, empty transparent sky above,
transparent background (PNG alpha channel required), no background fill above the horizon,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/landing-meadow/layers/city_far.png`

---

### landing-meadow / mist (z=3)
```yaml
slug: landing-meadow
layer: mist
z_order: 3
interaction_type: [idle_anim]
idle_animation:
  type: float
  axis: x
  amplitude: 14
  period_ms: 11000
  easing: sine

prompt:
Soft horizontal bands of pastel morning mist and low clouds, semi-transparent white-gold wisps,
gentle curling haze drifting sideways, atmospheric only, no concrete shapes,
transparent background (PNG alpha channel required), isolated mist only, no background fill,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/landing-meadow/layers/mist.png`

---

### landing-meadow / meadow_fore (z=4) — 기준점
```yaml
slug: landing-meadow
layer: meadow_fore
z_order: 4
interaction_type: []
idle_animation: null
click_event: null

prompt:
Lush green hilltop meadow in the foreground, rolling emerald grass with scattered wildflowers
in white, yellow and lavender, a few dandelion puffs, a narrow winding stone footpath
leading from bottom center down over the hill crest, viewed from the hilltop,
occupies bottom third of frame only, empty transparent area above the hill crest,
transparent background (PNG alpha channel required), no background fill above the grass line,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/landing-meadow/layers/meadow_fore.png`

---

## 씬 3: ocean-cove (신규 — 바다맵)
**카테고리**: fantasy | **무드**: serene | **악센트색**: #7FD8FF (sea glass blue)

### ocean-cove / sky (z=0) — 불투명 풀블리드
```yaml
slug: ocean-cove
layer: sky
z_order: 0
interaction_type: [idle_anim]
idle_animation:
  type: float
  axis: x
  amplitude: 5
  period_ms: 10000
  easing: sine

prompt:
Serene pastel dawn sky over the sea, soft pink and pale blue gradient,
scattered feathery clouds glowing at their edges, a few distant seabirds as tiny silhouettes,
calm dreamy atmosphere, full-bleed opaque backdrop, no water or ground,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail
```

**Storage**: `scenes/system/ocean-cove/layers/sky.png`

---

### ocean-cove / sea_far (z=1)
```yaml
slug: ocean-cove
layer: sea_far
z_order: 1
interaction_type: [idle_anim]
idle_animation:
  type: flicker
  amplitude: 1
  period_ms: 2400
  easing: sine

prompt:
Calm distant sea stretching to the horizon, turquoise to deep blue gradient,
soft sparkling light glints on the water surface, one or two tiny sailboats and
a small rocky island with a lighthouse far away, horizontal band across middle of frame,
empty transparent sky above the horizon line,
transparent background (PNG alpha channel required), no background fill above the horizon,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/ocean-cove/layers/sea_far.png`

---

### ocean-cove / waves_mid (z=2)
```yaml
slug: ocean-cove
layer: waves_mid
z_order: 2
interaction_type: [idle_anim]
idle_animation:
  type: sway
  axis: x
  amplitude: 8
  period_ms: 5000
  easing: sine

prompt:
Gentle rolling waves approaching the shore, translucent turquoise water with soft white foam
crests, painterly wave shapes in a horizontal band, semi-transparent sea spray,
waves only, nothing above or below,
transparent background (PNG alpha channel required), isolated waves only, no background fill,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/ocean-cove/layers/waves_mid.png`

---

### ocean-cove / beach_fore (z=3) — 기준점
```yaml
slug: ocean-cove
layer: beach_fore
z_order: 3
interaction_type: []
idle_animation: null
click_event: null

prompt:
Soft sandy beach foreground with lace-like tide foam edge, pale golden sand,
scattered seashells and starfish, a piece of driftwood, gentle wet-sand reflections,
occupies bottom third of frame only, empty transparent area above the sand line,
transparent background (PNG alpha channel required), no background fill above the sand,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/ocean-cove/layers/beach_fore.png`

---

### ocean-cove / bottle_glow (z=4)
```yaml
slug: ocean-cove
layer: bottle_glow
z_order: 4
interaction_type: [click, idle_anim]
idle_animation:
  type: flicker
  amplitude: 2
  period_ms: 1600
  easing: sine
click_event:
  animation: scale_bounce
  duration_ms: 400
  scale_from: 1.0
  scale_to: 1.15
  sound_id: glass_chime

prompt:
A single corked glass message bottle resting on sand, softly glowing warm light from
a rolled letter inside, tiny sparkles around the glass, gentle magical aura,
bottle only, nothing else,
transparent background (PNG alpha channel required), isolated element only, no background fill,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/ocean-cove/layers/bottle_glow.png`

---

## 씬 4: pirate-ship (신규 — 해적맵)
**카테고리**: fantasy | **무드**: adventurous | **악센트색**: #FFB347 (lantern amber)

### pirate-ship / sky (z=0) — 불투명 풀블리드
```yaml
slug: pirate-ship
layer: sky
z_order: 0
interaction_type: [idle_anim]
idle_animation:
  type: float
  axis: x
  amplitude: 6
  period_ms: 9000
  easing: sine

prompt:
Adventurous late-afternoon sky over the open sea, dramatic golden clouds with warm
amber light, a few gulls gliding as small silhouettes, hint of a rising moon,
spirited hopeful mood, full-bleed opaque backdrop, no sea or ship,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail
```

**Storage**: `scenes/system/pirate-ship/layers/sky.png`

---

### pirate-ship / sea (z=1)
```yaml
slug: pirate-ship
layer: sea
z_order: 1
interaction_type: [idle_anim]
idle_animation:
  type: sway
  axis: x
  amplitude: 6
  period_ms: 6000
  easing: sine

prompt:
Open sea with gentle swells viewed from a ship, deep teal water with golden light
reflections, two or three distant islands with palm silhouettes on the horizon,
horizontal band across middle of frame, empty transparent sky above the horizon,
transparent background (PNG alpha channel required), no background fill above the horizon,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/pirate-ship/layers/sea.png`

---

### pirate-ship / ship_deck (z=2) — 기준점
```yaml
slug: pirate-ship
layer: ship_deck
z_order: 2
interaction_type: []
idle_animation: null
click_event: null

prompt:
Wooden pirate ship deck foreground viewed from onboard, weathered warm brown planks,
carved railing at the bow, coiled ropes, a wooden ship wheel at one side,
base of the main mast rising out of frame, barrels and a small treasure chest as props,
occupies bottom third of frame, empty transparent area above the railing,
transparent background (PNG alpha channel required), no background fill above the deck,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/pirate-ship/layers/ship_deck.png`

---

### pirate-ship / sails_flag (z=3)
```yaml
slug: pirate-ship
layer: sails_flag
z_order: 3
interaction_type: [click, idle_anim]
idle_animation:
  type: sway
  axis: x
  amplitude: 5
  period_ms: 4500
  easing: sine
click_event:
  animation: shake
  duration_ms: 500
  sound_id: flag_flap

prompt:
View from the ship deck looking up at the sails: large billowing cream-white sails
seen from below, wooden masts and yard arms crossing the upper frame, taut rigging ropes,
a small friendly jolly roger flag waving at the mast top, warm golden light through the fabric,
strictly no hull, no ship body, no deck, no sea, sails masts rigging and flag only,
transparent background (PNG alpha channel required), isolated elements only, no background fill,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
```

> v1(측면 전신 선박 — 선체 포함돼 1인칭 갑판과 충돌)은 폐기, v2(갑판에서 올려다본 시점)로 재생성 완료(2026-07-07).

**Storage**: `scenes/system/pirate-ship/layers/sails_flag.png`

---

### pirate-ship / lantern (z=4)
```yaml
slug: pirate-ship
layer: lantern
z_order: 4
interaction_type: [click, idle_anim]
idle_animation:
  type: flicker
  amplitude: 2
  period_ms: 900
  easing: linear
click_event:
  animation: glow_pulse
  duration_ms: 500
  glow_intensity_from: 1.0
  glow_intensity_to: 2.2
  sound_id: wood_creak

prompt:
A single hanging ship lantern with warm amber candlelight inside, black iron and
brass frame, soft glowing halo, gently swinging on a short rope,
lantern only, nothing else,
transparent background (PNG alpha channel required), isolated element only, no background fill,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/pirate-ship/layers/lantern.png`

---

## 씬 5: twilight-castle (신규 — 황혼의 성, 룸 컨셉샷 무드)
**카테고리**: fantasy | **무드**: dusk-dream | **악센트색**: #C084FC (purple)
**톤 앵커**: `chatterbox_room_concept.png` 중앙 씬(황혼의 성) — 몽환 버전으로 톤 통일.

### twilight-castle / sky_dusk (z=0) — 불투명 풀블리드
```yaml
slug: twilight-castle
layer: sky_dusk
z_order: 0
interaction_type: [idle_anim]
idle_animation:
  type: float
  axis: x
  amplitude: 5
  period_ms: 10000
  easing: sine

prompt:
Dramatic dreamy dusk sky, glowing amber-orange horizon melting into violet and
deep indigo above, layered luminous sunset clouds, first faint stars appearing,
serene epic atmosphere, full-bleed opaque backdrop, no ground elements,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail
```

**Storage**: `scenes/system/twilight-castle/layers/sky_dusk.png`

---

### twilight-castle / castle_far (z=1)
```yaml
slug: twilight-castle
layer: castle_far
z_order: 1
interaction_type: [click]
idle_animation: null
click_event:
  animation: glow_pulse
  duration_ms: 700
  glow_intensity_from: 1.0
  glow_intensity_to: 1.8
  sound_id: distant_bell

prompt:
Majestic fantasy castle city on a distant hill, countless slender spires and towers
backlit by the sunset, dark silhouette edges rimmed with golden light,
tiny warm window lights beginning to glow, occupies lower-middle band of frame,
empty transparent sky above the tallest spire,
transparent background (PNG alpha channel required), no background fill above the skyline,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/twilight-castle/layers/castle_far.png`

---

### twilight-castle / mist (z=2)
```yaml
slug: twilight-castle
layer: mist
z_order: 2
interaction_type: [idle_anim]
idle_animation:
  type: float
  axis: x
  amplitude: 12
  period_ms: 12000
  easing: sine

prompt:
Low valley mist at the foot of a castle hill, soft violet-gray haze bands with warm
amber light bleeding through, semi-transparent drifting wisps, atmospheric only,
transparent background (PNG alpha channel required), isolated mist only, no background fill,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/twilight-castle/layers/mist.png`

---

### twilight-castle / cliff_fore (z=3) — 기준점
```yaml
slug: twilight-castle
layer: cliff_fore
z_order: 3
interaction_type: []
idle_animation: null
click_event: null

prompt:
Rocky cliff edge foreground overlooking a valley, dark weathered stone with
tufts of grass and small purple wildflowers catching the last sunset light,
dramatic framing along the bottom and lower corners of frame only,
empty transparent area above the cliff line,
transparent background (PNG alpha channel required), no background fill above the rocks,
Studio Ghibli inspired 2D painterly illustration, soft feathered brushwork,
dreamy luminous palette, high detail, clean edges for compositing,
soft feathered edges to prevent white halos
```

**Storage**: `scenes/system/twilight-castle/layers/cliff_fore.png`

---

## 공용 FX: _shared / glow_dust
빛 입자·반딧불·민들레 홀씨·별먼지 파티클의 단일 텍스처. PixiJS 파티클 이미터가 전 씬에서 재사용.

```yaml
slug: _shared
layer: glow_dust
z_order: 99 (파티클 이미터 전용 — 씬 레이어 아님)
interaction_type: []

prompt:
A single soft glowing orb of warm golden-white light, gentle radial falloff to
fully transparent edges, tiny sparkle core, dreamy bokeh particle,
one orb only, centered,
transparent background (PNG alpha channel required), isolated element only, no background fill
```

**Storage**: `scenes/system/_shared/glow_dust.png` | **크기**: 512×512 (파티클용 소형)

---

## 레이어 생성 순서 및 가이드

**권장 생성 순서** (기준점 → 배경 → 인터랙티브):

### landing-meadow
1. `meadow_fore` (z=4) — 기준점 · 2. `sky` (z=0) · 3. `city_far` (z=2) · 4. `mist` (z=3) · 5. `floating_islands` (z=1, 인터랙티브)

### ocean-cove
1. `beach_fore` (z=3) — 기준점 · 2. `sky` (z=0) · 3. `sea_far` (z=1) · 4. `waves_mid` (z=2) · 5. `bottle_glow` (z=4, 인터랙티브)

### pirate-ship
1. `ship_deck` (z=2) — 기준점 · 2. `sky` (z=0) · 3. `sea` (z=1) · 4. `sails_flag` (z=3, 인터랙티브) · 5. `lantern` (z=4, 인터랙티브)

### twilight-castle
1. `cliff_fore` (z=3) — 기준점 · 2. `sky_dusk` (z=0) · 3. `castle_far` (z=1, 인터랙티브) · 4. `mist` (z=2)

### campfire-forest (후순위)
1. `ground` (z=2) · 2. `tree_back` (z=1) · 3. `sky` (z=0) · 4. `smoke` (z=5) · 5. `fire` (z=4) · 6. `tree_front` (z=3)

**크기 규약**: 풀프레임 밴드 레이어 1536×1024 · 요소 레이어(floating_islands·bottle_glow·sails_flag·lantern) 1024×1024 · glow_dust 512×512(실생성 1024). 4K 금지(모바일 GPU 텍스처 한계·메모리).
**전달 포맷**: 원본 PNG 보관, 서빙은 WebP q85 변환 — 실측(landing-meadow 5장): PNG 11.7MB → WebP 1.5MB(87% 절감, 알파 보존, PixiJS 로드 호환).

**생성·검증 실측 (2026-07-07)**: 4씬 19레이어 + glow_dust = 20장 생성 완료(투명은 gpt-image-1 `background:"transparent"`, 불투명 하늘은 gpt-image-2). 알파 실픽셀 검사 전원 통과(z≥1 투명 32~89%, z0 0%), 체커보드 몽타주 + **씬별 실합성 프리뷰 합격**. layers_json 초기 배치값(1536×1024 기준, `(scaleX,scaleY)@(x,y)`, 프리뷰 실측):
- landing-meadow: islands `0.40@(1060,30)` · city_far `1.0@(0,0)` · mist `0.9@(80,410)·opacity0.92` · meadow_fore `1.0@(0,360)` — mist는 실렌더 튜닝값(원경 도시 가림 방지)
- ⚠️ **랜딩 페이지는 레이어판이 아니라 승인 무드샷 원본 1장을 그대로 사용**(`public/scenes/landing-meadow/hero.webp` 433KB, 주인님 결정 2026-07-07 — 레이어 재생성본은 원본과 다른 컷이라 충실도 우선). 위 레이어·배치값은 **룸 SceneBackground(클릭 인터랙션)용**.
- ocean-cove: waves_mid `(1.15,0.5)@(-110,380)` · beach_fore `1.0@(0,60)` · bottle_glow `0.26@(1150,660)`
- pirate-ship: sails_flag `0.85@(180,-60)` · ship_deck `1.0@(0,0)` · lantern `0.15@(835,130)`
- twilight-castle: castle_far `1.3@(-230,-140)` · mist `1.0@(0,160)` · cliff_fore `1.0@(0,0)`

---

## PNG 투명 배경 생성 시 주의사항

**하얀 후광(White Halo) 방지**:
- ✗ 배경을 흰색(#FFFFFF)으로 채우고 제거하는 방식 → 반투명 edge에 하얀 흔적 남음
- ✓ **처음부터 투명 배경으로 생성** — 프롬프트 명시 + API `background:"transparent"` 파라미터
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
3. **이미지 생성**: img_gen API로 PNG 생성 (z≥1 transparent bg)
4. **Supabase 업로드**: `scenes/system/{slug}/layers/{layer_id}.png` 경로
5. **DB 갱신**: `scenes.layers_json`(DATA-SCHEMA §1.7)에 SceneLayer 요소 추가
   - `id`, `z_order`, `transform`, `interaction_type`, `idle_animation`, `click_event` 등

---

**최종 확인 체크리스트**:
- [ ] z≥1 레이어 PNG alpha channel 생성 확인 (실픽셀 검사)
- [ ] 프롬프트 + API 파라미터 양쪽에 transparent 명시
- [ ] z-order 순서 검증 (낮을수록 뒤)
- [ ] 모든 레이어가 Storage 경로에 업로드됨
- [ ] scenes.layers_json 메타데이터 입력 완료
- [ ] PixiJS 스프라이트 로드 테스트 (흰 후광 없음)
