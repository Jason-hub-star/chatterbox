const lerp = (a, b, t) => a + (b - a) * t
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value))

function interp1d(spec, value) {
  const keys = [...(spec?.keys || [])].sort((a, b) => a.value - b.value)
  if (!keys.length) return null
  if (value <= keys[0].value) return keys[0].vertices
  if (value >= keys.at(-1).value) return keys.at(-1).vertices
  for (let index = 0; index < keys.length - 1; index += 1) {
    const lower = keys[index], upper = keys[index + 1]
    if (value < lower.value || value > upper.value) continue
    const t = clamp((value - lower.value) / (upper.value - lower.value || 1), 0, 1)
    return lower.vertices.map(([x, y], i) => [
      lerp(x, upper.vertices[i][0], t), lerp(y, upper.vertices[i][1], t),
    ])
  }
  return null
}

function interpAffine(spec, value) {
  const keys = [...(spec?.keys || [])].filter((key) => key.affine).sort((a, b) => a.value - b.value)
  if (!keys.length) return null
  if (value <= keys[0].value) return keys[0].affine
  if (value >= keys.at(-1).value) return keys.at(-1).affine
  for (let index = 0; index < keys.length - 1; index += 1) {
    const lower = keys[index], upper = keys[index + 1]
    if (value < lower.value || value > upper.value) continue
    const t = clamp((value - lower.value) / (upper.value - lower.value || 1), 0, 1)
    return lower.affine.map((item, i) => lerp(item, upper.affine[i], t))
  }
  return null
}

function relativeAffine(current, neutral) {
  const [a, b, tx, c, d, ty] = neutral
  const det = a * d - b * c
  if (Math.abs(det) < 1e-8) return null
  const inv = [d / det, -b / det, (b * ty - d * tx) / det,
    -c / det, a / det, (c * tx - a * ty) / det]
  const [e, f, ux, g, h, uy] = current
  return [e * inv[0] + f * inv[3], e * inv[1] + f * inv[4], e * inv[2] + f * inv[5] + ux,
    g * inv[0] + h * inv[3], g * inv[1] + h * inv[4], g * inv[2] + h * inv[5] + uy]
}

function applyAffine(vertices, matrix) {
  const [a, b, tx, c, d, ty] = matrix
  return vertices.map(([x, y]) => [a * x + b * y + tx, c * x + d * y + ty])
}

function interp2d(spec, vx, vy) {
  const grid = spec?.grid
  if (!grid?.length) return null
  const xs = spec.values_x || [-30, 0, 30]
  const ys = spec.values_y || [-30, 0, 30]
  const cell = (values, value) => {
    if (value <= values[0]) return [0, 0]
    if (value >= values.at(-1)) return [values.length - 2, 1]
    for (let index = 0; index < values.length - 1; index += 1) {
      if (value >= values[index] && value <= values[index + 1]) {
        return [index, clamp((value - values[index]) / (values[index + 1] - values[index] || 1), 0, 1)]
      }
    }
    return [values.length - 2, 1]
  }
  const [ix, tx] = cell(xs, vx), [iy, ty] = cell(ys, vy)
  const g00 = grid[iy][ix], g01 = grid[iy][ix + 1], g10 = grid[iy + 1][ix], g11 = grid[iy + 1][ix + 1]
  return g00.map(([x00, y00], i) => [
    lerp(lerp(x00, g01[i][0], tx), lerp(g10[i][0], g11[i][0], tx), ty),
    lerp(lerp(y00, g01[i][1], tx), lerp(g10[i][1], g11[i][1], tx), ty),
  ])
}

export function composeMeshVertices(project, mesh, values = {}) {
  const raw = mesh?.vertex_keyforms
  if (!raw) return mesh.vertices
  const specs = Array.isArray(raw) ? raw : [raw]
  const defaults = Object.fromEntries((project.parameters || []).map((p) => [p.id, p.default ?? 0]))
  const value = (id) => values[id] ?? defaults[id] ?? 0
  if (specs.length === 1 && !Array.isArray(specs[0].parameter_ids)) {
    return interp1d(specs[0], value(specs[0].parameter_id)) || mesh.vertices
  }
  const absolute = specs.find((spec) => spec.composition === 'absolute')
  let out = absolute && !Array.isArray(absolute.parameter_ids)
    ? (interp1d(absolute, value(absolute.parameter_id)) || mesh.vertices).map((point) => [...point])
    : mesh.vertices.map((point) => [...point])
  for (const spec of specs) {
    if (spec === absolute) continue
    if (absolute && spec.composition === 'affine_additive' && !Array.isArray(spec.parameter_ids)) {
      const current = interpAffine(spec, value(spec.parameter_id))
      const neutral = interpAffine(spec, defaults[spec.parameter_id] ?? 0)
      const relative = current && neutral ? relativeAffine(current, neutral) : null
      if (relative) {
        out = applyAffine(out, relative)
        continue
      }
    }
    let cur, neutral
    if (Array.isArray(spec.parameter_ids)) {
      const [px, py] = spec.parameter_ids
      cur = interp2d(spec, value(px), value(py))
      neutral = interp2d(spec, defaults[px] ?? 0, defaults[py] ?? 0)
    } else {
      cur = interp1d(spec, value(spec.parameter_id))
      neutral = interp1d(spec, defaults[spec.parameter_id] ?? 0)
    }
    if (!cur || !neutral) continue
    out = out.map(([x, y], index) => [
      x + cur[index][0] - neutral[index][0],
      y + cur[index][1] - neutral[index][1],
    ])
  }
  return out
}

export function vertexBounds(vertices) {
  const xs = vertices.map((point) => point[0]), ys = vertices.map((point) => point[1])
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys)
  return { left, right, top, bottom, width: right - left, height: bottom - top }
}

export function inspectWideGrowGeometry(project, options = {}) {
  const maxHeightRatio = options.maxHeightRatio ?? 0.13
  const maxCornerDriftRatio = options.maxCornerDriftRatio ?? 0.15
  const minWidthRatio = options.minWidthRatio ?? 0.8
  const maxWidthRatio = options.maxWidthRatio ?? 1.2
  const meshes = new Map((project.meshes || []).map((mesh) => [mesh.part_id, mesh]))
  const parts = new Map((project.parts || []).map((part) => [part.id, part]))
  const wide = meshes.get('mouth_state_wide')
  const closedId = meshes.has('mouth_closed_master') ? 'mouth_closed_master' : 'mouth_line'
  const closed = meshes.get(closedId)
  const faceHeight = parts.get('face_base')?.bbox?.[3] || 0
  if (!wide || !closed || !faceHeight) return { ok: false, errors: ['wide/closed/face geometry missing'], samples: [] }
  const specs = Array.isArray(wide.vertex_keyforms) ? wide.vertex_keyforms : [wide.vertex_keyforms].filter(Boolean)
  const absolutes = specs.filter((spec) => spec?.composition === 'absolute')
  const errors = []
  if (absolutes.length !== 1 || absolutes[0]?.parameter_id !== 'ParamMouthOpenY') {
    errors.push(`mouth_state_wide absolute primary count=${absolutes.length}`)
  }
  const samples = []
  for (const angleX of [-30, 0, 30]) {
    for (const angleY of [-30, 0, 30]) {
      const pose = { ParamAngleX: angleX, ParamAngleY: angleY, ParamMouthForm: 0 }
      const closedBox = vertexBounds(composeMeshVertices(project, closed, { ...pose, ParamMouthOpenY: 0 }))
      let previousHeight = -Infinity
      for (const mouthOpen of [0.2, 0.5, 1]) {
        const openBox = vertexBounds(composeMeshVertices(project, wide, { ...pose, ParamMouthOpenY: mouthOpen }))
        const widthRatio = openBox.width / Math.max(closedBox.width, 1)
        const heightRatio = openBox.height / faceHeight
        const leftDrift = Math.abs(openBox.left - closedBox.left) / Math.max(closedBox.width, 1)
        const rightDrift = Math.abs(openBox.right - closedBox.right) / Math.max(closedBox.width, 1)
        const monotonic = openBox.height + 0.5 >= previousHeight
        const row = { angleX, angleY, mouthOpen, widthRatio, heightRatio, leftDrift, rightDrift, monotonic }
        samples.push(row)
        if (heightRatio > maxHeightRatio) errors.push(`height ${(heightRatio * 100).toFixed(1)}% @${angleX}/${angleY}/o${mouthOpen}`)
        if (widthRatio < minWidthRatio || widthRatio > maxWidthRatio) errors.push(`width ${widthRatio.toFixed(2)} @${angleX}/${angleY}/o${mouthOpen}`)
        if (leftDrift > maxCornerDriftRatio || rightDrift > maxCornerDriftRatio) errors.push(`corner ${leftDrift.toFixed(2)}/${rightDrift.toFixed(2)} @${angleX}/${angleY}/o${mouthOpen}`)
        if (!monotonic) errors.push(`non-monotonic height @${angleX}/${angleY}/o${mouthOpen}`)
        previousHeight = openBox.height
      }
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], samples }
}
