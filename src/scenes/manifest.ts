// 씬 매니페스트(아트 피벗 Phase 4) — 페이지 배경·입장 영상·씬 액센트의 SSOT.
// 시간축 variant 는 로그인·로비가 공유(scene-prompts.md §신규 씬): 로그인만 시간을 알면
// 다음 씬과 어색해지므로 시간은 세계 전체의 축이다. 에셋 교체 = 이 파일 + public/scenes/ 만.

export type TimeVariant = 'morning' | 'night'

// 허브 목적지(로비 v2 — 가게 = 기능 입구, scene-prompts.md §로비 v2). 식별자는 기능명 —
// 건물 은유는 주석: rooms=대극장 · social=찻집 · create=공방 · profile=의상실 ·
// practice=야외 연습 무대 · troupe=극단 회관(COM-01 선점, UI 준비 중) · reserved=무간판 예비 점포.
export type HubDest = 'rooms' | 'social' | 'create' | 'profile' | 'practice' | 'troupe' | 'reserved'

export interface HubShop {
  dest: HubDest
  box: { l: number; t: number; w: number; h: number } // 블록 이미지 기준 % 좌표
  cores: { x: number; y: number }[] // 창/입구 점등 코어(box 내부 %)
}

// 블록 스트리트(확장 규격): 신기능 구역은 새 블록을 append — 기존 블록 픽셀·좌표 불변.
// 이음 = 새 블록의 좌단 석조 아치(프롬프트 필수). edits 연장은 전역 재생성 함정으로 금지.
export interface HubBlock {
  hero: string
  shops: HubShop[]
}

// 내부 씬(로비 v3 — 가게 클릭 시 풀스크린 전환, 주인님 확정 스펙). anchor 는 원화 속
// 오브젝트에 UI 를 정박하는 % 박스("살아있는 앵커" — 관당 1개 하이브리드).
export interface InteriorScene {
  hero: string
  // 관별 앵커: theater=포스터 액자 3 / workshop=작업대(폼)+현판 / teahouse=테이블 칩 자리 / atelier=거울
  anchors: Record<string, { l: number; t: number; w: number; h: number }>
}

export interface SceneVariant {
  hero: string // public/ 기준 경로
  video?: string // 입장 영상 등 (없으면 해당 연출 스킵)
  accent: string // --scene-accent 주입값 (DESIGN-DIRECTION §4.3)
  hub?: { blocks: HubBlock[] } // 로비 v2 광장 허브(데스크톱 히어로) — 없으면 정적 배경만
  interiors?: Partial<Record<HubDest, InteriorScene>> // 로비 v3 내부 4관
}

export interface Scene {
  variants: Partial<Record<TimeVariant, SceneVariant>>
}

// 06~17시 = morning / 18~05시 = night. 새 시간대(황혼·새벽)는 TimeVariant 에 슬롯만 추가.
export function pickTimeVariant(hour: number): TimeVariant {
  return hour >= 6 && hour < 18 ? 'morning' : 'night'
}

// variant 미등록이면 morning 폴백 — 밤 에셋이 아직 없어도 앱은 오전 세트로 동작(점진 등재).
export function resolveScene(scene: Scene, hour: number): SceneVariant | null {
  return scene.variants[pickTimeVariant(hour)] ?? scene.variants.morning ?? null
}

export const SCENES = {
  // 로그인/가입/리셋 스플래시. night(여주·중국풍·동양 용·유지우산)는 생성 콜 후 등재(scene-prompts.md 초안).
  loginSplash: {
    variants: {
      morning: {
        hero: '/scenes/login-splash/splash.webp',
        video: '/scenes/login-splash/enter.webm', // 입장 영상(Seedance i2v, 0번 프레임=hero — 이음새 4중 설계)
        accent: '#FFD98A',
      },
    },
  },
  // 로비 배경(입장 영상이 도착하는 판타지 상점가 — 하늘바다 고래·물고기).
  // night(랜턴·야광 어군)는 생성 콜 후 등재 — 그 전까지 밤 접속도 day 폴백.
  // hub = 로비 v2 광장(데스크톱 히어로) — 좌표는 plaza-1(1536×1024) 기준 %, 실렌더 캘리브레이션 완료본.
  lobbyStreet: {
    variants: {
      morning: {
        hero: '/scenes/lobby-street/day.webp',
        accent: '#FFD98A',
        hub: {
          blocks: [
            {
              hero: '/scenes/lobby-plaza/plaza-1.webp',
              shops: [
                { dest: 'rooms', box: { l: 3.5, t: 24, w: 25, h: 48 }, cores: [{ x: 48, y: 72 }, { x: 20, y: 40 }] }, // 대극장
                { dest: 'profile', box: { l: 29, t: 37, w: 13, h: 29 }, cores: [{ x: 50, y: 52 }] }, // 의상실
                { dest: 'reserved', box: { l: 43, t: 47, w: 10, h: 17 }, cores: [{ x: 50, y: 55 }] }, // 예비 점포
                { dest: 'troupe', box: { l: 53.5, t: 21, w: 18.5, h: 40 }, cores: [{ x: 50, y: 68 }] }, // 극단 회관
                { dest: 'create', box: { l: 71.5, t: 41, w: 11, h: 24 }, cores: [{ x: 45, y: 66 }] }, // 공방
                { dest: 'social', box: { l: 83.5, t: 28, w: 14.5, h: 35 }, cores: [{ x: 45, y: 58 }] }, // 찻집
                { dest: 'practice', box: { l: 78, t: 64, w: 21, h: 31 }, cores: [{ x: 55, y: 45 }] }, // 야외 연습 무대
              ],
            },
          ],
        },
        // 내부 4관(로비 v3) — 앵커 = 원화 속 오브젝트에 UI 정박(% 좌표, 실렌더 캘리브레이션).
        interiors: {
          rooms: {
            hero: '/scenes/lobby-interiors/theater.webp',
            anchors: {
              posterBoard: { l: 2.5, t: 14, w: 27, h: 33 }, // 좌측 금박 액자 게시판
              ticketBooth: { l: 64, t: 16, w: 33, h: 64 }, // 우측 매표소 창구
            },
          },
          create: {
            hero: '/scenes/lobby-interiors/workshop.webp',
            anchors: {
              bench: { l: 26, t: 55, w: 46, h: 38 }, // 중앙 작업대(폼 정박)
              model: { l: 50, t: 22, w: 32, h: 30 }, // 미니어처 무대(현판 실시간 반영)
            },
          },
          social: {
            hero: '/scenes/lobby-interiors/teahouse.webp',
            anchors: {
              tableA: { l: 5, t: 70, w: 32, h: 26 }, // 전경 좌 테이블
              tableB: { l: 50, t: 74, w: 26, h: 22 }, // 중앙 우 테이블
            },
          },
          profile: {
            hero: '/scenes/lobby-interiors/atelier.webp',
            anchors: {
              mirror: { l: 49, t: 27, w: 19, h: 53 }, // 중앙 대형 거울(아바타 프리뷰)
            },
          },
        },
      },
    },
  },
} satisfies Record<string, Scene>
