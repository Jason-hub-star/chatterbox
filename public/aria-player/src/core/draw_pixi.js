// PIXI-RENDER-001: PixiJS v8 WebGL 백엔드 — 변형 수학(rig.js)은 그대로, 그리기만 GPU 메시.
// canvas2d 병목 = 삼각형당 클립/블릿 CPU 오버헤드 → 여기서는 정점 버퍼 갱신 + GPU 드로우.
// main.js가 ?renderer=pixi일 때만 동적 임포트한다. draw.js는 이 파일을 모른다 (state 훅 경유).

import { Application, Container, MeshSimple, Rectangle, Sprite, Texture } from "../../vendor/pixi.min.mjs";
import { drawSocketCoverShape } from "./draw.js";
import { beginLatticeFrame, deformedVertices, inferredEyeSocketCoverBbox, partOpacity, partTransform } from "./rig.js";
import { state } from "./state.js";
import { bboxCenter, clamp } from "./utils.js";

let app = null;
const nodes = new Map(); // part.id → { kind, display, mesh?, meshData?, base?, maskMesh?, maskPartId? }
const coverSprites = new Map(); // side → { sprite, key }
let bgSprite = null;

const CROP_PAD = 2;

// 풀캔버스 2048² PNG를 그대로 텍스처로 올리면 41장 × 16MB = GPU 메모리 폭발 —
// 알파 bbox 서브렉트만 크롭해 올리고 uv를 크롭 기준으로 계산한다.
function croppedTexture(image, bbox, canvasSize) {
  const x0 = Math.max(0, Math.floor(bbox[0]) - CROP_PAD);
  const y0 = Math.max(0, Math.floor(bbox[1]) - CROP_PAD);
  const x1 = Math.min(canvasSize[0], Math.ceil(bbox[0] + bbox[2]) + CROP_PAD);
  const y1 = Math.min(canvasSize[1], Math.ceil(bbox[1] + bbox[3]) + CROP_PAD);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const crop = document.createElement("canvas");
  crop.width = w;
  crop.height = h;
  crop.getContext("2d").drawImage(image, x0, y0, w, h, 0, 0, w, h);
  return { texture: Texture.from(crop), origin: [x0, y0], size: [w, h] };
}

function buildSimpleMesh(project, part, meshData, image) {
  const { texture, origin, size } = croppedTexture(image, part.bbox, project.canvas_size);
  const count = meshData.vertices.length;
  const vertices = new Float32Array(count * 2);
  const uvs = new Float32Array(count * 2);
  meshData.vertices.forEach(([x, y], i) => {
    vertices[i * 2] = x;
    vertices[i * 2 + 1] = y;
    uvs[i * 2] = (x - origin[0]) / size[0];
    uvs[i * 2 + 1] = (y - origin[1]) / size[1];
  });
  const indices = new Uint32Array(meshData.triangles.flat());
  const mesh = new MeshSimple({ texture, vertices, uvs, indices });
  mesh.autoUpdate = false;
  return mesh;
}

function meshFor(project, partId) {
  const meshData = project.meshes.find((item) => item.part_id === partId);
  return meshData?.triangles?.length ? meshData : null;
}

function maskPartIdFor(partId) {
  const pairs = state.rig?.clipping?.pairs || {};
  return Object.keys(pairs).find((key) => (pairs[key] || []).includes(partId)) || null;
}

function buildScene(project) {
  nodes.clear();
  coverSprites.clear();
  app.stage.removeChildren();
  // 배경: canvas2d의 fillRect와 동일 의미 — extract 픽셀에도 포함되도록 스테이지 차일드로
  bgSprite = new Sprite(Texture.WHITE);
  bgSprite.tint = 0xf4f0e8;
  bgSprite.width = project.canvas_size[0];
  bgSprite.height = project.canvas_size[1];
  app.stage.addChild(bgSprite);

  const parts = [...project.parts].sort((a, b) => a.draw_order - b.draw_order);
  for (const part of parts) {
    const image = state.images.get(part.id);
    if (!image) continue;
    const meshData = meshFor(project, part.id);
    const maskPartId = maskPartIdFor(part.id);
    const maskPart = maskPartId ? project.parts.find((item) => item.id === maskPartId) : null;
    const maskMeshData = maskPart ? meshFor(project, maskPartId) : null;
    if (meshData && maskPart && maskMeshData && state.rig?.clipping?.enabled) {
      // 눈 클리핑: 홍채류는 흰자 클론 메시를 스텐실 마스크로 — 둘 다 격자 변형을 따른다
      // (강체 마스크는 AngleZ에서 홍채 이탈 — canvas2d에서 검증된 회귀)
      const container = new Container();
      const mesh = buildSimpleMesh(project, part, meshData, image);
      const maskMesh = buildSimpleMesh(project, maskPart, maskMeshData, state.images.get(maskPartId));
      container.addChild(maskMesh, mesh);
      container.mask = maskMesh;
      app.stage.addChild(container);
      nodes.set(part.id, { kind: "clipped", display: container, mesh, meshData, maskMesh, maskPartId, maskPart, maskMeshData });
    } else if (meshData) {
      const mesh = buildSimpleMesh(project, part, meshData, image);
      app.stage.addChild(mesh);
      nodes.set(part.id, { kind: "mesh", display: mesh, mesh, meshData });
    } else {
      const { texture, origin } = croppedTexture(image, part.bbox, project.canvas_size);
      const sprite = new Sprite(texture);
      const center = bboxCenter(part.bbox);
      sprite.pivot.set(center[0] - origin[0], center[1] - origin[1]);
      sprite.position.set(center[0], center[1]);
      app.stage.addChild(sprite);
      nodes.set(part.id, { kind: "sprite", display: sprite, center });
    }
    if (part.id === "face_base") addCoverSprites(project);
  }
}

function writeVertices(mesh, verts) {
  const data = mesh.vertices;
  for (let i = 0; i < verts.length; i += 1) {
    data[i * 2] = verts[i][0];
    data[i * 2 + 1] = verts[i][1];
  }
  mesh.geometry.getBuffer("aPosition").update();
}

function writeBaseVertices(mesh, meshData) {
  const data = mesh.vertices;
  for (let i = 0; i < meshData.vertices.length; i += 1) {
    data[i * 2] = meshData.vertices[i][0];
    data[i * 2 + 1] = meshData.vertices[i][1];
  }
  mesh.geometry.getBuffer("aPosition").update();
}

function applyRigidTransform(display, project, part) {
  const t = partTransform(project, part);
  const center = bboxCenter(part.bbox);
  display.pivot.set(center[0], center[1]);
  display.position.set(center[0] + t.translate[0], center[1] + t.translate[1]);
  display.rotation = (t.rotate * Math.PI) / 180;
  display.scale.set(t.scale[0], t.scale[1]);
  return t;
}

function resetTransform(display) {
  display.pivot.set(0, 0);
  display.position.set(0, 0);
  display.rotation = 0;
  display.scale.set(1, 1);
}

// ---- 눈꺼풀 커버: 기존 drawSocketCoverShape를 오프스크린 1회 렌더 → 스프라이트 텍스처 ----

const COVER_PAD = 16; // blur 번짐 여유

function addCoverSprites(project) {
  for (const side of ["L", "R"]) {
    const sprite = new Sprite(Texture.EMPTY);
    sprite.alpha = 0;
    app.stage.addChild(sprite);
    coverSprites.set(side, { sprite, key: null });
  }
}

function coverConfigFor(project, side) {
  const covers = state.rig?.eye_socket_covers;
  if (!covers?.enabled) return null;
  const config = covers[side];
  if (!config) return null;
  const bbox = config.bbox || inferredEyeSocketCoverBbox(project, side);
  return { config, bbox };
}

function updateCoverSprites(project) {
  for (const side of ["L", "R"]) {
    const entry = coverSprites.get(side);
    if (!entry) continue;
    const resolved = coverConfigFor(project, side);
    if (!resolved) {
      entry.sprite.alpha = 0;
      continue;
    }
    const { config, bbox } = resolved;
    const parameterId = side === "L" ? "ParamEyeLOpen" : "ParamEyeROpen";
    const openValue = state.parameters[parameterId] ?? 1;
    const start = config.fade_start ?? 0.96;
    const full = config.fade_full ?? 0.08;
    const maxOpacity = config.max_opacity ?? 0.98;
    const opacity = clamp(((start - openValue) / Math.max(start - full, 0.001)) * maxOpacity, 0, maxOpacity);
    entry.sprite.alpha = opacity;
    if (opacity <= 0.01) continue;
    const key = JSON.stringify([bbox, config]);
    if (entry.key !== key) {
      const [x, y, w, h] = bbox;
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.ceil(w + COVER_PAD * 2));
      off.height = Math.max(1, Math.ceil(h + COVER_PAD * 2));
      drawSocketCoverShape(off.getContext("2d"), [COVER_PAD, COVER_PAD, w, h], config, 1);
      entry.sprite.texture = Texture.from(off);
      entry.sprite.position.set(x - COVER_PAD, y - COVER_PAD);
      entry.key = key;
    }
  }
}

// ---- 프레임 렌더 ----

function drawPixi() {
  if (!app || !state.project) return;
  const project = state.project;
  beginLatticeFrame();
  const meshMode = state.rig?.render_mode === "mesh";
  const deformedCache = new Map(); // 흰자 변형 결과를 마스크 클론과 공유
  const vertsOf = (part, meshData) => {
    let verts = deformedCache.get(part.id);
    if (!verts) {
      verts = deformedVertices(project, part, meshData);
      deformedCache.set(part.id, verts);
    }
    return verts;
  };
  for (const part of project.parts) {
    const node = nodes.get(part.id);
    if (!node) continue;
    const opacity = partOpacity(project, part);
    if (node.kind === "sprite") {
      const t = applyRigidTransform(node.display, project, part);
      node.display.alpha = opacity * t.opacity;
      node.display.visible = node.display.alpha > 0.01;
      continue;
    }
    if (meshMode) {
      // 메시 경로: canvas2d의 drawPartMesh와 동일 의미 — partOpacity만, 정점은 격자 변형
      resetTransform(node.mesh);
      writeVertices(node.mesh, vertsOf(part, node.meshData));
      node.mesh.alpha = opacity;
      node.mesh.visible = opacity > 0.01;
      if (node.kind === "clipped") {
        resetTransform(node.maskMesh);
        writeVertices(node.maskMesh, vertsOf(node.maskPart, node.maskMeshData));
      }
    } else {
      // 스프라이트 경로: 기준 정점 + 강체 트랜스폼 (drawPart와 동일 의미)
      writeBaseVertices(node.mesh, node.meshData);
      const t = applyRigidTransform(node.mesh, project, part);
      node.mesh.alpha = opacity * t.opacity;
      node.mesh.visible = node.mesh.alpha > 0.01;
      if (node.kind === "clipped") {
        writeBaseVertices(node.maskMesh, node.maskMeshData);
        applyRigidTransform(node.maskMesh, project, node.maskPart);
      }
    }
  }
  updateCoverSprites(project);
  app.render();
}

function extractPixels(frame) {
  const options = { target: app.stage, resolution: 1 };
  if (frame) options.frame = new Rectangle(frame[0], frame[1], frame[2], frame[3]);
  const result = app.renderer.extract.pixels(options);
  // GetPixelsOutput {pixels,width,height} 또는 Uint8Array 단독 — 방어적 처리
  if (result?.pixels) return result;
  return { pixels: result, width: frame ? frame[2] : state.project.canvas_size[0], height: frame ? frame[3] : state.project.canvas_size[1] };
}

async function initPixi(project) {
  app = new Application();
  const params = new URLSearchParams(location.search);
  const transparent = params.get("transparent") === "1";
  // 방송 모드(?obs=1): 모델 캔버스 배경을 green screen(#00b140)으로 직접 칠한다 — OBS 크로마키용.
  // (CSS/iframe 투명 체인에 의존하지 않아 확실. transparent=1보다 OBS 호환이 좋다.)
  const obs = params.get("obs") === "1";
  await app.init({
    width: project.canvas_size[0],
    height: project.canvas_size[1],
    preference: "webgl",
    background: obs ? "#00b140" : "#f4f0e8",
    backgroundAlpha: (transparent && !obs) ? 0 : 1,
    autoStart: false,
    antialias: true,
  });
  buildScene(project);
  // canvas_origin: [x, y] — character.json으로 스테이지 전체 오프셋 (얼굴 중심 캔버스 센터 조정용)
  if (project.canvas_origin) {
    app.stage.position.set(project.canvas_origin[0] || 0, project.canvas_origin[1] || 0);
  }
  if (bgSprite && (obs || transparent)) bgSprite.visible = false;  // 베이지 배경판 제거 → green/투명 배경 노출
  state.pixiCanvas = app.canvas;
  state.pixiDraw = drawPixi;
  state.pixiExtract = extractPixels;
  return app;
}


export { initPixi, drawPixi, extractPixels };
