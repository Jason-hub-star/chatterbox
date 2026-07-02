// 리그 편집 패널과 키폼 캡처/저장 액션.

import { draw } from "../core/draw.js";
import { bindingKey, bindingTransformFromProjectOnly, ensureEyeSocketCoverConfig, ensureEyeSocketCovers, inferredEyeSocketCoverBbox, resetOtherPreviewParameterGroups, setParameterValue } from "../core/rig.js";
import { state } from "../core/state.js";
import { escapeHtml, postJson } from "../core/utils.js";
import { NumberField, ParameterControl, RangeField, SegmentButton, SmallButton, render, syncParameterControls } from "../ui/components.js";

function RigPanel(project) {
  const fragment = document.createDocumentFragment();
  ensureRigEyeSelection(project);
  const selected = selectedPart(project);
  const eyeParts = project.parts.filter((part) => part.id.startsWith("eye_"));

  const header = document.createElement("section");
  header.className = "control-card";
  header.innerHTML = `
    <h2>Rig</h2>
    <p class="note">눈 ArtMesh와 keyform을 Mini Cubism 전용 rig JSON으로 저장합니다.</p>
  `;
  const actions = document.createElement("div");
  actions.className = "button-row";
  actions.append(
    SmallButton("저장", saveRig),
    SmallButton("눈 검증", runEyeValidation),
  );
  header.append(actions);
  const modeRow = document.createElement("div");
  modeRow.className = "segmented-row";
  modeRow.append(
    SegmentButton("Mesh", state.rigTool === "mesh", () => {
      state.rigTool = "mesh";
      state.overlays.mesh = true;
      state.draggedCover = null;
      render();
      draw();
    }),
    SegmentButton("눈 영역", state.rigTool === "cover", () => {
      state.rigTool = "cover";
      state.overlays.mesh = false;
      state.draggedVertex = null;
      render();
      draw();
    }),
  );
  header.append(modeRow);
  if (state.rigStatus) {
    const status = document.createElement("p");
    status.className = "status-line";
    status.textContent = state.rigStatus;
    header.append(status);
  }
  fragment.append(header);

  if (state.rigTool === "mesh") {
    const partCard = document.createElement("section");
    partCard.className = "control-card";
    const select = document.createElement("select");
    select.className = "rig-select";
    for (const part of eyeParts) {
      const option = document.createElement("option");
      option.value = part.id;
      option.textContent = `${part.display_name} (${part.id})`;
      option.selected = part.id === state.selectedPartId;
      select.append(option);
    }
    select.addEventListener("change", () => {
      state.selectedPartId = select.value;
      render();
      draw();
    });
    partCard.innerHTML = `<h2>Eye ArtMesh</h2>`;
    partCard.append(select);
    if (selected) {
      const mesh = editableMeshForPart(project, selected.id);
      const selectedVertex = state.draggedVertex?.partId === selected.id ? state.draggedVertex.vertexIndex : "-";
      const meta = document.createElement("dl");
      meta.innerHTML = `
        <dt>Part</dt><dd>${escapeHtml(selected.id)}</dd>
        <dt>Vertices</dt><dd>${mesh?.vertices.length || 0}</dd>
        <dt>Selected</dt><dd>${selectedVertex}</dd>
      `;
      partCard.append(meta);
    }
    const meshActions = document.createElement("div");
    meshActions.className = "button-row";
    meshActions.append(
      SmallButton("현재 Mesh 저장", () => saveMeshOverride(selected?.id)),
      SmallButton("Mesh 초기화", () => resetMeshOverride(selected?.id)),
    );
    partCard.append(meshActions);
    fragment.append(partCard);
  } else {
    fragment.append(EyeCoverPanel(project));
  }

  const keyCard = document.createElement("section");
  keyCard.className = "control-card";
  keyCard.innerHTML = `<h2>Eye Keyform</h2>`;
  for (const paramId of ["ParamEyeLOpen", "ParamEyeROpen", "ParamEyeBallX", "ParamEyeBallY"]) {
    const param = project.parameters.find((item) => item.id === paramId);
    if (param) keyCard.append(ParameterControl(param));
  }
  const keyActions = document.createElement("div");
  keyActions.className = "button-row";
  keyActions.append(
    SmallButton("EyeBall 키폼 저장", captureEyeBallKeyform),
    SmallButton("EyeOpen 키폼 저장", captureEyeOpenKeyform),
  );
  keyCard.append(keyActions);
  const saved = document.createElement("p");
  saved.className = "note";
  saved.textContent = `저장된 keyform overrides: ${state.rig.keyform_overrides.length}`;
  keyCard.append(saved);
  fragment.append(keyCard);

  const clipCard = document.createElement("section");
  clipCard.className = "control-card";
  clipCard.innerHTML = `
    <h2>Clipping Preview</h2>
    <p class="note">eye white 알파를 기준으로 iris/pupil/highlight를 잘라 봅니다.</p>
  `;
  const clipToggle = document.createElement("label");
  clipToggle.className = "toggle-row";
  clipToggle.innerHTML = `<span>눈동자 clipping</span>`;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = state.clippingPreview;
  input.addEventListener("change", () => {
    state.clippingPreview = input.checked;
    draw();
  });
  clipToggle.append(input);
  clipCard.append(clipToggle);
  fragment.append(clipCard);
  return fragment;
}

function EyeCoverPanel(project) {
  const card = document.createElement("section");
  card.className = "control-card";
  const covers = ensureEyeSocketCovers(project);
  const side = state.selectedCoverSide === "R" ? "R" : "L";
  const config = ensureEyeSocketCoverConfig(project, side);
  card.innerHTML = `
    <h2>눈 닫힘 영역</h2>
    <p class="note">파란/노란 박스를 눈 안쪽으로 맞추면 닫힘 때 눈 밖 피부가 덜 같이 움직입니다.</p>
  `;

  const sideRow = document.createElement("div");
  sideRow.className = "segmented-row";
  sideRow.append(
    SegmentButton("왼눈 L", side === "L", () => {
      state.selectedCoverSide = "L";
      render();
      draw();
    }),
    SegmentButton("오른눈 R", side === "R", () => {
      state.selectedCoverSide = "R";
      render();
      draw();
    }),
  );
  card.append(sideRow);

  const enabled = document.createElement("label");
  enabled.className = "toggle-row";
  enabled.innerHTML = `<span>cover 사용</span>`;
  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.checked = covers.enabled !== false;
  enabledInput.addEventListener("change", () => {
    covers.enabled = enabledInput.checked;
    draw();
  });
  enabled.append(enabledInput);
  card.append(enabled);

  const bboxGrid = document.createElement("div");
  bboxGrid.className = "field-grid";
  ["x", "y", "w", "h"].forEach((label, index) => {
    bboxGrid.append(NumberField(label, config.bbox[index], 1, (value) => {
      const next = [...config.bbox];
      next[index] = Math.round(value);
      if (index >= 2) next[index] = Math.max(index === 2 ? 30 : 20, next[index]);
      config.bbox = next;
      draw();
    }));
  });
  card.append(bboxGrid);

  card.append(
    RangeField("불투명도", config.max_opacity ?? 0.9, 0, 1, 0.01, (value) => {
      config.max_opacity = Number(value.toFixed(2));
      draw();
    }),
    RangeField("가로 축소", config.scale_x ?? 0.8, 0.45, 1.2, 0.01, (value) => {
      config.scale_x = Number(value.toFixed(2));
      draw();
    }),
    RangeField("세로 축소", config.scale_y ?? 0.52, 0.25, 1.0, 0.01, (value) => {
      config.scale_y = Number(value.toFixed(2));
      draw();
    }),
    RangeField("blur", config.blur ?? 1, 0, 8, 0.25, (value) => {
      config.blur = Number(value.toFixed(2));
      draw();
    }),
  );

  const actions = document.createElement("div");
  actions.className = "button-row";
  actions.append(
    SmallButton("선택눈 닫힘 보기", () => previewSelectedEyeClosed(side)),
    SmallButton("양눈 닫힘 보기", previewBothEyesClosed),
    SmallButton("자동영역 복구", () => resetEyeCoverConfig(project, side)),
  );
  card.append(actions);
  return card;
}

function selectedPart(project) {
  const selected = project.parts.find((part) => part.id === state.selectedPartId);
  if (state.activePanel !== "rig") return selected;
  return selected?.id.startsWith("eye_") ? selected : project.parts.find((part) => part.id.startsWith("eye_"));
}

function ensureRigEyeSelection(project) {
  const selected = project.parts.find((part) => part.id === state.selectedPartId);
  if (!selected || !selected.id.startsWith("eye_")) {
    state.selectedPartId = project.parts.find((part) => part.id.startsWith("eye_"))?.id || state.selectedPartId;
  }
}

function editableMeshForPart(project, partId) {
  const source = project.meshes.find((mesh) => mesh.part_id === partId);
  if (!source) return null;
  const override = state.rig?.mesh_overrides?.[partId];
  if (!override) return source;
  return {
    ...source,
    vertices: override.vertices || source.vertices,
    triangles: override.triangles || source.triangles,
  };
}

function ensureMeshOverride(partId) {
  if (!partId || !state.project || !state.rig) return null;
  const source = state.project.meshes.find((mesh) => mesh.part_id === partId);
  if (!source) return null;
  if (!state.rig.mesh_overrides[partId]) {
    state.rig.mesh_overrides[partId] = {
      vertices: source.vertices.map((vertex) => [...vertex]),
      triangles: source.triangles.map((triangle) => [...triangle]),
      updated_at: new Date().toISOString(),
    };
  }
  return state.rig.mesh_overrides[partId];
}

function resetEyeCoverConfig(project, side) {
  const config = ensureEyeSocketCoverConfig(project, side);
  config.bbox = inferredEyeSocketCoverBbox(project, side);
  state.rigStatus = `${side} 눈 영역 자동값으로 복구`;
  render();
  draw();
}

function previewSelectedEyeClosed(side) {
  resetOtherPreviewParameterGroups(side === "L" ? "ParamEyeLOpen" : "ParamEyeROpen");
  setParameterValue(side === "L" ? "ParamEyeLOpen" : "ParamEyeROpen", 0);
  syncParameterControls();
  draw();
}

function previewBothEyesClosed() {
  resetOtherPreviewParameterGroups("ParamEyeLOpen");
  setParameterValue("ParamEyeLOpen", 0);
  setParameterValue("ParamEyeROpen", 0);
  syncParameterControls();
  draw();
}

function saveMeshOverride(partId) {
  if (!partId) return;
  ensureMeshOverride(partId);
  state.rig.mesh_overrides[partId].updated_at = new Date().toISOString();
  state.rigStatus = `${partId} mesh override 저장 대기`;
  render();
  draw();
}

function resetMeshOverride(partId) {
  if (!partId || !state.rig) return;
  delete state.rig.mesh_overrides[partId];
  state.draggedVertex = null;
  state.rigStatus = `${partId} mesh override 초기화`;
  render();
  draw();
}

function captureEyeBallKeyform() {
  const rows = [];
  const x = state.parameters.ParamEyeBallX || 0;
  const y = state.parameters.ParamEyeBallY || 0;
  if (Math.abs(x) > 0.001) {
    for (const partId of ["eye_L_iris", "eye_L_pupil", "eye_L_highlight", "eye_R_iris", "eye_R_pupil", "eye_R_highlight"]) {
      rows.push({
        parameter_id: "ParamEyeBallX",
        key_value: Number(x.toFixed(2)),
        target_id: partId,
        delta_type: "deformer_transform",
        deltas: bindingTransformFromProjectOnly(state.project, partId, "ParamEyeBallX", x),
      });
    }
  }
  if (Math.abs(y) > 0.001) {
    for (const partId of ["eye_L_iris", "eye_L_pupil", "eye_L_highlight", "eye_R_iris", "eye_R_pupil", "eye_R_highlight"]) {
      rows.push({
        parameter_id: "ParamEyeBallY",
        key_value: Number(y.toFixed(2)),
        target_id: partId,
        delta_type: "deformer_transform",
        deltas: bindingTransformFromProjectOnly(state.project, partId, "ParamEyeBallY", y),
      });
    }
  }
  upsertKeyformOverrides(rows);
  state.rigStatus = rows.length ? `EyeBall keyform ${rows.length}개 저장 대기` : "EyeBall 값을 먼저 움직여주세요";
  render();
  draw();
}

function captureEyeOpenKeyform() {
  const rows = [];
  const pairs = [
    ["ParamEyeLOpen", "eye_L_warp"],
    ["ParamEyeROpen", "eye_R_warp"],
  ];
  for (const [parameterId, targetId] of pairs) {
    const value = state.parameters[parameterId];
    const param = state.project.parameters.find((item) => item.id === parameterId);
    if (!param || Math.abs(value - param.default) <= 0.001) continue;
    rows.push({
      parameter_id: parameterId,
      key_value: Number(value.toFixed(2)),
      target_id: targetId,
      delta_type: "deformer_transform",
      deltas: bindingTransformFromProjectOnly(state.project, targetId, parameterId, value),
    });
  }
  upsertKeyformOverrides(rows);
  state.rigStatus = rows.length ? `EyeOpen keyform ${rows.length}개 저장 대기` : "EyeOpen 값을 먼저 움직여주세요";
  render();
  draw();
}

function upsertKeyformOverrides(rows) {
  if (!rows.length) return;
  const byKey = new Map(state.rig.keyform_overrides.map((row) => [bindingKey(row), row]));
  for (const row of rows) byKey.set(bindingKey(row), row);
  state.rig.keyform_overrides = [...byKey.values()].sort((a, b) => bindingKey(a).localeCompare(bindingKey(b)));
}

async function saveRig() {
  try {
    state.rig.updated_at = new Date().toISOString();
    const result = await postJson("/api/mini-rig", { rig: state.rig });
    state.rigStatus = `저장됨: ${result.path}`;
  } catch (error) {
    state.rigStatus = `저장 실패: ${error.message}`;
  }
  render();
}

async function runEyeValidation() {
  state.rigStatus = "눈 검증 실행 중...";
  render();
  try {
    await saveRig();
    const result = await postJson("/api/validate-eye-modes", {});
    const report = result.report;
    const outside = (report?.modes || []).reduce((sum, row) => sum + (row.outside_changed_pixels || 0), 0);
    state.rigStatus = `눈 검증 ${report?.status || "UNKNOWN"} / ROI 밖 변화 ${outside}px`;
  } catch (error) {
    state.rigStatus = `눈 검증 실패: ${error.message}`;
  }
  render();
}


export { RigPanel, EyeCoverPanel, selectedPart, ensureRigEyeSelection, editableMeshForPart, ensureMeshOverride, resetEyeCoverConfig, previewSelectedEyeClosed, previewBothEyesClosed, saveMeshOverride, resetMeshOverride, captureEyeBallKeyform, captureEyeOpenKeyform, upsertKeyformOverrides, saveRig, runEyeValidation };
