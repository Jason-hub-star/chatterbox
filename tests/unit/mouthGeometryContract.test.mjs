import { describe, expect, it } from 'vitest'

import { inspectWideGrowGeometry } from '../../scripts/lib/mouth-geometry.mjs'

const rectangle = (left, top, right, bottom) => [
  [left, top], [right, top], [left, bottom], [right, bottom],
]

function fixture({ absolute = true, openWidth = 100, openHeight = 60 } = {}) {
  const base = rectangle(0, 0, 200, 100)
  const closed = rectangle(50, 45, 150, 55)
  const openLeft = 100 - openWidth / 2
  const wide = {
    part_id: 'mouth_state_wide', vertices: base, triangles: [[0, 1, 2], [1, 2, 3]],
    vertex_keyforms: [
      {
        parameter_id: 'ParamMouthOpenY',
        ...(absolute ? { composition: 'absolute' } : {}),
        keys: [
          { value: 0, vertices: rectangle(50, 48, 150, 52) },
          { value: 0.2, vertices: rectangle(openLeft, 47, openLeft + openWidth, 53) },
          { value: 0.5, vertices: rectangle(openLeft, 35, openLeft + openWidth, 65) },
          { value: 1, vertices: rectangle(openLeft, 50 - openHeight / 2, openLeft + openWidth, 50 + openHeight / 2) },
        ],
      },
      {
        parameter_id: 'ParamAngleY',
        composition: 'affine_additive',
        keys: [
          { value: -30, vertices: base.map(([x, y]) => [x - 10, y - 5]), affine: [1, 0, -10, 0, 1, -5] },
          { value: 0, vertices: base, affine: [1, 0, 0, 0, 1, 0] },
          { value: 30, vertices: base.map(([x, y]) => [x + 10, y + 5]), affine: [1, 0, 10, 0, 1, 5] },
        ],
      },
    ],
  }
  return {
    mouth_mode: 'wide_grow',
    parameters: [
      { id: 'ParamMouthOpenY', default: 0 }, { id: 'ParamMouthForm', default: 0 },
      { id: 'ParamAngleX', default: 0 }, { id: 'ParamAngleY', default: 0 },
    ],
    parts: [
      { id: 'face_base', bbox: [0, 0, 500, 500] },
      { id: 'mouth_closed_master', bbox: [50, 45, 100, 10] },
      { id: 'mouth_state_wide', bbox: [0, 0, 200, 100] },
    ],
    meshes: [
      { part_id: 'mouth_closed_master', vertices: closed, triangles: [[0, 1, 2], [1, 2, 3]] },
      wide,
    ],
  }
}

describe('wide_grow geometry contract', () => {
  it('passes a corner-pinned absolute mouth across the angle matrix', () => {
    const report = inspectWideGrowGeometry(fixture())
    expect(report.ok).toBe(true)
    expect(report.samples).toHaveLength(27)
  })

  it('rejects the legacy raw-base composition contract', () => {
    const report = inspectWideGrowGeometry(fixture({ absolute: false }))
    expect(report.ok).toBe(false)
    expect(report.errors.some((error) => error.includes('absolute primary'))).toBe(true)
  })

  it('rejects an open mouth wider than its closed corners', () => {
    const report = inspectWideGrowGeometry(fixture({ openWidth: 150 }))
    expect(report.ok).toBe(false)
    expect(report.errors.some((error) => error.startsWith('width'))).toBe(true)
  })

  it('rejects an excessive face-relative opening', () => {
    const report = inspectWideGrowGeometry(fixture({ openHeight: 90 }))
    expect(report.ok).toBe(false)
    expect(report.errors.some((error) => error.startsWith('height'))).toBe(true)
  })
})
