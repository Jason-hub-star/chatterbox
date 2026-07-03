// AUTORIG 메시변형 rig(project.json ≡ Vtube character.json)의 타입.
// 스키마 SSOT: docs/specs/rig-format.md §2. 산출 계약: docs/specs/avatar-pipeline.md §2.
// 원천 구현: public/aria-player/src/core/{rig,draw_pixi,state,physics}.js (인스턴스화 이식).

export type Vec2 = [number, number]
export type BBox = [number, number, number, number] // [x, y, w, h]

export interface Deltas {
  translate?: Vec2
  scale?: Vec2
  rotate?: number
  opacity?: number
}

export interface Transform {
  translate: Vec2
  scale: Vec2
  rotate: number
  opacity: number
}

export interface Part {
  id: string
  source_path: string // 상대경로 (parts/xxx.webp) — 로더가 _project_base_url을 앞에 붙임
  bbox: BBox
  draw_order: number
  opacity?: number
  deformer_node?: string
  skin_blend?: SkinBlend
  skin_lbs?: SkinLbs
}

export interface SkinBlend {
  secondary_deformer?: string
  weights?: number[] // 정점별 primary 가중치 (<1이면 secondary 쪽으로 블렌드)
}

export interface SkinLbs {
  joints: string[] // deformer id들
  weights: number[][] // weights[vertexIndex][jointIndex], 행 합 1 (BBW)
}

// 정점 키폼: 단일(parameter_id) 또는 2D 조합(parameter_ids). rig.js keyformBaseVertices 참조.
export interface KeyformSpec {
  parameter_id?: string
  parameter_ids?: [string, string]
  keys?: { value: number; vertices: Vec2[] }[]
  grid?: Vec2[][][] // grid[iy][ix] = vertices[]
  values_x?: number[]
  values_y?: number[]
}

export interface Mesh {
  part_id: string
  vertices: Vec2[]
  triangles: number[][]
  uvs?: Vec2[]
  vertex_keyforms?: KeyformSpec | KeyformSpec[]
}

export interface Deformer {
  id: string
  parent_id?: string
  child_ids: string[]
  bounds: BBox
  pivot?: Vec2
  lattice?: { cols: number; rows: number }
  pin_edges?: string[] // ["top","bottom","left","right"] 부분집합
  edge_pinned?: boolean // 하위호환: 전 가장자리 고정
}

export interface Parameter {
  id: string
  default: number
  min: number
  max: number
}

export interface KeyformBinding {
  parameter_id: string
  target_id: string // deformer id 또는 part id
  key_value: number
  deltas?: Deltas
}

export interface OpacityKeyframe {
  part_id: string
  parameter_id: string
  mode?: 'linear' | 'step_nearest'
  purpose?: string
  keyframes: { value: number; opacity: number }[]
}

export interface PhysicsProfile {
  id: string
  model?: 'pendulum' | string
  targets?: string[] // 파트 id들 (offset을 정점 이동으로 적용)
  part_weights?: Record<string, number>
  output_parameter?: string // BODY-SWAY-001: offset을 파라미터로 출력
  input_weights?: Record<string, Vec2>
  rotate_factor?: number
  max_offset?: Vec2
  // 스프링/펜듈럼 튜닝
  stiffness?: number
  damping?: number
  damping_x?: number
  damping_y?: number
  drag?: number
  gravity?: number
  gravity_sag?: number
  length?: number
  spring?: boolean
  spring_gain?: number
}

export interface VertexWeights {
  part_id: string
  weights: number[]
}

// 눈 소켓 커버 1개 설정 (rig.js normalizeRig 기본값 참조).
export interface EyeSocketCoverConfig {
  bbox?: BBox
  fade_start?: number
  fade_full?: number
  max_opacity?: number
  hide_open_parts_at?: number
  show_open_parts_at?: number
  upper_color?: string
  mid_color?: string
  lower_color?: string
  blur?: number
  scale_x?: number
  scale_y?: number
}

// _mini_rig (별도 mini_rig.json이 project.json에 인라인됨). normalizeRig가 채움.
export interface RigConfig {
  schema_version?: number
  project_kind?: string
  render_mode?: 'mesh' | 'sprite'
  mesh_overrides?: Record<string, unknown>
  keyform_overrides?: KeyformBinding[]
  clipping?: {
    enabled?: boolean
    pairs?: Record<string, string[]> // maskPartId → [clippedPartId...]
  }
  eye_socket_covers?: {
    enabled?: boolean
    L?: EyeSocketCoverConfig
    R?: EyeSocketCoverConfig
  }
  notes?: unknown[]
}

export interface Project {
  schema_version?: number
  project_kind?: string
  generated_at?: string
  canvas_size: Vec2
  canvas_origin?: Vec2 | null
  parts: Part[]
  meshes: Mesh[]
  deformers: Deformer[]
  parameters: Parameter[]
  keyform_bindings: KeyformBinding[]
  part_opacity_keyframes?: OpacityKeyframe[]
  physics_profiles?: PhysicsProfile[]
  vertex_weights?: VertexWeights[]
  _mini_rig?: RigConfig
  _project_base_url?: string // 로더가 projectUrl에서 파생해 주입
}

export interface PhysicsItem {
  offset: Vec2
  velocity: Vec2
}

// 렌더 인스턴스가 소유하는 가변 상태. rig.js의 모듈 싱글턴 `state`를 대체 —
// 인스턴스별 ctx라 멀티 participant가 각자 파라미터/물리를 독립 보유한다.
export interface RigContext {
  project: Project | null
  images: Map<string, HTMLImageElement>
  parameters: Record<string, number>
  rig: RigConfig | null
  physics: Map<string, PhysicsItem>
}

// setParams 입력 — ParamXxx id → 값. blendshapesToRigParams(B2)의 출력 타입이기도.
export type AriaRigParams = Record<string, number>
