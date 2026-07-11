// PIXI-RENDER-001: PixiJS v8 WebGL 렌더러 — 원천 SNACK 플레이어 src/core/draw_pixi.js.
// 원천은 모듈 전역(let app·const nodes·const coverSprites·let bgSprite)이라 아바타 1개만
// 가능했다. 여기서는 createRenderer(app, ctx, rig)가 이들을 클로저 필드로 캡슐화 →
// participant N명이 각자 렌더러를 가진다(멀티플레이어 전제). 그리기 로직은 무수정.
// drawSocketCoverShape(눈꺼풀 커버)는 draw.js에서 1개만 인라인.

import { type Application, Container, MeshSimple, Rectangle, Sprite, Texture } from 'pixi.js'
import type { EyeSocketCoverConfig, Mesh, Part, Project, RigContext, Vec2 } from './types'
import type { RigMath } from './rigMath'
import { bboxCenter, clamp } from './util'

const CROP_PAD = 2
const COVER_PAD = 16 // blur 번짐 여유

interface RenderNode {
  kind: 'clipped' | 'mesh' | 'sprite'
  display: Container | MeshSimple | Sprite
  mesh?: MeshSimple
  meshData?: Mesh
  maskMesh?: MeshSimple
  maskPartId?: string
  maskPart?: Part
  maskMeshData?: Mesh
  center?: Vec2
}

export interface Renderer {
  buildScene(project: Project): void
  drawPixi(): void
  extractPixels(frame?: [number, number, number, number]): { pixels: Uint8Array | Uint8ClampedArray; width: number; height: number }
}

export interface RendererOptions {
  transparent?: boolean // 베이지 배경판 제거(룸 합성용). 기본 false = #f4f0e8 불투명(플레이어 골든 대조).
}

// 눈꺼풀 커버 형태 — draw.js drawSocketCoverShape 이식(순수 canvas2d).
function drawSocketCoverShape(
  ctx: CanvasRenderingContext2D,
  bbox: [number, number, number, number],
  config: EyeSocketCoverConfig,
  opacity: number,
): void {
  const [x, y, w, h] = bbox
  const cx = x + w / 2
  const cy = y + h / 2
  const rx = (w / 2) * (config.scale_x ?? 0.92)
  const ry = (h / 2) * (config.scale_y ?? 0.66)
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.filter = `blur(${config.blur ?? 2}px)`
  const gradient = ctx.createLinearGradient(cx, y, cx, y + h)
  gradient.addColorStop(0, config.upper_color || '#f8ded2')
  gradient.addColorStop(0.55, config.mid_color || '#f4cfc3')
  gradient.addColorStop(1, config.lower_color || '#e7b6aa')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.filter = 'none'
  ctx.globalAlpha = Math.min(1, opacity * 0.42)
  ctx.fillStyle = config.lower_color || '#e7b6aa'
  ctx.beginPath()
  ctx.ellipse(cx, cy + ry * 0.32, rx * 0.74, ry * 0.24, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function createRenderer(
  app: Application,
  ctx: RigContext,
  rig: RigMath,
  options: RendererOptions = {},
): Renderer {
  const nodes = new Map<string, RenderNode>()
  const coverSprites = new Map<'L' | 'R', { sprite: Sprite; key: string | null }>()
  let bgSprite: Sprite | null = null

  // 풀캔버스 PNG를 그대로 올리면 GPU 메모리 폭발 — 알파 bbox 서브렉트만 크롭.
  function croppedTexture(image: HTMLImageElement, bbox: [number, number, number, number], canvasSize: Vec2) {
    const x0 = Math.max(0, Math.floor(bbox[0]) - CROP_PAD)
    const y0 = Math.max(0, Math.floor(bbox[1]) - CROP_PAD)
    const x1 = Math.min(canvasSize[0], Math.ceil(bbox[0] + bbox[2]) + CROP_PAD)
    const y1 = Math.min(canvasSize[1], Math.ceil(bbox[1] + bbox[3]) + CROP_PAD)
    const w = Math.max(1, x1 - x0)
    const h = Math.max(1, y1 - y0)
    const crop = document.createElement('canvas')
    crop.width = w
    crop.height = h
    crop.getContext('2d')!.drawImage(image, x0, y0, w, h, 0, 0, w, h)
    const texture = Texture.from(crop)
    // 스테이지가 renderScale(0.1~0.5)로 축소되어 2048급 파츠를 강축소 샘플링 — 밉맵 없이는
    // 지글거림(2026-07-11 주인님 실측). 첫 업로드 전에 켜야 GL이 레벨 수를 계산한다.
    texture.source.autoGenerateMipmaps = true
    return { texture, origin: [x0, y0] as Vec2, size: [w, h] as Vec2 }
  }

  function buildSimpleMesh(project: Project, part: Part, meshData: Mesh, image: HTMLImageElement): MeshSimple {
    const { texture, origin, size } = croppedTexture(image, part.bbox, project.canvas_size)
    const count = meshData.vertices.length
    const vertices = new Float32Array(count * 2)
    const uvs = new Float32Array(count * 2)
    meshData.vertices.forEach(([x, y], i) => {
      vertices[i * 2] = x
      vertices[i * 2 + 1] = y
      uvs[i * 2] = (x - origin[0]) / size[0]
      uvs[i * 2 + 1] = (y - origin[1]) / size[1]
    })
    const indices = new Uint32Array(meshData.triangles.flat())
    const mesh = new MeshSimple({ texture, vertices, uvs, indices })
    mesh.autoUpdate = false
    return mesh
  }

  function meshFor(project: Project, partId: string): Mesh | null {
    const meshData = project.meshes.find((item) => item.part_id === partId)
    return meshData?.triangles?.length ? meshData : null
  }

  function maskPartIdFor(partId: string): string | null {
    const pairs = ctx.rig?.clipping?.pairs || {}
    return Object.keys(pairs).find((key) => (pairs[key] || []).includes(partId)) || null
  }

  function addCoverSprites(): void {
    for (const side of ['L', 'R'] as const) {
      const sprite = new Sprite(Texture.EMPTY)
      sprite.alpha = 0
      app.stage.addChild(sprite)
      coverSprites.set(side, { sprite, key: null })
    }
  }

  function buildScene(project: Project): void {
    nodes.clear()
    coverSprites.clear()
    app.stage.removeChildren()
    // 배경: extract 픽셀에도 포함되도록 스테이지 차일드로.
    bgSprite = new Sprite(Texture.WHITE)
    bgSprite.tint = 0xf4f0e8
    bgSprite.width = project.canvas_size[0]
    bgSprite.height = project.canvas_size[1]
    app.stage.addChild(bgSprite)

    const clippingEnabled = ctx.rig?.clipping?.enabled
    const parts = [...project.parts].sort((a, b) => a.draw_order - b.draw_order)
    for (const part of parts) {
      const image = ctx.images.get(part.id)
      if (!image) continue
      const meshData = meshFor(project, part.id)
      const maskPartId = maskPartIdFor(part.id)
      const maskPart = maskPartId ? project.parts.find((item) => item.id === maskPartId) : null
      const maskMeshData = maskPart ? meshFor(project, maskPartId!) : null
      const maskImage = maskPartId ? ctx.images.get(maskPartId) : undefined
      if (meshData && maskPart && maskMeshData && maskImage && clippingEnabled) {
        // 눈 클리핑: 홍채류를 흰자 클론 메시로 스텐실 마스킹(둘 다 격자 변형).
        const container = new Container()
        const mesh = buildSimpleMesh(project, part, meshData, image)
        const maskMesh = buildSimpleMesh(project, maskPart, maskMeshData, maskImage)
        container.addChild(maskMesh, mesh)
        container.mask = maskMesh
        app.stage.addChild(container)
        nodes.set(part.id, { kind: 'clipped', display: container, mesh, meshData, maskMesh, maskPartId: maskPartId!, maskPart, maskMeshData })
      } else if (meshData) {
        const mesh = buildSimpleMesh(project, part, meshData, image)
        app.stage.addChild(mesh)
        nodes.set(part.id, { kind: 'mesh', display: mesh, mesh, meshData })
      } else {
        const { texture, origin } = croppedTexture(image, part.bbox, project.canvas_size)
        const sprite = new Sprite(texture)
        const center = bboxCenter(part.bbox)
        sprite.pivot.set(center[0] - origin[0], center[1] - origin[1])
        sprite.position.set(center[0], center[1])
        app.stage.addChild(sprite)
        nodes.set(part.id, { kind: 'sprite', display: sprite, center })
      }
      if (part.id === 'face_base') addCoverSprites()
    }
    if (bgSprite && options.transparent) bgSprite.visible = false
  }

  function writeVertices(mesh: MeshSimple, verts: Vec2[]): void {
    const data = mesh.vertices
    for (let i = 0; i < verts.length; i += 1) {
      data[i * 2] = verts[i][0]
      data[i * 2 + 1] = verts[i][1]
    }
    mesh.geometry.getBuffer('aPosition').update()
  }

  function writeBaseVertices(mesh: MeshSimple, meshData: Mesh): void {
    const data = mesh.vertices
    for (let i = 0; i < meshData.vertices.length; i += 1) {
      data[i * 2] = meshData.vertices[i][0]
      data[i * 2 + 1] = meshData.vertices[i][1]
    }
    mesh.geometry.getBuffer('aPosition').update()
  }

  function applyRigidTransform(display: Container, project: Project, part: Part) {
    const t = rig.partTransform(project, part)
    const center = bboxCenter(part.bbox)
    display.pivot.set(center[0], center[1])
    display.position.set(center[0] + t.translate[0], center[1] + t.translate[1])
    display.rotation = (t.rotate * Math.PI) / 180
    display.scale.set(t.scale[0], t.scale[1])
    return t
  }

  function resetTransform(display: Container): void {
    display.pivot.set(0, 0)
    display.position.set(0, 0)
    display.rotation = 0
    display.scale.set(1, 1)
  }

  function coverConfigFor(project: Project, side: 'L' | 'R') {
    const covers = ctx.rig?.eye_socket_covers
    if (!covers?.enabled) return null
    const config = covers[side]
    if (!config) return null
    const bbox = (config.bbox || rig.inferredEyeSocketCoverBbox(project, side)) as [number, number, number, number]
    return { config, bbox }
  }

  function updateCoverSprites(project: Project): void {
    for (const side of ['L', 'R'] as const) {
      const entry = coverSprites.get(side)
      if (!entry) continue
      const resolved = coverConfigFor(project, side)
      if (!resolved) {
        entry.sprite.alpha = 0
        continue
      }
      const { config, bbox } = resolved
      const parameterId = side === 'L' ? 'ParamEyeLOpen' : 'ParamEyeROpen'
      const openValue = ctx.parameters[parameterId] ?? 1
      const start = config.fade_start ?? 0.96
      const full = config.fade_full ?? 0.08
      const maxOpacity = config.max_opacity ?? 0.98
      const opacity = clamp(((start - openValue) / Math.max(start - full, 0.001)) * maxOpacity, 0, maxOpacity)
      entry.sprite.alpha = opacity
      if (opacity <= 0.01) continue
      const key = JSON.stringify([bbox, config])
      if (entry.key !== key) {
        const [x, y, w, h] = bbox
        const off = document.createElement('canvas')
        off.width = Math.max(1, Math.ceil(w + COVER_PAD * 2))
        off.height = Math.max(1, Math.ceil(h + COVER_PAD * 2))
        drawSocketCoverShape(off.getContext('2d')!, [COVER_PAD, COVER_PAD, w, h], config, 1)
        entry.sprite.texture = Texture.from(off)
        entry.sprite.position.set(x - COVER_PAD, y - COVER_PAD)
        entry.key = key
      }
    }
  }

  function drawPixi(): void {
    const project = ctx.project
    if (!project) return
    rig.beginLatticeFrame()
    const meshMode = ctx.rig?.render_mode === 'mesh'
    const deformedCache = new Map<string, Vec2[]>() // 흰자 변형 결과를 마스크 클론과 공유
    const vertsOf = (part: Part, meshData: Mesh): Vec2[] => {
      let verts = deformedCache.get(part.id)
      if (!verts) {
        verts = rig.deformedVertices(project, part, meshData)
        deformedCache.set(part.id, verts)
      }
      return verts
    }
    for (const part of project.parts) {
      const node = nodes.get(part.id)
      if (!node) continue
      const opacity = rig.partOpacity(project, part)
      if (node.kind === 'sprite') {
        const t = applyRigidTransform(node.display, project, part)
        node.display.alpha = opacity * t.opacity
        node.display.visible = node.display.alpha > 0.01
        continue
      }
      const mesh = node.mesh!
      if (meshMode) {
        // 메시 경로: partOpacity만, 정점은 격자 변형.
        resetTransform(mesh)
        writeVertices(mesh, vertsOf(part, node.meshData!))
        mesh.alpha = opacity
        mesh.visible = opacity > 0.01
        if (node.kind === 'clipped') {
          resetTransform(node.maskMesh!)
          writeVertices(node.maskMesh!, vertsOf(node.maskPart!, node.maskMeshData!))
        }
      } else {
        // 스프라이트 경로: 기준 정점 + 강체 트랜스폼.
        writeBaseVertices(mesh, node.meshData!)
        const t = applyRigidTransform(mesh, project, part)
        mesh.alpha = opacity * t.opacity
        mesh.visible = mesh.alpha > 0.01
        if (node.kind === 'clipped') {
          writeBaseVertices(node.maskMesh!, node.maskMeshData!)
          applyRigidTransform(node.maskMesh!, project, node.maskPart!)
        }
      }
    }
    updateCoverSprites(project)
    app.render()
  }

  function extractPixels(frame?: [number, number, number, number]) {
    const project = ctx.project!
    const opts: { target: Container; resolution: number; frame?: Rectangle } = { target: app.stage, resolution: 1 }
    if (frame) opts.frame = new Rectangle(frame[0], frame[1], frame[2], frame[3])
    const result = app.renderer.extract.pixels(opts) as unknown as
      | { pixels: Uint8ClampedArray; width: number; height: number }
      | Uint8Array
    if ((result as { pixels?: unknown }).pixels) {
      return result as { pixels: Uint8ClampedArray; width: number; height: number }
    }
    return {
      pixels: result as Uint8Array,
      width: frame ? frame[2] : project.canvas_size[0],
      height: frame ? frame[3] : project.canvas_size[1],
    }
  }

  return { buildScene, drawPixi, extractPixels }
}
