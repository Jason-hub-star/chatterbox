// 씬 매니페스트 — 세계관(World) 시스템의 SSOT. **월드 = 로그인 스플래시 + 광장 허브 + 내부 4관**을
// 한 덩어리로 묶는 최상위 단위(사용자가 고르면 전 화면이 그 세계로 이어짐). 좌표(구도)는 Composition
// 으로 아트에서 분리 — 같은 구도 리스킨(밤·업스케일)은 좌표 공유, 새 구도만 캘리브 1회.
// **새 월드 = WORLDS 1줄 + 에셋**(무한 확장). 선택·우선순위는 stores/worldStore.ts
// (effective = room ?? personal ?? DEFAULT). 에셋 교체 = 이 파일 + public/scenes/ 만.

// 허브 목적지(광장 가게 = 기능 입구) — 식별자는 기능명, 건물 은유는 주석:
// rooms=대극장 · social=찻집 · create=공방(쇼츠 제작소) · profile=의상실 ·
// practice=야외 연습 무대 · troupe=극단 회관(선점, UI 준비 중) · reserved=무간판 예비 점포.
export type HubDest = 'rooms' | 'social' | 'create' | 'profile' | 'practice' | 'troupe' | 'reserved'

export interface HubShop {
  dest: HubDest
  box: { l: number; t: number; w: number; h: number } // 블록 이미지 기준 % 좌표
  cores: { x: number; y: number }[] // 창/입구 점등 코어(box 내부 %)
}

// **가게 안전영역(SAFE AREA) — 새 구도 캘리브의 계약.** 광장은 3:2 원화를 뷰포트에 cover 하므로
// 화면비 1.8(16:9 상한)에서 위아래 8.3% 씩 잘려 나간다. 그 밖(21:9·4:3)은 `.plaza-fit` 이 contain 으로
// 물러나 잘림이 0이지만, **주력 구간 1.5~1.8 은 cover 를 유지**하는 게 프레이밍 결정이라 잘림이 남는다.
// → 모든 가게 박스는 이 사각형 안에 있어야 한다(여유 1.7%p 포함). 게이트: tests/unit/plazaSafeArea.test.ts
// 감사 2026-08-11: 이 규칙이 없어 EASTERN 이 t15~98/l0~100 으로 캘리브됐고 야외무대가 16:9 에서
// 77.6%, 21:9 에서 37% 만 보였다. 장식(plazaLamps·plazaSky)은 대상 아님 — 잘려도 정보 손실이 없다.
export const SHOP_SAFE_AREA = { l: 2, t: 10, r: 98, b: 90 } as const

// 블록 스트리트(확장 규격): 신기능 구역은 새 블록 append — 기존 블록 픽셀·좌표 불변.
export interface HubBlock {
  hero: string
  shops: HubShop[]
  lamps?: PlazaLamp[] // 가로등 상시 점등 글로우(원화 등화구 % 좌표)
  sky?: SkyBand // 하늘 구름 그늘 드리프트 밴드(원화 하늘 % 구간)
  mood?: SceneMood // 원화 무드(기본 day) — 앰비언트 CSS 프리셋 스위치
}

// 광장 가로등(원화에 그려진 등의 위치에 빛 웅덩이를 얹는 앵커) — r = 글로우 지름(컨테이너 너비 %).
export interface PlazaLamp {
  x: number
  y: number
  r: number
}

// 하늘 밴드(t=상단 %, h=높이 %) — 구름 그늘 드리프트(.hub-cloud)가 흐르는 구간. 구도 소속.
export interface SkyBand {
  t: number
  h: number
}

// 원화 무드 — 앰비언트 연출의 블렌드 방향을 정한다(밝은 하늘=multiply 그늘 / 어두운 하늘=screen 빛, 픽셀 diff 실측 원칙).
// 좌표(Composition)와 달리 **리스킨마다 다르다** → 에셋 메타로 assets 에 소속. CSS 프리셋(.hub-cloud--night 등) 스위치용.
export type SceneMood = 'day' | 'night'

// 내부 씬: anchor 는 원화 속 오브젝트에 UI 를 정박하는 % 박스("살아있는 앵커").
export interface InteriorScene {
  hero: string
  anchors: Record<string, { l: number; t: number; w: number; h: number }>
}

// ── 월드 시스템 ────────────────────────────────────────────────
export type WorldId = string // 'western' | 'eastern' | ...  (open-ended)

type Box = { l: number; t: number; w: number; h: number }

// 구도 패밀리 = % 좌표만(아트 무관). 같은 구도 리스킨끼리 공유(밤·업스케일 등).
interface Composition {
  plazaShops: HubShop[]
  plazaLamps?: PlazaLamp[] // 가로등 등화구 좌표(구도 소속 — 같은 구도 리스킨끼리 공유)
  plazaSky?: SkyBand // 하늘 밴드(구도 소속 — cloud-calib 실렌더 캘리브)
  interiorAnchors: Partial<Record<HubDest, Record<string, Box>>>
}

// 월드 = 에셋 경로 + 어느 구도 + accent. assets 일부가 없으면 resolveWorld 가 DEFAULT 월드로 표면별 폴백.
export interface World {
  id: WorldId
  label: string // i18n 키(갤러리 표시)
  accent: string // --scene-accent
  category?: string // 갤러리 필터(fantasy/oriental/…)
  locked?: string // 값이 있으면 미완/프리미엄 — 갤러리 선택 잠금('wip' 등)
  composition: Composition
  assets: {
    loginSplash?: string
    loginVideo?: string
    plaza?: string
    plazaMood?: SceneMood // 광장 원화 무드(미선언=day) — 밤/어두운 리스킨은 'night' 1줄 + CSS 프리셋 캘리브
    interiors?: Partial<Record<HubDest, string>>
    thumb: string // 갤러리 썸네일(다운스케일 ~15KB)
  }
}

// resolveWorld 반환 = 컴포넌트가 소비하는 조립 형태(월드 에셋 + 구도 좌표).
export interface ResolvedWorld {
  id: WorldId
  label: string
  accent: string
  thumb: string
  loginSplash: { hero: string; video?: string }
  plaza: { blocks: HubBlock[] }
  interiors: Partial<Record<HubDest, InteriorScene>>
}

export const DEFAULT_WORLD: WorldId = 'western'

// ── 구도(좌표) — 서양 광장/내부 실렌더 캘리브본(plaza-1 1536×1024 %). ──
const WESTERN: Composition = {
  plazaShops: [
    { dest: 'rooms', box: { l: 3.5, t: 24, w: 25, h: 48 }, cores: [{ x: 48, y: 72 }, { x: 20, y: 40 }] }, // 대극장
    { dest: 'profile', box: { l: 29, t: 37, w: 13, h: 29 }, cores: [{ x: 50, y: 52 }] }, // 의상실
    { dest: 'reserved', box: { l: 43, t: 47, w: 10, h: 17 }, cores: [{ x: 50, y: 55 }] }, // 예비 점포
    // 회관: 공방과 x 0.5%p 겹쳐 호버 우선권이 모호하던 구간 분리(w 18.5→18, 코어 절대위치 보존).
    { dest: 'troupe', box: { l: 53.5, t: 21, w: 18, h: 40 }, cores: [{ x: 51, y: 68 }] }, // 극단 회관
    { dest: 'create', box: { l: 71.5, t: 41, w: 11, h: 24 }, cores: [{ x: 45, y: 66 }] }, // 공방
    { dest: 'social', box: { l: 83.5, t: 28, w: 14.5, h: 35 }, cores: [{ x: 45, y: 58 }] }, // 찻집
    // 야외 무대: 안전영역(b≤90·r≤98)으로 축소 + 공방과 1%p 겹치던 상단을 t 64→65 로 분리.
    // 코어는 원화 절대위치 보존(구 t64 h31 y45 = 절대 77.95% → 신 t65 h25 y52).
    { dest: 'practice', box: { l: 78, t: 65, w: 20, h: 25 }, cores: [{ x: 58, y: 52 }] }, // 야외 연습 무대
  ],
  // 가로등 상시 점등(주인님 지시 2026-07-13) — 실렌더 캘리브 2회(lamp-calib 하네스)로 등화구 정착 확인.
  plazaLamps: [
    { x: 2.9, y: 31, r: 7 }, // 아치 벽 대형 랜턴(좌)
    { x: 7.7, y: 58.5, r: 6 }, // 대극장 계단 쌍등
    { x: 28.2, y: 56.8, r: 4 }, // 극장 측벽 브래킷등
    { x: 31.7, y: 57.5, r: 4 }, // 의상실 앞 랜턴
    { x: 34.3, y: 74.2, r: 6 }, // 광장 중앙 쌍팔 가로등
    { x: 55.7, y: 56.5, r: 4 }, // 본관 계단 앞 가로등
    { x: 67.4, y: 59.5, r: 5 }, // 대장간 계단 가로등
    { x: 97.7, y: 34.5, r: 6 }, // 찻집 벽 랜턴(우)
  ],
  // 하늘 구름 그늘 드리프트(주인님 승인 2026-07-13) — 상단 2~26%(대극장 돔·첨탑 위 트인 하늘, cloud-calib 실측).
  plazaSky: { t: 2, h: 24 },
  interiorAnchors: {
    rooms: { posterBoard: { l: 2.5, t: 14, w: 27, h: 33 }, ticketBooth: { l: 64, t: 16, w: 33, h: 64 } },
    create: { bench: { l: 26, t: 55, w: 46, h: 38 }, model: { l: 50, t: 22, w: 32, h: 30 } },
    social: { tableA: { l: 5, t: 70, w: 32, h: 26 }, tableB: { l: 50, t: 74, w: 26, h: 22 } },
    profile: { mirror: { l: 49, t: 27, w: 19, h: 53 } },
  },
}

// ── 동양(eastern) 구도 — eastern-plaza-1/내부 4관 원화 오버레이 캘리브(2026-07-31, 1536×1024 %).
// 서양과 박스 상호 배타(겹침 금지 — 호버 우선권 모호 방지) 규칙 동일.
const EASTERN: Composition = {
  plazaShops: [
    // 안전영역 재캘리브(2026-08-11): profile·social·practice 가 캔버스 끝(l0·r100·b98)에 붙어 있어
    // cover 에서 잘렸다. 박스만 안으로 줄이고 **코어는 원화 절대위치를 보존**해 점등 정합을 유지한다.
    { dest: 'rooms', box: { l: 15, t: 15, w: 21.5, h: 56 }, cores: [{ x: 42, y: 85 }, { x: 39, y: 39 }] }, // 대극장(쌍가면 현판, t<18 → 간판 아래로)
    { dest: 'profile', box: { l: 2, t: 42, w: 12, h: 33 }, cores: [{ x: 40.5, y: 65 }] }, // 의상실(드레스폼 창, 구 l0 w14 x49)
    { dest: 'reserved', box: { l: 36.5, t: 46, w: 13.5, h: 24 }, cores: [{ x: 48, y: 52 }] }, // 셔터 예비 점포
    { dest: 'troupe', box: { l: 51.5, t: 19, w: 20.5, h: 48 }, cores: [{ x: 50, y: 64 }] }, // 회관(대계단·현수막)
    { dest: 'create', box: { l: 72, t: 38, w: 14.5, h: 34 }, cores: [{ x: 47, y: 75 }] }, // 공방(망치모루·화덕)
    { dest: 'social', box: { l: 88.5, t: 42, w: 9.5, h: 29 }, cores: [{ x: 86, y: 52 }] }, // 다관(찻잔 현판, 구 w11.5 x71)
    { dest: 'practice', box: { l: 81, t: 72, w: 17, h: 18 }, cores: [{ x: 56, y: 66 }] }, // 야외 목조 무대(구 w19 h26 x50 y46)
  ],
  // 홍등 등화구(원화 랜턴 위치 오버레이 캘리브) — 밤 원화라 글로우가 주광원.
  plazaLamps: [
    { x: 9, y: 32, r: 7 }, // 대극장 지붕 좌 홍등 클러스터
    { x: 19.5, y: 51, r: 5 }, // 대극장 대문 홍등(좌)
    { x: 29.5, y: 51, r: 5 }, // 대극장 대문 홍등(우)
    { x: 48, y: 63.5, r: 4 }, // 예비 점포 앞 홍등
    { x: 54, y: 65, r: 4 }, // 회관 계단 석등(좌)
    { x: 62, y: 65, r: 4 }, // 회관 계단 석등(우)
    { x: 77, y: 33, r: 4 }, // 공방 위 홍등 스트링
    { x: 84, y: 70, r: 5 }, // 무대 옆 입식 홍등
    { x: 88, y: 27, r: 6 }, // 다관 기둥 상부 홍등
  ],
  plazaSky: { t: 2, h: 22 }, // 밤하늘 밴드(풍등·잉어·고래 위 트인 하늘)
  interiorAnchors: {
    rooms: { posterBoard: { l: 5, t: 19, w: 41, h: 46 }, ticketBooth: { l: 74, t: 31, w: 23, h: 48 } },
    create: { bench: { l: 25, t: 59, w: 52, h: 34 }, model: { l: 55, t: 26, w: 18, h: 31 } },
    social: { tableA: { l: 6.5, t: 68, w: 34, h: 25 }, tableB: { l: 62, t: 68, w: 30, h: 26 } },
    profile: { mirror: { l: 47, t: 8, w: 20, h: 84 } },
  },
}

// ── 월드 레지스트리 (새 월드 = 여기 1줄 + 에셋) ──
export const WORLDS: Record<WorldId, World> = {
  western: {
    id: 'western',
    label: 'world.western',
    accent: '#FFD98A',
    category: 'fantasy',
    composition: WESTERN,
    assets: {
      loginSplash: '/scenes/login-splash/splash.webp',
      loginVideo: '/scenes/login-splash/enter.webm', // 입장 영상(Seedance i2v)
      plaza: '/scenes/lobby-plaza/plaza-1.webp',
      interiors: {
        rooms: '/scenes/lobby-interiors/theater.webp',
        create: '/scenes/lobby-interiors/workshop.webp',
        social: '/scenes/lobby-interiors/teahouse.webp',
        profile: '/scenes/lobby-interiors/atelier.webp',
      },
      thumb: '/scenes/thumbs/western.webp',
    },
  },
  eastern: {
    id: 'eastern',
    label: 'world.eastern',
    accent: '#F2A65A',
    category: 'oriental',
    // 풀 배선 완료(2026-07-31): 로그인 영상·광장·내부 4관 전부 자체 에셋 — 폴백 없음.
    // (locked 필드는 향후 미완/프리미엄 월드용으로 유지 — 값 넣으면 갤러리 선택 잠금 '준비중')
    composition: EASTERN,
    assets: {
      loginSplash: '/scenes/login-splash/eastern.webp', // 한복 여인·빨간우산·범동양 야경·동양 용
      loginVideo: '/scenes/login-splash/eastern-enter.webm', // 입장 영상(Seedance i2v→Topaz 1440p)
      plaza: '/scenes/lobby-plaza/eastern-plaza-1.webp', // 밤 범동양 홍등 광장(가게 7·풍등·발광 잉어)
      plazaMood: 'night', // 어두운 원화 → .hub-cloud--night(screen) 프리셋
      interiors: {
        rooms: '/scenes/lobby-interiors/eastern-theater.webp',
        create: '/scenes/lobby-interiors/eastern-workshop.webp',
        social: '/scenes/lobby-interiors/eastern-teahouse.webp',
        profile: '/scenes/lobby-interiors/eastern-atelier.webp',
      },
      thumb: '/scenes/thumbs/eastern.webp',
    },
  },
}

// 월드 id → 컴포넌트 소비 형태. **표면별로 에셋이 없으면 DEFAULT 월드로 폴백(구도까지 함께 = 좌표 정합 보존).**
// 미지의 id 도 DEFAULT 로 폴백(stale localStorage·?world=garbage 방어).
export function resolveWorld(id: WorldId): ResolvedWorld {
  const world = WORLDS[id] ?? WORLDS[DEFAULT_WORLD]
  const fb = WORLDS[DEFAULT_WORLD]

  const splashSrc = world.assets.loginSplash ? world : fb
  const plazaSrc = world.assets.plaza ? world : fb

  const interiors: Partial<Record<HubDest, InteriorScene>> = {}
  for (const dest of Object.keys(fb.composition.interiorAnchors) as HubDest[]) {
    const src = world.assets.interiors?.[dest] ? world : fb
    const hero = src.assets.interiors?.[dest]
    const anchors = src.composition.interiorAnchors[dest]
    if (hero && anchors) interiors[dest] = { hero, anchors }
  }

  return {
    id: world.id,
    label: world.label,
    accent: world.accent,
    thumb: world.assets.thumb,
    loginSplash: {
      hero: (splashSrc.assets.loginSplash ?? fb.assets.loginSplash)!,
      video: splashSrc.assets.loginVideo, // 월드에 영상 없으면 undefined → 인트로 연출 스킵
    },
    plaza: {
      blocks: [{ hero: (plazaSrc.assets.plaza ?? fb.assets.plaza)!, shops: plazaSrc.composition.plazaShops, lamps: plazaSrc.composition.plazaLamps, sky: plazaSrc.composition.plazaSky, mood: plazaSrc.assets.plazaMood ?? 'day' }],
    },
    interiors,
  }
}
