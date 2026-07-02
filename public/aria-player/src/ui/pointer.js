// 캔버스 포인터/휠 인터랙션.

import { applyCanvasViewZoom, draw } from "../core/draw.js";
import { ensureEyeSocketCoverConfig } from "../core/rig.js";
import { state } from "../core/state.js";
import { clamp } from "../core/utils.js";
import { render, setViewZoom } from "../ui/components.js";
import { editableMeshForPart, ensureMeshOverride } from "../ui/rig_panel.js";

function canvasPoint(event) {
  const canvas = document.querySelector("#preview-canvas");
  const rect = canvas.getBoundingClientRect();
  return [
    ((event.clientX - rect.left) / rect.width) * canvas.width,
    ((event.clientY - rect.top) / rect.height) * canvas.height,
  ];
}

// ZOOM-TO-CURSOR-001: 휠 줌이 커서 아래 지점을 고정. CSS transform(중심기준 pan 변위)로 처리해
// 스크롤 컨테이너에 의존하지 않음 → 에디터(?renderer=pixi)·드라이브(iframe) 어디서나 동일 작동.
// 공식: 캔버스 중심 기준 커서 분율 fx에 대해 deltaPan = (fx-0.5)*현재표시폭*(1 - new/old).
function onCanvasWheel(event) {
  event.preventDefault();
  const canvas = document.querySelector("#preview-canvas");
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  const fx = r.width ? (event.clientX - r.left) / r.width : 0.5;
  const fy = r.height ? (event.clientY - r.top) / r.height : 0.5;
  const oldZoom = state.viewZoom;
  const newZoom = clamp(oldZoom + (event.deltaY < 0 ? 0.06 : -0.06), 0.22, 1.1);
  if (newZoom === oldZoom) return;
  const f = newZoom / oldZoom;
  state.panX += (fx - 0.5) * r.width * (1 - f);
  state.panY += (fy - 0.5) * r.height * (1 - f);
  state.viewZoom = newZoom;
  applyCanvasViewZoom(canvas);
  draw();
}

// PAN-001: 가운데 버튼 드래그로 캔버스 팬(확대 후 원하는 부위로 이동). pan 변위(transform) 기반이라
// 드라이브/iframe에서도 동작. 맥 트랙패드는 두 손가락 스크롤로도 이동 가능.
let panState = null;
function onCanvasPanDown(event) {
  if (event.button !== 1) return false; // 가운데 버튼만
  event.preventDefault();
  panState = { x: event.clientX, y: event.clientY, px: state.panX, py: state.panY };
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* test env */ }
  return true;
}
function onCanvasPanMove(event) {
  if (!panState) return false;
  state.panX = panState.px + (event.clientX - panState.x);
  state.panY = panState.py + (event.clientY - panState.y);
  const canvas = document.querySelector("#preview-canvas");
  if (canvas) applyCanvasViewZoom(canvas);
  return true;
}
function onCanvasPanUp() {
  if (!panState) return false;
  panState = null;
  return true;
}

function onCanvasPointerDown(event) {
  if (onCanvasPanDown(event)) return; // 가운데 버튼 = 팬 (편집/선택보다 우선)
  if (state.activePanel !== "rig" || !state.project) return;
  if (state.rigTool === "cover") {
    onEyeCoverPointerDown(event);
    return;
  }
  if (!state.selectedPartId) return;
  const part = state.project.parts.find((item) => item.id === state.selectedPartId);
  if (!part || !part.id.startsWith("eye_")) return;
  const mesh = editableMeshForPart(state.project, part.id);
  if (!mesh) return;
  const point = canvasPoint(event);
  let best = null;
  mesh.vertices.forEach((vertex, index) => {
    const distance = Math.hypot(vertex[0] - point[0], vertex[1] - point[1]);
    if (distance <= 28 && (!best || distance < best.distance)) best = { vertexIndex: index, distance };
  });
  if (!best) return;
  ensureMeshOverride(part.id);
  state.draggedVertex = { partId: part.id, vertexIndex: best.vertexIndex };
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic browser tests do not always create an active pointer first.
  }
  render();
  draw();
}

function onCanvasPointerMove(event) {
  if (onCanvasPanMove(event)) return; // 팬 진행 중
  if (state.draggedCover) {
    onEyeCoverPointerMove(event);
    return;
  }
  if (!state.draggedVertex || !state.rig) return;
  const override = ensureMeshOverride(state.draggedVertex.partId);
  if (!override) return;
  const point = canvasPoint(event);
  override.vertices[state.draggedVertex.vertexIndex] = [Math.round(point[0]), Math.round(point[1])];
  override.updated_at = new Date().toISOString();
  draw();
}

function onCanvasPointerUp() {
  if (onCanvasPanUp()) return; // 팬 종료
  if (state.draggedCover) {
    state.rigStatus = `${state.draggedCover.side} 눈 영역 편집됨`;
    state.draggedCover = null;
    render();
    draw();
    return;
  }
  if (!state.draggedVertex) return;
  state.rigStatus = `${state.draggedVertex.partId} 정점 ${state.draggedVertex.vertexIndex} 편집됨`;
  state.draggedVertex = null;
  render();
  draw();
}

function onEyeCoverPointerDown(event) {
  if (!state.rig || !state.project) return;
  const point = canvasPoint(event);
  const hit = hitEyeCover(point);
  if (!hit) return;
  state.selectedCoverSide = hit.side;
  const config = ensureEyeSocketCoverConfig(state.project, hit.side);
  state.draggedCover = {
    side: hit.side,
    handle: hit.handle,
    startPoint: point,
    startBbox: [...config.bbox],
  };
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic browser tests do not always create an active pointer first.
  }
  render();
  draw();
}

function onEyeCoverPointerMove(event) {
  const drag = state.draggedCover;
  if (!drag || !state.project) return;
  const point = canvasPoint(event);
  const dx = Math.round(point[0] - drag.startPoint[0]);
  const dy = Math.round(point[1] - drag.startPoint[1]);
  const config = ensureEyeSocketCoverConfig(state.project, drag.side);
  config.bbox = resizedCoverBbox(drag.startBbox, drag.handle, dx, dy, state.project.canvas_size);
  draw();
}

function hitEyeCover(point) {
  for (const side of [state.selectedCoverSide, state.selectedCoverSide === "L" ? "R" : "L"]) {
    const config = ensureEyeSocketCoverConfig(state.project, side);
    for (const handle of coverHandlePoints(config.bbox)) {
      if (Math.abs(point[0] - handle.x) <= 24 && Math.abs(point[1] - handle.y) <= 24) {
        return { side, handle: handle.id };
      }
    }
    const [x, y, w, h] = config.bbox;
    if (point[0] >= x && point[0] <= x + w && point[1] >= y && point[1] <= y + h) {
      return { side, handle: "move" };
    }
  }
  return null;
}

function coverHandlePoints(bbox) {
  const [x, y, w, h] = bbox;
  return [
    { id: "nw", x, y },
    { id: "ne", x: x + w, y },
    { id: "sw", x, y: y + h },
    { id: "se", x: x + w, y: y + h },
  ];
}

function resizedCoverBbox(bbox, handle, dx, dy, canvasSize) {
  let [x, y, w, h] = bbox;
  if (handle === "move") {
    x += dx;
    y += dy;
  } else {
    if (handle.includes("w")) {
      x += dx;
      w -= dx;
    }
    if (handle.includes("e")) w += dx;
    if (handle.includes("n")) {
      y += dy;
      h -= dy;
    }
    if (handle.includes("s")) h += dy;
  }
  const minW = 30;
  const minH = 20;
  if (w < minW) {
    if (handle.includes("w")) x -= minW - w;
    w = minW;
  }
  if (h < minH) {
    if (handle.includes("n")) y -= minH - h;
    h = minH;
  }
  x = clamp(Math.round(x), 0, canvasSize[0] - minW);
  y = clamp(Math.round(y), 0, canvasSize[1] - minH);
  w = clamp(Math.round(w), minW, canvasSize[0] - x);
  h = clamp(Math.round(h), minH, canvasSize[1] - y);
  return [x, y, w, h];
}


export { canvasPoint, onCanvasWheel, onCanvasPointerDown, onCanvasPointerMove, onCanvasPointerUp, onEyeCoverPointerDown, onEyeCoverPointerMove, hitEyeCover, coverHandlePoints, resizedCoverBbox };
