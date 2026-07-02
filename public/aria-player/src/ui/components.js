// 에디터 UI 컴포넌트 (사이드바/스테이지/인스펙터/컨트롤).

import { applyCanvasViewZoom, draw } from "../core/draw.js";
import { resetOtherPreviewParameterGroups, setParameterValue } from "../core/rig.js";
import { PARAM_LABELS, state } from "../core/state.js";
import { clamp, escapeHtml, formatValue, groupBy } from "../core/utils.js";
import { app } from "../ui/dom.js";
import { onCanvasPointerDown, onCanvasPointerMove, onCanvasPointerUp, onCanvasWheel } from "../ui/pointer.js";
import { RigPanel, ensureRigEyeSelection } from "../ui/rig_panel.js";

function render() {
  const project = state.project;
  app.replaceChildren();
  const shell = document.createElement("div");
  shell.className = "app-shell";
  shell.append(Sidebar(project), Stage(project), Inspector(project));
  app.append(shell);
}

function Sidebar(project) {
  const aside = document.createElement("aside");
  aside.className = "sidebar";

  const title = document.createElement("div");
  title.className = "panel-title";
  title.innerHTML = `<h1>Mini Cubism v0</h1><p>${escapeHtml(project.experiment_id)}</p>`;
  aside.append(title);

  const grouped = groupBy(project.parts, (part) => part.folder);
  for (const [folder, parts] of Object.entries(grouped)) {
    const section = document.createElement("section");
    section.className = "part-group";
    const h2 = document.createElement("h2");
    h2.textContent = `${folder} ${parts.length}`;
    section.append(h2);
    for (const part of [...parts].sort((a, b) => a.draw_order - b.draw_order)) {
      const button = document.createElement("button");
      button.className = `part-row ${part.id === state.selectedPartId ? "active" : ""}`;
      button.innerHTML = `<span>${escapeHtml(part.display_name)}</span><small>${part.draw_order}</small>`;
      button.addEventListener("click", () => {
        state.selectedPartId = part.id;
        render();
        draw();
      });
      section.append(button);
    }
    aside.append(section);
  }
  return aside;
}

function Stage(project) {
  const stage = document.createElement("main");
  stage.className = "stage";

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  toolbar.append(
    ToggleButton("Preview", state.activePanel === "preview", () => {
      state.activePanel = "preview";
      render();
      draw();
    }),
    ToggleButton("Rig", state.activePanel === "rig", () => {
      state.activePanel = "rig";
      state.overlays.mesh = true;
      state.rigTool = state.rigTool || "mesh";
      ensureRigEyeSelection(project);
      render();
      draw();
    }),
    ToggleButton("Mesh", state.overlays.mesh, () => {
      state.overlays.mesh = !state.overlays.mesh;
      render();
      draw();
    }),
    ToggleButton("Deformers", state.overlays.deformers, () => {
      state.overlays.deformers = !state.overlays.deformers;
      render();
      draw();
    }),
    ToggleButton("Clip", state.clippingPreview, () => {
      state.clippingPreview = !state.clippingPreview;
      render();
      draw();
    }),
    // PANEL-COLLAPSE-001: 사이드 패널(파츠/파라미터) 접기 → 캔버스 확대 (줌/팬으로 부위 확인 편의)
    ToggleButton(state.panelsCollapsed ? "패널 펼치기" : "패널 접기", state.panelsCollapsed, () => {
      state.panelsCollapsed = !state.panelsCollapsed;
      document.body.classList.toggle("panels-collapsed", state.panelsCollapsed);
      render();
      const canvas = document.querySelector("#preview-canvas");
      if (canvas) applyCanvasViewZoom(canvas);
      draw();
    }),
    ViewZoomControl(),
    Chip(`${project.parts.length} parts`),
    Chip(`${project.deformers.length} deformers`),
    Chip(`${project.keyform_bindings.length} bindings`),
  );

  const wrap = document.createElement("div");
  wrap.className = "canvas-wrap";
  // pixi 백엔드: WebGL 컨텍스트가 붙은 영속 캔버스를 재부착 — 새로 만들면 씬이 날아간다
  const usePixi = state.rendererBackend === "pixi" && state.pixiCanvas;
  const canvas = usePixi ? state.pixiCanvas : document.createElement("canvas");
  canvas.id = "preview-canvas";
  if (!usePixi) {
    const renderScale = state.renderScale || 1;
    canvas.width = Math.round(project.canvas_size[0] * renderScale);
    canvas.height = Math.round(project.canvas_size[1] * renderScale);
  }
  applyCanvasViewZoom(canvas);
  if (!canvas.__wired) {
    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    canvas.addEventListener("pointermove", onCanvasPointerMove);
    canvas.addEventListener("pointerup", onCanvasPointerUp);
    canvas.addEventListener("pointerleave", onCanvasPointerUp);
    canvas.addEventListener("wheel", onCanvasWheel, { passive: false });
    canvas.__wired = true; // 영속 캔버스 재부착 시 리스너 중복 방지
  }
  wrap.append(canvas);
  if (usePixi) {
    const overlay = document.createElement("canvas");
    overlay.id = "overlay-canvas";
    overlay.width = project.canvas_size[0];
    overlay.height = project.canvas_size[1];
    overlay.style.width = canvas.style.width;
    wrap.append(overlay);
  }
  stage.append(toolbar, wrap);
  return stage;
}

function Inspector(project) {
  const aside = document.createElement("aside");
  aside.className = "inspector";

  if (state.activePanel === "rig") {
    aside.append(RigPanel(project));
    return aside;
  }

  const section = document.createElement("section");
  section.className = "control-card";
  const h2 = document.createElement("h2");
  h2.textContent = "Parameters";
  section.append(h2);
  for (const param of project.parameters.filter((item) => !isPreviewParameterHidden(project, item.id))) {
    section.append(ParameterControl(param));
  }
  aside.append(section);

  const hidden = hiddenPreviewParameters(project);
  if (hidden.length) {
    const hiddenSection = document.createElement("section");
    hiddenSection.className = "control-card note";
    hiddenSection.textContent = `Hidden unsupported controls: ${hidden.join(", ")}`;
    aside.append(hiddenSection);
  }

  const selected = project.parts.find((part) => part.id === state.selectedPartId);
  if (selected) {
    const info = document.createElement("section");
    info.className = "control-card";
    info.innerHTML = `
      <h2>Selected</h2>
      <dl>
        <dt>Part</dt><dd>${escapeHtml(selected.id)}</dd>
        <dt>Folder</dt><dd>${escapeHtml(selected.folder)}</dd>
        <dt>BBox</dt><dd>${selected.bbox.join(", ")}</dd>
        <dt>Alpha</dt><dd>${selected.alpha_coverage}</dd>
      </dl>
    `;
    aside.append(info);
  }

  const note = document.createElement("section");
  note.className = "control-card note";
  note.textContent = "v0 validates local mesh/deformer/keyform preview only. Glue remains an empty fixture-backed placeholder.";
  aside.append(note);
  return aside;
}

function ParameterControl(param) {
  const row = document.createElement("label");
  row.className = "param-row";
  row.dataset.paramId = param.id;
  const value = state.parameters[param.id] ?? param.default;
  row.innerHTML = `
    <span>${escapeHtml(PARAM_LABELS[param.id] || param.id)}</span>
    <output>${formatValue(value)}</output>
  `;
  const input = document.createElement("input");
  input.type = "range";
  input.min = param.min;
  input.max = param.max;
  input.step = param.max - param.min <= 2 ? 0.01 : 1;
  input.value = value;
  input.addEventListener("input", () => {
    resetOtherPreviewParameterGroups(param.id);
    setParameterValue(param.id, Number(input.value));
    syncParameterControls();
    draw();
  });
  row.append(input);
  return row;
}

function hiddenPreviewParameters(project) {
  return project.parameters
    .filter((param) => isPreviewParameterHidden(project, param.id))
    .map((param) => param.id);
}

function isPreviewParameterHidden(project, parameterId) {
  return Boolean(project.unsupported_parameters?.[parameterId]?.hide_in_preview);
}

function ToggleButton(label, active, onClick) {
  const button = document.createElement("button");
  button.className = `tool-button ${active ? "active" : ""}`;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function Chip(text) {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = text;
  return chip;
}

function SmallButton(label, onClick) {
  const button = document.createElement("button");
  button.className = "small-button";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function ViewZoomControl() {
  const wrap = document.createElement("div");
  wrap.className = "view-zoom-control";
  const out = document.createElement("output");
  out.textContent = `${Math.round(state.viewZoom * 100)}%`;
  const minus = SmallButton("-", () => setViewZoom(state.viewZoom - 0.05));
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0.22";
  input.max = "1.1";
  input.step = "0.01";
  input.value = state.viewZoom;
  input.title = "model view zoom";
  input.addEventListener("input", () => {
    setViewZoom(Number(input.value), false);
    out.textContent = `${Math.round(state.viewZoom * 100)}%`;
  });
  const plus = SmallButton("+", () => setViewZoom(state.viewZoom + 0.05));
  wrap.append(minus, input, plus, out);
  return wrap;
}

function setViewZoom(value, rerender = true) {
  state.viewZoom = clamp(Number(value) || 0.42, 0.22, 1.1);
  const canvas = document.querySelector("#preview-canvas");
  if (canvas) applyCanvasViewZoom(canvas);
  if (rerender) render();
  draw();
}

function SegmentButton(label, active, onClick) {
  const button = document.createElement("button");
  button.className = `segment-button ${active ? "active" : ""}`;
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function NumberField(label, value, step, onInput) {
  const wrap = document.createElement("label");
  wrap.className = "number-field";
  wrap.innerHTML = `<span>${escapeHtml(label)}</span>`;
  const input = document.createElement("input");
  input.type = "number";
  input.step = step;
  input.value = value;
  input.addEventListener("input", () => onInput(Number(input.value)));
  wrap.append(input);
  return wrap;
}

function RangeField(label, value, min, max, step, onInput) {
  const row = document.createElement("label");
  row.className = "param-row compact";
  row.innerHTML = `<span>${escapeHtml(label)}</span><output>${formatValue(value)}</output>`;
  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = value;
  input.addEventListener("input", () => {
    const next = Number(input.value);
    row.querySelector("output").textContent = formatValue(next);
    onInput(next);
  });
  row.append(input);
  return row;
}

function syncParameterControls() {
  for (const [parameterId, value] of Object.entries(state.parameters)) {
    const row = document.querySelector(`.param-row[data-param-id="${CSS.escape(parameterId)}"]`);
    if (!row) continue;
    const input = row.querySelector("input");
    const output = row.querySelector("output");
    if (input) input.value = String(value);
    if (output) output.textContent = formatValue(value);
  }
}


export { render, Sidebar, Stage, Inspector, ParameterControl, hiddenPreviewParameters, isPreviewParameterHidden, ToggleButton, Chip, SmallButton, ViewZoomControl, setViewZoom, SegmentButton, NumberField, RangeField, syncParameterControls };
