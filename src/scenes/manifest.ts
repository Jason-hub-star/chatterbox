// 씬 매니페스트(아트 피벗 Phase 4) — 페이지 배경·입장 영상·씬 액센트의 SSOT.
// 시간축 variant 는 로그인·로비가 공유(scene-prompts.md §신규 씬): 로그인만 시간을 알면
// 다음 씬과 어색해지므로 시간은 세계 전체의 축이다. 에셋 교체 = 이 파일 + public/scenes/ 만.

export type TimeVariant = 'morning' | 'night'

export interface SceneVariant {
  hero: string // public/ 기준 경로
  video?: string // 입장 영상 등 (없으면 해당 연출 스킵)
  accent: string // --scene-accent 주입값 (DESIGN-DIRECTION §4.3)
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
      morning: { hero: '/scenes/login-splash/splash.webp', accent: '#FFD98A' },
    },
  },
  // 로비 배경(입장 영상이 도착하는 판타지 상점가 — 하늘바다 고래·물고기). 생성 콜 후 등재.
  lobbyStreet: {
    variants: {},
  },
} satisfies Record<string, Scene>
