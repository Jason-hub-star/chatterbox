// 캔버스 렌더러. #preview-canvas에 그린다 — 서비스 플레이어가 그대로 쓴다.

import { assemblyStageAffine, beginLatticeFrame, deformedVertices, deformerTransform, ensureEyeSocketCoverConfig, ensureEyeSocketCovers, identityTransform, inferredEyeSocketCoverBbox, partOpacity, partTransform } from "../core/rig.js";
import { state } from "../core/state.js";
import { bboxCenter, clamp } from "../core/utils.js";
import { coverHandlePoints } from "../ui/pointer.js";
import { editableMeshForPart } from "../ui/rig_panel.js";

function draw() {
  if (state.rendererBackend === "pixi" && state.pixiDraw) {
    // PIXI-RENDER-001: GPU 백엔드에 위임, 에디터 오버레이만 별도 2d 캔버스에
    state.pixiDraw();
    drawPixiOverlay();
    return;
  }
  const canvas = document.querySelector("#preview-canvas");
  if (!canvas || !state.project) return;
  const ctx = canvas.getContext("2d");
  const project = state.project;
  const renderScale = state.renderScale || 1;
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0); // 좌표계는 2048 유지, 픽셀만 축소
  ctx.clearRect(0, 0, project.canvas_size[0], project.canvas_size[1]);
  ctx.fillStyle = "#f4f0e8";
  ctx.fillRect(0, 0, project.canvas_size[0], project.canvas_size[1]);

  beginLatticeFrame();
  const meshMode = state.rig?.render_mode === "mesh";
  const parts = [...project.parts].sort((a, b) => a.draw_order - b.draw_order);
  for (const part of parts) {
    if (meshMode && clippedByEyeWhite(part.id)) drawClippedEyePartMeshMode(ctx, project, part);
    else if (meshMode) drawPartMesh(ctx, project, part);
    else drawPart(ctx, project, part);
    if (part.id === "face_base") drawEyeSocketCovers(ctx, project);
  }
  if (state.overlays.deformers) drawDeformers(ctx, project);
  if (state.overlays.mesh) drawMeshes(ctx, project);
  if (state.activePanel === "rig" && state.rigTool === "cover") drawEyeCoverEditor(ctx, project);
}

// pixi 모드 에디터 오버레이: WebGL 캔버스 위에 겹친 #overlay-canvas(2d)에 기존 함수 재사용
function drawPixiOverlay() {
  const overlay = document.querySelector("#overlay-canvas");
  if (!overlay || !state.project) return;
  const project = state.project;
  const ctx = overlay.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, project.canvas_size[0], project.canvas_size[1]);
  const selected = project.parts.find((part) => part.id === state.selectedPartId);
  if (selected) {
    ctx.save();
    ctx.strokeStyle = "#ffcc33";
    ctx.lineWidth = 5;
    const [x, y, w, h] = selected.bbox;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
  if (state.overlays.deformers) drawDeformers(ctx, project);
  if (state.overlays.mesh) drawMeshes(ctx, project);
  if (state.activePanel === "rig" && state.rigTool === "cover") drawEyeCoverEditor(ctx, project);
}

function drawPart(ctx, project, part) {
  const image = state.images.get(part.id);
  if (!image) return;
  const transform = partTransform(project, part);
  const opacity = partOpacity(project, part);
  if (opacity <= 0.01 || transform.opacity <= 0.01) return;
  if (state.clippingPreview && clippedByEyeWhite(part.id)) {
    drawClippedEyePart(ctx, project, part, image, transform, opacity);
    return;
  }
  const center = bboxCenter(part.bbox);
  ctx.save();
  ctx.translate(center[0] + transform.translate[0], center[1] + transform.translate[1]);
  ctx.rotate((transform.rotate * Math.PI) / 180);
  ctx.scale(transform.scale[0], transform.scale[1]);
  ctx.globalAlpha = opacity * transform.opacity;
  ctx.drawImage(image, -center[0], -center[1], project.canvas_size[0], project.canvas_size[1]);
  if (part.id === state.selectedPartId) {
    ctx.strokeStyle = "#ffcc33";
    ctx.lineWidth = 5;
    const [x, y, w, h] = part.bbox;
    ctx.strokeRect(x - center[0], y - center[1], w, h);
  }
  ctx.restore();
}

// MESH-DEFORM-001: 삼각형 텍스처 매핑 렌더 — FFD 격자로 변형된 정점을 따라 파트가 "휜다"
function drawPartMesh(ctx, project, part) {
  const image = state.images.get(part.id);
  if (!image) return;
  const mesh = project.meshes.find((item) => item.part_id === part.id);
  if (!mesh || !mesh.triangles?.length) {
    drawPart(ctx, project, part);
    return;
  }
  const opacity = partOpacity(project, part);
  if (opacity <= 0.01) return;
  const verts = deformedVertices(project, part, mesh);
  // 고속 경로: 변위가 사실상 0이면 통짜 드로우 (중립 = 스프라이트와 픽셀 동일 보장)
  let maxDisp = 0;
  for (let i = 0; i < verts.length; i += 1) {
    const dx = Math.abs(verts[i][0] - mesh.vertices[i][0]);
    const dy = Math.abs(verts[i][1] - mesh.vertices[i][1]);
    if (dx > maxDisp) maxDisp = dx;
    if (dy > maxDisp) maxDisp = dy;
  }
  const drawSelection = () => {
    if (part.id !== state.selectedPartId) return;
    ctx.save();
    ctx.strokeStyle = "#ffcc33";
    ctx.lineWidth = 5;
    const [x, y, w, h] = part.bbox;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  };
  if (maxDisp < 0.05) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(image, 0, 0, project.canvas_size[0], project.canvas_size[1]);
    ctx.restore();
    drawSelection();
    return;
  }
  // 어파인 고속 경로: 파트 전체 변위가 하나의 어파인으로 근사되면 (소형 파트 대부분)
  // 삼각형 클립 없이 단일 변환 드로우 — 격자 위치는 그대로 따른다
  const src = mesh.vertices;
  {
    const n = src.length;
    const p0 = 0;
    const p1 = Math.min(n - 1, Math.max(1, Math.round(Math.sqrt(n)) - 1)); // 첫 행 끝
    const p2 = n - 1;
    const s0 = src[p0]; const s1 = src[p1]; const s2 = src[p2];
    const d0 = verts[p0]; const d1 = verts[p1]; const d2 = verts[p2];
    const denom = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
    if (Math.abs(denom) > 1e-6) {
      const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / denom;
      const b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / denom;
      const c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / denom;
      const d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / denom;
      const e = d0[0] - a * s0[0] - c * s0[1];
      const f = d0[1] - b * s0[0] - d * s0[1];
      let residual = 0;
      for (let i = 0; i < n; i += 1) {
        const px = a * src[i][0] + c * src[i][1] + e;
        const py = b * src[i][0] + d * src[i][1] + f;
        residual = Math.max(residual, Math.abs(px - verts[i][0]), Math.abs(py - verts[i][1]));
        if (residual > 0.75) break;
      }
      if (residual <= 0.75) {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.transform(a, b, c, d, e, f);
        const [bx, by, bw, bh] = part.bbox;
        ctx.drawImage(image, bx, by, bw, bh, bx, by, bw, bh);
        ctx.restore();
        drawSelection();
        return;
      }
    }
  }
  ctx.save();
  ctx.globalAlpha = opacity;
  for (const [i0, i1, i2] of mesh.triangles) {
    const s0 = src[i0]; const s1 = src[i1]; const s2 = src[i2];
    const d0 = verts[i0]; const d1 = verts[i1]; const d2 = verts[i2];
    // 어파인 행렬: src 삼각형 → dst 삼각형
    const denom = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
    if (Math.abs(denom) < 1e-6) continue;
    const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / denom;
    const b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / denom;
    const c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / denom;
    const d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / denom;
    const e = d0[0] - a * s0[0] - c * s0[1];
    const f = d0[1] - b * s0[0] - d * s0[1];
    // 이음새 방지: 삼각형을 무게중심 기준 1.5% 확장해 클립
    const cx = (d0[0] + d1[0] + d2[0]) / 3;
    const cy = (d0[1] + d1[1] + d2[1]) / 3;
    const grow = (p) => [cx + (p[0] - cx) * 1.015, cy + (p[1] - cy) * 1.015];
    const g0 = grow(d0); const g1 = grow(d1); const g2 = grow(d2);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(g0[0], g0[1]);
    ctx.lineTo(g1[0], g1[1]);
    ctx.lineTo(g2[0], g2[1]);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    // 성능: 삼각형 소스 bbox 부분만 blit (풀캔버스 blit이 렌더 시간의 주범)
    const pad = 2;
    const sbx = Math.max(0, Math.min(s0[0], s1[0], s2[0]) - pad);
    const sby = Math.max(0, Math.min(s0[1], s1[1], s2[1]) - pad);
    const sbw = Math.min(project.canvas_size[0], Math.max(s0[0], s1[0], s2[0]) + pad) - sbx;
    const sbh = Math.min(project.canvas_size[1], Math.max(s0[1], s1[1], s2[1]) + pad) - sby;
    if (sbw > 0 && sbh > 0) ctx.drawImage(image, sbx, sby, sbw, sbh, sbx, sby, sbw, sbh);
    ctx.restore();
  }
  ctx.restore();
  drawSelection();
}

// 메시 모드 클리핑: 홍채와 마스크(흰자) 모두 격자 변형으로 그린다 — 강체 경로를 쓰면
// AngleZ에서 홍채가 자기 중심 자전으로 눈에서 이탈한다 (주인님 H2 발견)
let clipMeshCanvasA = null;
let clipMeshCanvasB = null;

function drawClippedEyePartMeshMode(ctx, project, part) {
  const pairs = state.rig?.clipping?.pairs || {};
  const maskPartId = Object.keys(pairs).find((key) => (pairs[key] || []).includes(part.id));
  const maskPart = maskPartId ? project.parts.find((item) => item.id === maskPartId) : null;
  if (!maskPart) {
    drawPartMesh(ctx, project, part);
    return;
  }
  const W = project.canvas_size[0];
  const H = project.canvas_size[1];
  if (!clipMeshCanvasA || clipMeshCanvasA.width !== W) {
    clipMeshCanvasA = document.createElement("canvas");
    clipMeshCanvasA.width = W;
    clipMeshCanvasA.height = H;
    clipMeshCanvasB = document.createElement("canvas");
    clipMeshCanvasB.width = W;
    clipMeshCanvasB.height = H;
  }
  const a = clipMeshCanvasA.getContext("2d");
  a.globalCompositeOperation = "source-over";
  a.globalAlpha = 1;
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.clearRect(0, 0, W, H);
  drawPartMesh(a, project, part); // 홍채: 격자 변형 + EyeBall 파트 바인딩 포함
  const b = clipMeshCanvasB.getContext("2d");
  b.globalCompositeOperation = "source-over";
  b.globalAlpha = 1;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.clearRect(0, 0, W, H);
  const prevSelected = state.selectedPartId;
  state.selectedPartId = null; // 마스크 렌더에 선택 박스 금지
  drawPartMesh(b, project, maskPart); // 흰자: 같은 격자 변형 → 마스크가 함께 움직인다
  state.selectedPartId = prevSelected;
  a.globalCompositeOperation = "destination-in";
  a.drawImage(clipMeshCanvasB, 0, 0);
  ctx.drawImage(clipMeshCanvasA, 0, 0);
}

let clipTempCanvas = null; // 클리핑용 임시캔버스 캐시 (매 호출 신규 할당이 프레임 끊김의 주범이었다)

function drawClippedEyePart(ctx, project, part, image, transform, opacity) {
  const pairs = state.rig?.clipping?.pairs || {};
  const maskPartId =
    Object.keys(pairs).find((key) => (pairs[key] || []).includes(part.id)) ||
    (part.id.startsWith("eye_L_") ? "eye_L_white" : "eye_R_white");
  const maskImage = state.images.get(maskPartId);
  if (!maskImage) return;
  if (!clipTempCanvas || clipTempCanvas.width !== project.canvas_size[0]) {
    clipTempCanvas = document.createElement("canvas");
    clipTempCanvas.width = project.canvas_size[0];
    clipTempCanvas.height = project.canvas_size[1];
  }
  const temp = clipTempCanvas;
  const tempCtx = temp.getContext("2d");
  tempCtx.globalCompositeOperation = "source-over"; // 이전 호출의 destination-in 잔류 해제
  tempCtx.globalAlpha = 1;
  tempCtx.clearRect(0, 0, temp.width, temp.height);
  const center = bboxCenter(part.bbox);
  tempCtx.save();
  tempCtx.translate(center[0] + transform.translate[0], center[1] + transform.translate[1]);
  tempCtx.rotate((transform.rotate * Math.PI) / 180);
  tempCtx.scale(transform.scale[0], transform.scale[1]);
  tempCtx.globalAlpha = opacity * transform.opacity;
  tempCtx.drawImage(image, -center[0], -center[1], project.canvas_size[0], project.canvas_size[1]);
  tempCtx.restore();
  tempCtx.globalCompositeOperation = "destination-in";
  // 자기리뷰 수정: 마스크(흰자)도 제 트랜스폼을 따라 이동해야 한다 — 원위치 고정이면
  // 머리 이동 시 홍채가 옛 흰자 위치로 잘리는 잠복 버그 (v21 시절부터)
  const maskPart = project.parts.find((item) => item.id === maskPartId);
  const maskTransform = maskPart ? partTransform(project, maskPart) : identityTransform();
  const maskCenter = maskPart ? bboxCenter(maskPart.bbox) : [0, 0];
  tempCtx.save();
  tempCtx.translate(maskCenter[0] + maskTransform.translate[0], maskCenter[1] + maskTransform.translate[1]);
  tempCtx.rotate((maskTransform.rotate * Math.PI) / 180);
  tempCtx.scale(maskTransform.scale[0], maskTransform.scale[1]);
  tempCtx.drawImage(maskImage, -maskCenter[0], -maskCenter[1], project.canvas_size[0], project.canvas_size[1]);
  tempCtx.restore();
  ctx.drawImage(temp, 0, 0);
}

function drawEyeSocketCovers(ctx, project) {
  const covers = state.rig?.eye_socket_covers;
  if (!covers?.enabled) return;
  for (const side of ["L", "R"]) {
    const config = covers[side];
    if (!config) continue;
    const parameterId = side === "L" ? "ParamEyeLOpen" : "ParamEyeROpen";
    const openValue = state.parameters[parameterId] ?? 1;
    const start = config.fade_start ?? 0.96;
    const full = config.fade_full ?? 0.08;
    const opacity = clamp(((start - openValue) / Math.max(start - full, 0.001)) * (config.max_opacity ?? 0.98), 0, config.max_opacity ?? 0.98);
    if (opacity <= 0.01) continue;
    const bbox = config.bbox || inferredEyeSocketCoverBbox(project, side);
    drawSocketCoverShape(ctx, bbox, config, opacity);
  }
}

function drawSocketCoverShape(ctx, bbox, config, opacity) {
  const [x, y, w, h] = bbox;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = (w / 2) * (config.scale_x ?? 0.92);
  const ry = (h / 2) * (config.scale_y ?? 0.66);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.filter = `blur(${config.blur ?? 2}px)`;
  const gradient = ctx.createLinearGradient(cx, y, cx, y + h);
  gradient.addColorStop(0, config.upper_color || "#f8ded2");
  gradient.addColorStop(0.55, config.mid_color || "#f4cfc3");
  gradient.addColorStop(1, config.lower_color || "#e7b6aa");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "none";
  ctx.globalAlpha = Math.min(1, opacity * 0.42);
  ctx.fillStyle = config.lower_color || "#e7b6aa";
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.32, rx * 0.74, ry * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEyeCoverEditor(ctx, project) {
  const covers = ensureEyeSocketCovers(project);
  ctx.save();
  ctx.lineWidth = 4;
  ctx.font = "28px system-ui";
  for (const side of ["L", "R"]) {
    const config = ensureEyeSocketCoverConfig(project, side);
    const [x, y, w, h] = config.bbox;
    const selected = side === state.selectedCoverSide;
    ctx.strokeStyle = selected ? "rgba(255, 204, 51, 0.98)" : "rgba(66, 170, 255, 0.72)";
    ctx.fillStyle = selected ? "rgba(255, 204, 51, 0.12)" : "rgba(66, 170, 255, 0.08)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = selected ? "rgba(255, 204, 51, 0.98)" : "rgba(66, 170, 255, 0.9)";
    for (const point of coverHandlePoints(config.bbox)) {
      ctx.fillRect(point.x - 8, point.y - 8, 16, 16);
    }
    ctx.fillText(`${side} eye cover`, x, Math.max(34, y - 12));
  }
  if (covers.enabled === false) {
    ctx.fillStyle = "rgba(255, 80, 48, 0.9)";
    ctx.fillText("eye cover disabled", 34, 54);
  }
  ctx.restore();
}

function clippedByEyeWhite(partId) {
  if (!state.rig?.clipping?.enabled) return false;
  const pairs = state.rig.clipping.pairs || {};
  return Object.values(pairs).some((partIds) => partIds.includes(partId));
}

// ASSEMBLY-SHOWREEL-001: 리깅 오버레이가 한 번에 안 뜨고 순차적으로 "입혀지게" — 항목별 페이드 0~1
function overlayReveal(index, count) {
  const ov = state.assembly?.overlayProgress;
  if (ov === undefined || ov === null) return 1; // 에디터 등 일반 오버레이는 즉시 전체
  const span = 0.4; // 동시에 등장하는 폭
  const start = (index / Math.max(count, 1)) * (1 - span);
  return clamp((ov - start) / span, 0, 1);
}

function drawMeshes(ctx, project) {
  ctx.save();
  ctx.lineWidth = 2;
  project.meshes.forEach((mesh, meshIndex) => {
    const part = project.parts.find((candidate) => candidate.id === mesh.part_id);
    if (!part) return;
    const reveal = overlayReveal(meshIndex, project.meshes.length);
    if (reveal <= 0) return;
    const editableMesh = editableMeshForPart(project, part.id) || mesh;
    const transform = partTransform(project, part);
    const center = bboxCenter(part.bbox);
    ctx.save();
    ctx.globalAlpha = reveal;
    ctx.translate(center[0] + transform.translate[0], center[1] + transform.translate[1]);
    ctx.rotate((transform.rotate * Math.PI) / 180);
    ctx.scale(transform.scale[0], transform.scale[1]);
    ctx.translate(-center[0], -center[1]);
    ctx.strokeStyle = part.id === state.selectedPartId ? "rgba(255, 204, 51, 0.95)" : "rgba(0, 235, 190, 0.45)";
    ctx.fillStyle = part.id === state.selectedPartId ? "rgba(255, 91, 51, 0.95)" : "rgba(255,255,255,0.7)";
    for (const triangle of editableMesh.triangles) {
      ctx.beginPath();
      const a = editableMesh.vertices[triangle[0]];
      ctx.moveTo(a[0], a[1]);
      for (const index of triangle.slice(1)) {
        const v = editableMesh.vertices[index];
        ctx.lineTo(v[0], v[1]);
      }
      ctx.closePath();
      ctx.stroke();
    }
    if (part.id === state.selectedPartId) {
      editableMesh.vertices.forEach((vertex, index) => {
        const isDragged = state.draggedVertex?.partId === part.id && state.draggedVertex.vertexIndex === index;
        ctx.fillStyle = isDragged ? "rgba(255, 80, 48, 1)" : "rgba(255, 204, 51, 0.95)";
        ctx.fillRect(vertex[0] - 5, vertex[1] - 5, 10, 10);
      });
      if (state.clippingPreview && (part.id === "eye_L_white" || part.id === "eye_R_white")) {
        ctx.strokeStyle = "rgba(66, 170, 255, 0.95)";
        ctx.lineWidth = 4;
        const [x, y, w, h] = part.bbox;
        ctx.strokeRect(x, y, w, h);
      }
    }
    ctx.restore();
  });
  ctx.restore();
}

function drawDeformers(ctx, project) {
  ctx.save();
  // ASSEMBLY-SHOWREEL-001: 디포머 박스는 partTransform을 안 쓰므로, 조립 무대 스케일을 전역으로 입힌다
  const stage = assemblyStageAffine();
  if (stage) {
    ctx.translate(stage.tx, stage.ty);
    ctx.scale(stage.s, stage.s);
  }
  ctx.lineWidth = 5;
  ctx.font = "34px system-ui";
  project.deformers.forEach((deformer, deformerIndex) => {
    // bounds 규약 = [x, y, width, height] (build_autorig_rig_v0 / analyze_rig_cohesion). 과거 [l,t,r,b] 오독 버그 수정.
    const [bx, by, bw, bh] = deformer.bounds;
    // 조립 쇼츠 오버레이(stage)에선 전체 캔버스를 덮는 글로벌 워프(root/head_z/front_hair)는 어수선해서 생략
    if (stage && bw >= project.canvas_size[0] && bh >= project.canvas_size[1]) return;
    const reveal = overlayReveal(deformerIndex, project.deformers.length); // 순차 등장
    if (reveal <= 0) return;
    const transform = deformerTransform(project, deformer);
    const pivot = deformer.pivot;
    ctx.save();
    ctx.globalAlpha = reveal;
    ctx.translate(pivot[0] + transform.translate[0], pivot[1] + transform.translate[1]);
    ctx.rotate((transform.rotate * Math.PI) / 180);
    ctx.scale(transform.scale[0], transform.scale[1]);
    ctx.translate(-pivot[0], -pivot[1]);
    ctx.strokeStyle = deformer.type === "rotation" ? "rgba(255, 126, 51, 0.85)" : "rgba(80, 220, 120, 0.8)";
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText(deformer.id, bx + 8, by + 38);
    ctx.restore();
  });
  ctx.restore();
}

function applyCanvasViewZoom(canvas) {
  if (!state.project) return;
  canvas.style.width = `${Math.round(state.project.canvas_size[0] * state.viewZoom)}px`;
  // ZOOM-TO-CURSOR-001: 팬은 CSS transform(중심 기준 변위)로 — 스크롤 컨테이너에 의존하지 않아
  // 에디터·드라이브(iframe) 어디서든 커서 기준 줌/팬이 동일하게 작동한다.
  const tf = state.panX || state.panY ? `translate(${state.panX}px, ${state.panY}px)` : "";
  canvas.style.transform = tf;
  const overlay = document.querySelector("#overlay-canvas");
  if (overlay) {
    overlay.style.width = canvas.style.width; // pixi 오버레이는 본 캔버스와 동일 표시 폭
    overlay.style.transform = tf;
  }
}

function defaultViewZoom() {
  return window.innerWidth <= 980 ? 0.18 : 0.42;
}


export { draw, drawPart, drawClippedEyePart, drawEyeSocketCovers, drawSocketCoverShape, drawEyeCoverEditor, clippedByEyeWhite, drawMeshes, drawDeformers, drawPixiOverlay, applyCanvasViewZoom, defaultViewZoom };
