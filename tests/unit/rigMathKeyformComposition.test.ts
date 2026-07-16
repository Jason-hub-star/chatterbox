import { describe, expect, it } from 'vitest'

import { composeKeyformVertices } from '../../src/lib/pixi/rig/rigMath'
import type { Mesh, Project, Vec2 } from '../../src/lib/pixi/rig/types'

const base: Vec2[] = [[0, 0], [200, 0], [0, 100], [200, 100]]
const mouthClosed: Vec2[] = [[50, 45], [150, 45], [50, 55], [150, 55]]
const mouthOpen: Vec2[] = [[50, 20], [150, 20], [50, 80], [150, 80]]
const angleNeutral: Vec2[] = base
const angleTurned: Vec2[] = base.map(([x, y]) => [x + 20, y])

function project(): Project {
  return {
    parameters: [
      { id: 'ParamMouthOpenY', min: 0, max: 1, default: 0 },
      { id: 'ParamAngleY', min: -30, max: 30, default: 0 },
    ],
  } as Project
}

function mesh(composition?: 'absolute'): Mesh {
  return {
    part_id: 'mouth_state_wide',
    vertices: base,
    triangles: [[0, 1, 2], [1, 2, 3]],
    vertex_keyforms: [
      {
        parameter_id: 'ParamMouthOpenY',
        ...(composition ? { composition } : {}),
        keys: [
          { value: 0, vertices: mouthClosed },
          { value: 1, vertices: mouthOpen },
        ],
      },
      {
        parameter_id: 'ParamAngleY',
        composition: 'affine_additive',
        keys: [
          { value: 0, vertices: angleNeutral, affine: [1, 0, 0, 0, 1, 0] },
          { value: 30, vertices: angleTurned, affine: [1, 0, 20, 0, 1, 0] },
        ],
      },
    ],
  }
}

function sample(target: Mesh, values: Record<string, number>): Vec2[] {
  return composeKeyformVertices(project(), target, (id, fallback) => values[id] ?? fallback)
}

describe('absolute primary keyform composition', () => {
  it('uses MouthOpenY as the shape and adds the neutral-relative Angle delta', () => {
    expect(sample(mesh('absolute'), { ParamMouthOpenY: 1, ParamAngleY: 30 })).toEqual([
      [70, 20], [170, 20], [70, 80], [170, 80],
    ])
  })

  it('preserves legacy base-plus-delta behavior when no absolute contract exists', () => {
    expect(sample(mesh(), { ParamMouthOpenY: 1, ParamAngleY: 30 })).toEqual([
      [20, -25], [220, -25], [20, 125], [220, 125],
    ])
  })

  it('keeps the legacy single-keyform direct interpolation path', () => {
    const target = mesh('absolute')
    target.vertex_keyforms = (target.vertex_keyforms as NonNullable<Mesh['vertex_keyforms']>[])?.[0]
    expect(sample(target, { ParamMouthOpenY: 1 })).toEqual(mouthOpen)
  })
})
