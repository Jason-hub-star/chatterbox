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

// 블록 스트리트(확장 규격): 신기능 구역은 새 블록 append — 기존 블록 픽셀·좌표 불변.
export interface HubBlock {
  hero: string
  shops: HubShop[]
  lamps?: PlazaLamp[] // 가로등 상시 점등 글로우(원화 등화구 % 좌표)
}

// 광장 가로등(원화에 그려진 등의 위치에 빛 웅덩이를 얹는 앵커) — r = 글로우 지름(컨테이너 너비 %).
export interface PlazaLamp {
  x: number
  y: number
  r: number
}

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
    { dest: 'troupe', box: { l: 53.5, t: 21, w: 18.5, h: 40 }, cores: [{ x: 50, y: 68 }] }, // 극단 회관
    { dest: 'create', box: { l: 71.5, t: 41, w: 11, h: 24 }, cores: [{ x: 45, y: 66 }] }, // 공방
    { dest: 'social', box: { l: 83.5, t: 28, w: 14.5, h: 35 }, cores: [{ x: 45, y: 58 }] }, // 찻집
    { dest: 'practice', box: { l: 78, t: 64, w: 21, h: 31 }, cores: [{ x: 55, y: 45 }] }, // 야외 연습 무대
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
  interiorAnchors: {
    rooms: { posterBoard: { l: 2.5, t: 14, w: 27, h: 33 }, ticketBooth: { l: 64, t: 16, w: 33, h: 64 } },
    create: { bench: { l: 26, t: 55, w: 46, h: 38 }, model: { l: 50, t: 22, w: 32, h: 30 } },
    social: { tableA: { l: 5, t: 70, w: 32, h: 26 }, tableB: { l: 50, t: 74, w: 26, h: 22 } },
    profile: { mirror: { l: 49, t: 27, w: 19, h: 53 } },
  },
}

// 동양(eastern)은 자체 구도이지만 광장/내부 아트·좌표 확정 전까지 WESTERN 을 잠정 참조.
// 현재 eastern 은 로그인 스플래시만 실존 → 광장/내부는 resolveWorld 가 서양으로 표면별 폴백.
// Step3 에서 동양 광장·내부 생성 후 이 구도를 캘리브값으로 분리한다.
const EASTERN: Composition = WESTERN

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
    // 로그인 스플래시 완성 → 갤러리에서 선택 가능. 광장·내부는 Step3까지 서양 폴백(로비 미완).
    // (locked 필드는 향후 미완/프리미엄 월드용으로 유지 — 값 넣으면 갤러리 선택 잠금 '준비중')
    composition: EASTERN,
    assets: {
      loginSplash: '/scenes/login-splash/eastern.webp', // 한복 여인·빨간우산·범동양 야경·동양 용
      // plaza·interiors 미정 → resolveWorld 가 서양으로 폴백. loginVideo defer(밤 인트로 P2).
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
      blocks: [{ hero: (plazaSrc.assets.plaza ?? fb.assets.plaza)!, shops: plazaSrc.composition.plazaShops, lamps: plazaSrc.composition.plazaLamps }],
    },
    interiors,
  }
}
