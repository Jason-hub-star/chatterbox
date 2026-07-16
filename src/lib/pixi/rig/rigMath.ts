// rig 변형 수학 — SNACK 플레이어 src/core/{rig,physics,pendulum}.js의 인스턴스화 이식.
//
// 원천은 모듈 싱글턴 `state`에 결합돼 아바타 1개만 가능했다. 여기서는 createRigMath(ctx)
// 팩토리가 ctx(파라미터/rig/물리/프로젝트)와 프레임 캐시를 클로저로 캡슐화 → participant N명이
// 각자 인스턴스를 가진다. **변형 수학은 무수정** — `state.` 참조만 `ctx.`로 치환하고,
// 에디터 전용 사문(assembly showreel·explode)은 제거했다(항상 항등이라 출력 불변, docs/specs/rig-format.md §7.5).
//
// 물리(스프링/펜듈럼)는 rig.js와 physics.js가 상호 import(순환)했다 — 여기서는 한 팩토리에
// 합쳐 ctx를 공유하고 pendulum 적분기를 인라인해 순환을 제거한다.

import type {
  Deformer,
  Deltas,
  KeyformSpec,
  Mesh,
  Part,
  PhysicsProfile,
  Project,
  RigConfig,
  Transform,
  Vec2,
} from './types'
import { clamp, groupBy, lerp } from './util'

// ---- 순수(ctx 무관) ----

export function identityTransform(): Transform {
  return { translate: [0, 0], scale: [1, 1], rotate: 0, opacity: 1 }
}

function identityDeltas(): Required<Deltas> {
  return { translate: [0, 0], scale: [1, 1], rotate: 0, opacity: 1 }
}

function transformFromDeltas(deltas: Deltas): Transform {
  return {
    translate: [deltas.translate?.[0] || 0, deltas.translate?.[1] || 0],
    scale: [deltas.scale?.[0] ?? 1, deltas.scale?.[1] ?? 1],
    rotate: deltas.rotate || 0,
    opacity: deltas.opacity ?? 1,
  }
}

function interpolateTransform(a: Transform, b: Transform, t: number): Transform {
  return {
    translate: [lerp(a.translate[0], b.translate[0], t), lerp(a.translate[1], b.translate[1], t)],
    scale: [lerp(a.scale[0], b.scale[0], t), lerp(a.scale[1], b.scale[1], t)],
    rotate: lerp(a.rotate, b.rotate, t),
    opacity: lerp(a.opacity, b.opacity, t),
  }
}

function mergeTransform(a: Transform, b: Transform): Transform {
  return {
    translate: [a.translate[0] + b.translate[0], a.translate[1] + b.translate[1]],
    scale: [a.scale[0] * b.scale[0], a.scale[1] * b.scale[1]],
    rotate: a.rotate + b.rotate,
    opacity: a.opacity * b.opacity,
  }
}

function sampleTransformKeyframes(
  keyframes: { key_value: number; deltas: Deltas }[],
  value: number,
): Transform {
  if (!keyframes.length) return identityTransform()
  if (value <= keyframes[0].key_value) return transformFromDeltas(keyframes[0].deltas)
  if (value >= keyframes[keyframes.length - 1].key_value) {
    return transformFromDeltas(keyframes[keyframes.length - 1].deltas)
  }
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const lower = keyframes[index]
    const upper = keyframes[index + 1]
    if (value >= lower.key_value && value <= upper.key_value) {
      const span = upper.key_value - lower.key_value || 1
      const t = clamp((value - lower.key_value) / span, 0, 1)
      return interpolateTransform(transformFromDeltas(lower.deltas), transformFromDeltas(upper.deltas), t)
    }
  }
  return identityTransform()
}

function sampleOpacityKeyframes(
  keyframes: { value: number; opacity: number }[],
  value: number,
  mode: string,
): number {
  if (!keyframes.length) return 1
  const sorted = [...keyframes].sort((a, b) => a.value - b.value)
  if (mode === 'step_nearest') {
    return sorted.reduce((best, item) => {
      const bestDistance = Math.abs(best.value - value)
      const itemDistance = Math.abs(item.value - value)
      return itemDistance < bestDistance ? item : best
    }, sorted[0]).opacity
  }
  if (value <= sorted[0].value) return sorted[0].opacity
  if (value >= sorted[sorted.length - 1].value) return sorted[sorted.length - 1].opacity
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const lower = sorted[index]
    const upper = sorted[index + 1]
    if (value >= lower.value && value <= upper.value) {
      const span = upper.value - lower.value || 1
      return lerp(lower.opacity, upper.opacity, clamp((value - lower.value) / span, 0, 1))
    }
  }
  return 1
}

function interpKeyformSpec(spec: KeyformSpec, value: number): Vec2[] | null {
  if (!spec?.keys?.length) return null
  const keys = [...spec.keys].sort((a, b) => a.value - b.value)
  if (value <= keys[0].value) return keys[0].vertices
  if (value >= keys[keys.length - 1].value) return keys[keys.length - 1].vertices
  for (let k = 0; k < keys.length - 1; k += 1) {
    if (value >= keys[k].value && value <= keys[k + 1].value) {
      const span = keys[k + 1].value - keys[k].value || 1
      const t = clamp((value - keys[k].value) / span, 0, 1)
      return keys[k].vertices.map(([ax, ay], i) => {
        const [bx, by] = keys[k + 1].vertices[i]
        return [lerp(ax, bx, t), lerp(ay, by, t)] as Vec2
      })
    }
  }
  return null
}

type Affine2D = [number, number, number, number, number, number]

function interpAffineSpec(spec: KeyformSpec, value: number): Affine2D | null {
  const keys = [...(spec.keys || [])].filter((key) => key.affine).sort((a, b) => a.value - b.value)
  if (!keys.length) return null
  if (value <= keys[0].value) return keys[0].affine!
  if (value >= keys[keys.length - 1].value) return keys[keys.length - 1].affine!
  for (let index = 0; index < keys.length - 1; index += 1) {
    const lower = keys[index]
    const upper = keys[index + 1]
    if (value < lower.value || value > upper.value) continue
    const t = clamp((value - lower.value) / (upper.value - lower.value || 1), 0, 1)
    return lower.affine!.map((item, i) => lerp(item, upper.affine![i], t)) as Affine2D
  }
  return null
}

function relativeAffine(current: Affine2D, neutral: Affine2D): Affine2D | null {
  const [a, b, tx, c, d, ty] = neutral
  const det = a * d - b * c
  if (Math.abs(det) < 1e-8) return null
  const inverse: Affine2D = [d / det, -b / det, (b * ty - d * tx) / det,
    -c / det, a / det, (c * tx - a * ty) / det]
  const [e, f, ux, g, h, uy] = current
  return [
    e * inverse[0] + f * inverse[3], e * inverse[1] + f * inverse[4], e * inverse[2] + f * inverse[5] + ux,
    g * inverse[0] + h * inverse[3], g * inverse[1] + h * inverse[4], g * inverse[2] + h * inverse[5] + uy,
  ]
}

function applyAffine(vertices: Vec2[], matrix: Affine2D): Vec2[] {
  const [a, b, tx, c, d, ty] = matrix
  return vertices.map(([x, y]) => [a * x + b * y + tx, c * x + d * y + ty])
}

// MULTI-KEYFORM-2D-001: 두 파라미터 격자 이중선형 보간.
function interpKeyform2DSpec(spec: KeyformSpec, vx: number, vy: number): Vec2[] | null {
  const g = spec.grid
  if (!g || !g.length) return null
  const ax = spec.values_x || [-30, 0, 30]
  const ay = spec.values_y || [-30, 0, 30]
  const cell = (vals: number[], v: number): [number, number] => {
    if (v <= vals[0]) return [0, 0]
    if (v >= vals[vals.length - 1]) return [vals.length - 2, 1]
    for (let k = 0; k < vals.length - 1; k += 1) {
      if (v >= vals[k] && v <= vals[k + 1]) return [k, clamp((v - vals[k]) / (vals[k + 1] - vals[k] || 1), 0, 1)]
    }
    return [vals.length - 2, 1]
  }
  const [iy, ty] = cell(ay, vy)
  const [ix, tx] = cell(ax, vx)
  const g00 = g[iy][ix]
  const g01 = g[iy][ix + 1]
  const g10 = g[iy + 1][ix]
  const g11 = g[iy + 1][ix + 1]
  return g00.map(([x00, y00], i) => {
    const tX = lerp(x00, g01[i][0], tx)
    const tY = lerp(y00, g01[i][1], tx)
    const bX = lerp(g10[i][0], g11[i][0], tx)
    const bY = lerp(g10[i][1], g11[i][1], tx)
    return [lerp(tX, bX, ty), lerp(tY, bY, ty)] as Vec2
  })
}

// KEYFORM-COMPOSE-002: a morphology keyform can be the absolute shape baseline while
// pose/expression keyforms remain neutral-relative additive deltas. This keeps the
// legacy single-keyform path unchanged and prevents a raw mesh from replacing a
// corner-aligned MouthOpenY shape after THA3 adds AngleX/AngleY keyforms.
export function composeKeyformVertices(
  project: Project,
  mesh: Mesh,
  parameterValue: (id: string, fallback: number) => number,
): Vec2[] {
  const kf = mesh.vertex_keyforms
  if (!kf) return mesh.vertices
  const specs = Array.isArray(kf) ? kf : [kf]
  if (!specs.length) return mesh.vertices
  if (specs.length === 1 && !Array.isArray(specs[0].parameter_ids)) {
    const spec = specs[0]
    const p = project.parameters.find((item) => item.id === spec.parameter_id)
    const value = parameterValue(spec.parameter_id!, p?.default ?? 0)
    return interpKeyformSpec(spec, value) ?? mesh.vertices
  }

  const absolute = specs.find((spec) => spec.composition === 'absolute')
  let out: Vec2[] = mesh.vertices.map((point) => [point[0], point[1]])
  if (absolute && !Array.isArray(absolute.parameter_ids)) {
    const p = project.parameters.find((item) => item.id === absolute.parameter_id)
    const value = parameterValue(absolute.parameter_id!, p?.default ?? 0)
    const shape = interpKeyformSpec(absolute, value)
    if (shape) out = shape.map((point) => [point[0], point[1]])
  }

  for (const spec of specs) {
    if (spec === absolute) continue
    if (absolute && spec.composition === 'affine_additive' && !Array.isArray(spec.parameter_ids)) {
      const p = project.parameters.find((item) => item.id === spec.parameter_id)
      const value = parameterValue(spec.parameter_id!, p?.default ?? 0)
      const current = interpAffineSpec(spec, value)
      const neutral = interpAffineSpec(spec, p?.default ?? 0)
      const relative = current && neutral ? relativeAffine(current, neutral) : null
      if (relative) {
        out = applyAffine(out, relative)
        continue
      }
    }
    let cur: Vec2[] | null
    let neu: Vec2[] | null
    if (Array.isArray(spec.parameter_ids)) {
      const [px, py] = spec.parameter_ids
      const pdx = project.parameters.find((item) => item.id === px)
      const pdy = project.parameters.find((item) => item.id === py)
      const vx = parameterValue(px, pdx?.default ?? 0)
      const vy = parameterValue(py, pdy?.default ?? 0)
      cur = interpKeyform2DSpec(spec, vx, vy)
      neu = interpKeyform2DSpec(spec, pdx?.default ?? 0, pdy?.default ?? 0)
    } else {
      const p = project.parameters.find((item) => item.id === spec.parameter_id)
      const value = parameterValue(spec.parameter_id!, p?.default ?? 0)
      cur = interpKeyformSpec(spec, value)
      neu = interpKeyformSpec(spec, p?.default ?? 0)
    }
    if (!cur || !neu) continue
    for (let index = 0; index < out.length; index += 1) {
      out[index][0] += cur[index][0] - neu[index][0]
      out[index][1] += cur[index][1] - neu[index][1]
    }
  }
  return out
}

function isNeutralVisualRepairKeyform(keyform: { purpose?: string }): boolean {
  return String(keyform.purpose || '').startsWith('neutral visual repair')
}

function isEyeBallDetailPart(partId: string): boolean {
  return partId.endsWith('_iris') || partId.endsWith('_pupil') || partId.endsWith('_highlight')
}

function neutralActivationParametersForPart(part: Part): Set<string> {
  const ids = new Set<string>()
  if (part.id.startsWith('eye_L_')) {
    ids.add('ParamEyeLOpen')
    if (isEyeBallDetailPart(part.id) || part.id === 'eye_L_white') {
      ['ParamEyeBallX', 'ParamEyeBallY'].forEach((id) => ids.add(id))
    }
  }
  if (part.id.startsWith('eye_R_')) {
    ids.add('ParamEyeROpen')
    if (isEyeBallDetailPart(part.id) || part.id === 'eye_R_white') {
      ['ParamEyeBallX', 'ParamEyeBallY'].forEach((id) => ids.add(id))
    }
  }
  if (part.id.startsWith('mouth_')) ['ParamMouthOpenY', 'ParamMouthForm'].forEach((id) => ids.add(id))
  if (part.id.startsWith('hair_front_')) ids.add('ParamHairFront')
  if (part.id.startsWith('hair_side_')) ids.add('ParamHairSide')
  if (part.id.startsWith('hair_back_')) ids.add('ParamHairBack')
  if (['torso_base', 'neck', 'shoulder_L', 'shoulder_R', 'arm_L_upper_simple', 'arm_R_upper_simple'].includes(part.id)) {
    ['ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBreath'].forEach((id) => ids.add(id))
  }
  if (part.id.includes('cloth') || part.id.startsWith('collar_')) {
    ['ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBreath'].forEach((id) => ids.add(id))
  }
  return ids
}

// PENDULUM (INOCHI2D-ABSORB-001): SimplePhysics 펜듈럼 적분기. 순수 — 인라인.
const PENDULUM_K = 64
function integratePendulum(profile: PhysicsProfile, item: { offset: Vec2; velocity: Vec2 }, target: Vec2, dt: number) {
  const g = profile.gravity ?? 1.0
  const L = Math.max(profile.length ?? 24, 1)
  const omega2 = (g / L) * PENDULUM_K
  const dampX = Math.pow(profile.damping_x ?? profile.damping ?? 0.9, dt * 60)
  const dampY = Math.pow(profile.damping_y ?? profile.damping ?? 0.9, dt * 60)
  const sag = profile.gravity_sag ?? 0
  const rest: Vec2 = [target[0], target[1] + sag]
  for (let axis = 0; axis < 2; axis += 1) {
    const damp = axis === 0 ? dampX : dampY
    const accel = omega2 * (rest[axis] - item.offset[axis]) * dt
    item.velocity[axis] = (item.velocity[axis] + accel) * damp
    item.offset[axis] += item.velocity[axis] * dt * 60
    const limit = profile.max_offset?.[axis] ?? 30
    item.offset[axis] = clamp(item.offset[axis], -limit, limit)
  }
  if (profile.spring) {
    const bounce = profile.spring_gain ?? 0.12
    item.offset[1] += Math.abs(item.velocity[0]) * bounce * dt * 60
    const limit = profile.max_offset?.[1] ?? 30
    item.offset[1] = clamp(item.offset[1], -limit, limit)
  }
  return item
}

// normalizeRig: _mini_rig(별도 파일이 project.json에 인라인)에 아리아형 기본값을 채운다.
// ⚠️ 아리아형 fallback bbox — 다른 모델은 _mini_rig가 자체 값을 제공해야 정확(rig-format §7.5).
export function normalizeRig(rig?: RigConfig | null): RigConfig {
  const base: RigConfig = {
    schema_version: 1,
    project_kind: 'mini_cubism_rig_v0',
    mesh_overrides: {},
    keyform_overrides: [],
    clipping: {
      enabled: true,
      pairs: {
        eye_L_white: ['eye_L_iris', 'eye_L_pupil', 'eye_L_highlight'],
        eye_R_white: ['eye_R_iris', 'eye_R_pupil', 'eye_R_highlight'],
      },
    },
    eye_socket_covers: {
      enabled: true,
      L: {
        bbox: [814, 674, 190, 92],
        fade_start: 0.96, fade_full: 0.08, max_opacity: 0.9,
        hide_open_parts_at: 0.22, show_open_parts_at: 0.82,
        upper_color: '#fae7dd', mid_color: '#f4d7cc', lower_color: '#e9bfb4',
        blur: 1, scale_x: 0.8, scale_y: 0.52,
      },
      R: {
        bbox: [1066, 676, 190, 92],
        fade_start: 0.96, fade_full: 0.08, max_opacity: 0.9,
        hide_open_parts_at: 0.22, show_open_parts_at: 0.82,
        upper_color: '#fae7dd', mid_color: '#f4d5ca', lower_color: '#e8bbb0',
        blur: 1, scale_x: 0.8, scale_y: 0.52,
      },
    },
    notes: [],
  }
  return {
    ...base,
    ...(rig || {}),
    mesh_overrides: { ...base.mesh_overrides, ...(rig?.mesh_overrides || {}) },
    keyform_overrides: rig?.keyform_overrides || [],
    clipping: {
      ...base.clipping,
      ...(rig?.clipping || {}),
      pairs: { ...base.clipping!.pairs, ...(rig?.clipping?.pairs || {}) },
    },
    eye_socket_covers: {
      ...base.eye_socket_covers,
      ...(rig?.eye_socket_covers || {}),
      L: { ...base.eye_socket_covers!.L, ...(rig?.eye_socket_covers?.L || {}) },
      R: { ...base.eye_socket_covers!.R, ...(rig?.eye_socket_covers?.R || {}) },
    },
  }
}

// ---- ctx 의존 (인스턴스별 클로저) ----

export interface RigMath {
  beginLatticeFrame(): void
  deformedVertices(project: Project, part: Part, mesh: Mesh): Vec2[]
  partTransform(project: Project, part: Part): Transform
  partOpacity(project: Project, part: Part): number
  inferredEyeSocketCoverBbox(project: Project, side: 'L' | 'R'): Vec2 | [number, number, number, number]
  setParameterValue(parameterId: string, value: number): void
  initPhysicsState(project: Project): void
  stepPhysics(dt?: number): void
}

import type { RigContext } from './types'

export function createRigMath(ctx: RigContext): RigMath {
  // 프레임 격자 캐시 — 인스턴스별. (원천 rig.js의 모듈 전역 latticeBaseCache/latticeFrame 대체)
  const latticeBaseCache = new Map<string, { points: Vec2[]; cols: number; rows: number }>()
  let latticeFrame: { id: number; displaced: Map<string, Vec2[]> } = { id: 0, displaced: new Map() }

  function param(id: string, fallback: number): number {
    return ctx.parameters[id] ?? fallback
  }

  function effectiveKeyformBindings(project: Project) {
    const overrides = ctx.rig?.keyform_overrides || []
    if (!overrides.length) return project.keyform_bindings
    const overrideKeys = new Set(overrides.map(bindingKey))
    return [...project.keyform_bindings.filter((b) => !overrideKeys.has(bindingKey(b))), ...overrides]
  }
  function bindingKey(b: { parameter_id: string; target_id: string; key_value: number }) {
    return `${b.parameter_id}::${b.target_id}::${b.key_value}`
  }

  function bindingTransform(project: Project, targetId: string): Transform {
    let transform = identityTransform()
    const groups = groupBy(
      effectiveKeyformBindings(project).filter((item) => item.target_id === targetId),
      (binding) => binding.parameter_id,
    )
    for (const [parameterId, bindings] of Object.entries(groups)) {
      const p = project.parameters.find((item) => item.id === parameterId)
      if (!p) continue
      const current = param(p.id, p.default)
      const keyframes = [
        { key_value: p.default, deltas: identityDeltas() as Deltas },
        ...bindings.map((b) => ({ key_value: b.key_value, deltas: b.deltas || identityDeltas() })),
      ].sort((a, b) => a.key_value - b.key_value)
      transform = mergeTransform(transform, sampleTransformKeyframes(keyframes, current))
    }
    return transform
  }

  function primaryDeformerForPart(project: Project, partId: string): Deformer | null {
    const preferred = ['Eye_L', 'Eye_R', 'Mouth', 'Hair_Front', 'Hair_Back']
      .map((id) => project.deformers.find((d) => d.id === id && d.child_ids.includes(partId)))
      .find(Boolean)
    if (preferred) return preferred
    const direct = project.deformers.find((d) => d.child_ids.includes(partId) && d.id !== 'Root')
    if (!direct) return null
    if (partId.includes('hair') && project.deformers.find((d) => d.id === 'Head_X')) {
      return project.deformers.find((d) => d.id === 'Head_X') ?? direct
    }
    return direct
  }

  function deformerTransform(project: Project, deformer: Deformer): Transform {
    let result = identityTransform()
    const chain: Deformer[] = []
    let current: Deformer | undefined = deformer
    while (current) {
      chain.unshift(current)
      current = project.deformers.find((c) => c.id === current!.parent_id)
    }
    for (const item of chain) result = mergeTransform(result, bindingTransform(project, item.id))
    return result
  }

  function parameterMoved(project: Project, parameterId: string): boolean {
    const p = project.parameters.find((item) => item.id === parameterId)
    if (!p) return false
    return Math.abs(Number(param(parameterId, p.default)) - Number(p.default)) > 0.001
  }

  function shouldSuppressNeutralPart(project: Project, part: Part): boolean {
    const parameterIds = neutralActivationParametersForPart(part)
    if (!parameterIds.size) return true
    return ![...parameterIds].some((id) => parameterMoved(project, id))
  }

  function eyeOpenDetailOpacity(project: Project, part: Part): number {
    if (!part.id.startsWith('eye_L_') && !part.id.startsWith('eye_R_')) return 1
    if (part.id.endsWith('_closed_lid') || part.id.endsWith('_closed_underpaint') || part.id.endsWith('_blink')) return 1
    const side = part.id.startsWith('eye_L_') ? 'L' : 'R'
    const covers = ctx.rig?.eye_socket_covers
    if (!covers?.enabled) return 1
    const config = covers[side] || {}
    const parameterId = side === 'L' ? 'ParamEyeLOpen' : 'ParamEyeROpen'
    const p = project.parameters.find((item) => item.id === parameterId)
    if (!p) return 1
    const openValue = param(parameterId, p.default)
    const hideAt = config.hide_open_parts_at ?? 0.22
    const fullAt = config.show_open_parts_at ?? 0.82
    return clamp((openValue - hideAt) / Math.max(fullAt - hideAt, 0.001), 0, 1)
  }

  function partOpacity(project: Project, part: Part): number {
    let opacity = part.opacity ?? 1
    let hasNeutralSuppression = false
    for (const keyform of project.part_opacity_keyframes || []) {
      if (keyform.part_id !== part.id) continue
      if (isNeutralVisualRepairKeyform(keyform)) {
        hasNeutralSuppression = true
        continue
      }
      const p = project.parameters.find((item) => item.id === keyform.parameter_id)
      if (!p) continue
      const current = param(p.id, p.default)
      opacity *= sampleOpacityKeyframes(keyform.keyframes || [], current, keyform.mode || 'linear')
    }
    if (hasNeutralSuppression && shouldSuppressNeutralPart(project, part)) opacity *= 0
    opacity *= eyeOpenDetailOpacity(project, part)
    return clamp(opacity, 0, 1)
  }

  // 눈 소켓 커버 bbox 추론 (config.bbox 없을 때).
  function inferredEyeSocketCoverBbox(project: Project, side: 'L' | 'R') {
    const prefix = side === 'L' ? 'eye_L_' : 'eye_R_'
    const ids = ['white', 'upper_lash', 'lower_lash', 'closed_lid'].map((s) => `${prefix}${s}`)
    const boxes = ids.map((id) => project.parts.find((p) => p.id === id)?.bbox).filter(Boolean) as [number, number, number, number][]
    if (!boxes.length) return [0, 0, 0, 0] as [number, number, number, number]
    const left = Math.min(...boxes.map((b) => b[0])) - 8
    const top = Math.min(...boxes.map((b) => b[1])) - 6
    const right = Math.max(...boxes.map((b) => b[0] + b[2])) + 8
    const bottom = Math.max(...boxes.map((b) => b[1] + b[3])) + 8
    return [left, top, right - left, bottom - top] as [number, number, number, number]
  }

  // MESH-DEFORM-001: FFD 격자 변형.
  function latticeBase(deformer: Deformer) {
    let entry = latticeBaseCache.get(deformer.id)
    const cols = deformer.lattice?.cols ?? 5
    const rows = deformer.lattice?.rows ?? 5
    if (!entry) {
      const [bx, by, bw, bh] = deformer.bounds
      const points: Vec2[] = []
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) points.push([bx + (bw * c) / (cols - 1), by + (bh * r) / (rows - 1)])
      }
      entry = { points, cols, rows }
      latticeBaseCache.set(deformer.id, entry)
    }
    return entry
  }

  function latticeDisplaced(project: Project, deformer: Deformer): Vec2[] {
    const cached = latticeFrame.displaced.get(deformer.id)
    if (cached) return cached
    const { points, cols, rows } = latticeBase(deformer)
    const t = bindingTransform(project, deformer.id)
    const pivot = deformer.pivot || [1024, 1024]
    const rad = (t.rotate * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const pins = Array.isArray(deformer.pin_edges)
      ? deformer.pin_edges
      : deformer.edge_pinned
        ? ['top', 'bottom', 'left', 'right']
        : []
    const displaced: Vec2[] = points.map(([x, y], i) => {
      if (pins.length) {
        const r = Math.floor(i / cols)
        const c = i % cols
        if (
          (pins.includes('top') && r === 0) ||
          (pins.includes('bottom') && r === rows - 1) ||
          (pins.includes('left') && c === 0) ||
          (pins.includes('right') && c === cols - 1)
        ) {
          return [0, 0]
        }
      }
      const dx = x - pivot[0]
      const dy = y - pivot[1]
      const nx = pivot[0] + (dx * cos - dy * sin) * t.scale[0] + t.translate[0]
      const ny = pivot[1] + (dx * sin + dy * cos) * t.scale[1] + t.translate[1]
      return [nx - x, ny - y]
    })
    latticeFrame.displaced.set(deformer.id, displaced)
    return displaced
  }

  function latticeDisplacementAt(project: Project, deformer: Deformer, vx: number, vy: number): Vec2 {
    const [bx, by, bw, bh] = deformer.bounds
    if (vx < bx || vy < by || vx > bx + bw || vy > by + bh) return [0, 0]
    const { cols, rows } = latticeBase(deformer)
    const displaced = latticeDisplaced(project, deformer)
    const u = clamp(((vx - bx) / Math.max(bw, 1e-6)) * (cols - 1), 0, cols - 1 - 1e-6)
    const v = clamp(((vy - by) / Math.max(bh, 1e-6)) * (rows - 1), 0, rows - 1 - 1e-6)
    const c0 = Math.floor(u)
    const r0 = Math.floor(v)
    const fu = u - c0
    const fv = v - r0
    const idx = (r: number, c: number) => displaced[r * cols + c]
    const d00 = idx(r0, c0)
    const d01 = idx(r0, c0 + 1)
    const d10 = idx(r0 + 1, c0)
    const d11 = idx(r0 + 1, c0 + 1)
    return [
      lerp(lerp(d00[0], d01[0], fu), lerp(d10[0], d11[0], fu), fv),
      lerp(lerp(d00[1], d01[1], fu), lerp(d10[1], d11[1], fu), fv),
    ]
  }

  function deformerChain(project: Project, partId: string): Deformer[] {
    const leaf = primaryDeformerForPart(project, partId)
    const chain: Deformer[] = []
    let current: Deformer | null | undefined = leaf
    while (current) {
      chain.unshift(current)
      current = project.deformers.find((c) => c.id === current!.parent_id)
    }
    return chain
  }

  function deformerChainFromId(project: Project, deformerId: string): Deformer[] {
    let current: Deformer | undefined = project.deformers.find((d) => d.id === deformerId)
    const chain: Deformer[] = []
    while (current) {
      chain.unshift(current)
      current = project.deformers.find((c) => c.id === current!.parent_id)
    }
    return chain.filter((d) => d.parent_id !== undefined)
  }

  function chainDisplacementAt(project: Project, chain: Deformer[], vx: number, vy: number): Vec2 {
    let dx = 0
    let dy = 0
    for (const deformer of chain) {
      const [ddx, ddy] = latticeDisplacementAt(project, deformer, vx, vy)
      dx += ddx
      dy += ddy
    }
    return [dx, dy]
  }

  // EYE-NATURAL-002 / MULTI-KEYFORM-001: 정점 키폼 (단일·2D 조합 중첩).
  function keyformBaseVertices(project: Project, mesh: Mesh): Vec2[] {
    return composeKeyformVertices(project, mesh, param)
  }

  function physicsVertexOffsets(partId: string, vertexCount: number): Vec2[] {
    const project = ctx.project
    const weights = project?.vertex_weights?.find((item) => item.part_id === partId)?.weights || null
    const rigid = physicsTransformForPart(partId)
    const offsets: Vec2[] = new Array(vertexCount)
    for (let i = 0; i < vertexCount; i += 1) {
      const w = weights ? weights[i] ?? 1 : 1
      offsets[i] = [rigid.translate[0] * w, rigid.translate[1] * w]
    }
    return offsets
  }

  // BBW-SKIN-001 / SKIN-BLEND-001: LBS·pairwise 블렌드. (explode·assembly 제거 — 항상 항등이라 출력 불변)
  function deformedVertices(project: Project, part: Part, mesh: Mesh): Vec2[] {
    const chain = deformerChain(project, part.id).filter((d) => d.parent_id !== undefined)
    const partRigid = bindingTransform(project, part.id)
    const physics = physicsVertexOffsets(part.id, mesh.vertices.length)
    const blend = part.skin_blend
    const secChain = blend?.secondary_deformer ? deformerChainFromId(project, blend.secondary_deformer) : null
    const lbs = part.skin_lbs
    const lbsChains = lbs ? lbs.joints.map((id) => deformerChainFromId(project, id)) : null
    return keyformBaseVertices(project, mesh).map(([vx, vy], i) => {
      let dx: number
      let dy: number
      if (lbsChains && lbs) {
        dx = 0
        dy = 0
        const wv = lbs.weights[i] || []
        for (let j = 0; j < lbsChains.length; j += 1) {
          const w = wv[j] ?? 0
          if (w === 0) continue
          const [cdx, cdy] = chainDisplacementAt(project, lbsChains[j], vx, vy)
          dx += cdx * w
          dy += cdy * w
        }
      } else {
        ;[dx, dy] = chainDisplacementAt(project, chain, vx, vy)
        if (secChain && blend) {
          const w = blend.weights?.[i] ?? 1
          if (w < 1) {
            const [sdx, sdy] = chainDisplacementAt(project, secChain, vx, vy)
            dx = dx * w + sdx * (1 - w)
            dy = dy * w + sdy * (1 - w)
          }
        }
      }
      dx += partRigid.translate[0] + physics[i][0]
      dy += partRigid.translate[1] + physics[i][1]
      return [vx + dx, vy + dy] as Vec2
    })
  }

  function partTransform(project: Project, part: Part): Transform {
    const deformer = primaryDeformerForPart(project, part.id)
    const base = deformer ? deformerTransform(project, deformer) : identityTransform()
    return mergeTransform(mergeTransform(base, bindingTransform(project, part.id)), physicsTransformForPart(part.id))
  }

  // ---- 물리 (physics.js 이식, draw() 결합 제거) ----

  function setParameterValue(parameterId: string, value: number): void {
    const p = ctx.project?.parameters?.find((item) => item.id === parameterId)
    const numeric = Number(value)
    ctx.parameters[parameterId] = p ? clamp(numeric, p.min, p.max) : numeric
  }

  function initPhysicsState(project: Project): void {
    ctx.physics = new Map()
    for (const profile of project.physics_profiles || []) {
      ctx.physics.set(profile.id, { offset: [0, 0], velocity: [0, 0] })
    }
  }

  function physicsTargetOffset(project: Project, profile: PhysicsProfile): Vec2 {
    const result: Vec2 = [0, 0]
    const weights = profile.input_weights || {}
    for (const [parameterId, vector] of Object.entries(weights)) {
      const p = project.parameters.find((item) => item.id === parameterId)
      if (!p) continue
      const current = param(parameterId, p.default)
      const range = Math.max(Math.abs(p.max - p.default), Math.abs(p.min - p.default), 1)
      const normalized = (current - p.default) / range
      result[0] += normalized * (vector[0] || 0)
      result[1] += normalized * (vector[1] || 0)
    }
    return result
  }

  function physicsTransformForPart(partId: string): Transform {
    if (!ctx.project) return identityTransform()
    const result = identityTransform()
    for (const profile of ctx.project.physics_profiles || []) {
      if (!(profile.targets || []).includes(partId)) continue
      const item = ctx.physics.get(profile.id)
      if (!item) continue
      const weight = profile.part_weights?.[partId] ?? 1
      result.translate[0] += item.offset[0] * weight
      result.translate[1] += item.offset[1] * weight
      result.rotate += (profile.rotate_factor || 0) * item.offset[0] * weight
    }
    return result
  }

  function stepPhysics(dt = 1 / 30): void {
    if (!ctx.project) return
    const project = ctx.project
    for (const profile of project.physics_profiles || []) {
      const item = ctx.physics.get(profile.id)
      if (!item) continue
      const target = physicsTargetOffset(project, profile)
      if (profile.model === 'pendulum') {
        integratePendulum(profile, item, target, dt)
      } else {
        const damping = Math.pow(profile.damping ?? 0.82, dt * 60)
        const stiffness = (profile.stiffness ?? 0.16) * dt * 60
        const drag = profile.drag ?? 0
        for (let axis = 0; axis < 2; axis += 1) {
          const force = (target[axis] - item.offset[axis]) * stiffness
          item.velocity[axis] = (item.velocity[axis] + force) * damping * (1 - drag)
          item.offset[axis] += item.velocity[axis] * dt * 60
          const limit = profile.max_offset?.[axis] ?? 30
          item.offset[axis] = clamp(item.offset[axis], -limit, limit)
        }
      }
      if (profile.output_parameter) setParameterValue(profile.output_parameter, item.offset[0])
    }
  }

  function beginLatticeFrame(): void {
    latticeFrame = { id: latticeFrame.id + 1, displaced: new Map() }
  }

  return {
    beginLatticeFrame,
    deformedVertices,
    partTransform,
    partOpacity,
    inferredEyeSocketCoverBbox,
    setParameterValue,
    initPhysicsState,
    stepPhysics,
  }
}
