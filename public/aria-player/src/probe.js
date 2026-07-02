// 자동화/주입 API (__miniProbe, __miniSetParameters 등). T2/T3 계약.

import { draw } from "./core/draw.js";
import { physicsOwnedParameters, resetPhysics, stepPhysics } from "./core/physics.js";
import { deformedVertices, partOpacity, setParameterValue } from "./core/rig.js";
import { state } from "./core/state.js";
import { render, syncParameterControls } from "./ui/components.js";

function exposeAutomationApi() {
  window.__miniSetParameters = (values = {}) => {
    for (const [parameterId, value] of Object.entries(values)) {
      setParameterValue(parameterId, value);
    }
    syncParameterControls();
    draw();
  };
  window.__miniResetPhysics = () => {
    resetPhysics();
    draw();
  };
  window.__miniClearSelection = () => {
    state.selectedPartId = null;
    render();
    draw();
  };
  window.__miniStepPhysics = (dt = 1 / 30) => stepPhysics(dt);
  window.__miniSnapshot = () => ({
    parameters: { ...state.parameters },
    physics: Object.fromEntries(
      [...state.physics.entries()].map(([id, item]) => [id, { offset: [...item.offset], velocity: [...item.velocity] }]),
    ),
    part_opacity: Object.fromEntries((state.project?.parts || []).map((part) => [part.id, partOpacity(state.project, part)])),
  });
  window.__miniRig = () => state.rig;
  window.__miniBackend = () => state.rendererBackend; // 검증 스크립트가 pixi silent 폴백을 잡는다
  window.__miniProject = state.project;
  // EXPR-SET-001 표정 번들 런타임/핫키: 오버레이-스왑 정렬 한계로 실패 판정(2026-06-18) → 제거.
  // expressions.json·build_expression_bundle은 dormant 보존(풀페이스 P0 art 확보 시 재가동).
  // T2 __vtubeProbe와 동일 계약의 주입 인터페이스 (T3 웹캠 드라이브용)
  window.__miniProbe = {
    waitReady(timeoutMs = 10000) {
      return new Promise((resolve) => {
        const started = performance.now();
        const tick = () => {
          if (state.project) return resolve(true);
          if (performance.now() - started > timeoutMs) return resolve(false);
          setTimeout(tick, 50);
        };
        tick();
      });
    },
    parameters() {
      return (state.project?.parameters || []).map((param) => ({
        id: param.id,
        min: param.min,
        max: param.max,
        defaultValue: param.default,
      }));
    },
    setParameterValues(values = {}) {
      const applied = [];
      const missing = [];
      const owned = physicsOwnedParameters(); // BODY-SWAY-001: 스프링 소유 파라미터는 트래킹 직주입 무시
      for (const [parameterId, value] of Object.entries(values)) {
        if (owned.has(parameterId)) {
          applied.push(parameterId);
        } else if (state.project?.parameters?.some((item) => item.id === parameterId)) {
          setParameterValue(parameterId, value);
          applied.push(parameterId);
        } else {
          missing.push(parameterId);
        }
      }
      syncParameterControls();
      draw();
      return { applied, missing };
    },
    snapshot: () => window.__miniSnapshot(),
    canvasHash() {
      const data = probePixels();
      if (!data) return null;
      let hash = 2166136261;
      for (let i = 0; i < data.length; i += 64) {
        hash ^= data[i];
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      return hash >>> 0;
    },
    // 영역 투명 픽셀 카운트 (목 이음새 검사 등) — 백엔드 무관 계약
    regionAlphaCount(x, y, w, h, threshold = 30) {
      const data = probePixels([x, y, w, h]);
      if (!data) return null;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] < threshold) count += 1;
      return count;
    },
    // ROTATION-RECIPE-001: 파트별 변형 정점 경계상자 (현재 파라미터 상태 기준).
    // 프로 모델 bbox sweep과 동일 단위 → 우리 리그 foreshortening(sx/sy) 측정용.
    partDeformedBounds() {
      const project = state.project;
      if (!project) return null;
      const out = {};
      for (const part of project.parts || []) {
        const mesh = (project.meshes || []).find((m) => m.part_id === part.id);
        if (!mesh || !mesh.vertices?.length) continue;
        const verts = deformedVertices(project, part, mesh);
        let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
        for (const [x, y] of verts) { if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; }
        out[part.id] = { cx: (a + b) / 2, cy: (c + d) / 2, w: b - a, h: d - c, deformer: part.deformer_node || null };
      }
      return out;
    },
    // 영역 RGBA 픽셀 base64 (렌더 정확성 검증용 — EYE-NATURAL-002) — 백엔드 무관 계약
    regionPixelsBase64(x, y, w, h) {
      const data = probePixels([x, y, w, h]);
      if (!data) return null;
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < data.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(data.slice(i, i + chunk)));
      }
      return btoa(binary);
    },
  };
}

// 백엔드별 픽셀 획득: canvas=getImageData, pixi=renderer.extract (WebGL은 2d 컨텍스트 불가)
function probePixels(frame) {
  if (state.rendererBackend === "pixi" && state.pixiExtract) {
    return state.pixiExtract(frame)?.pixels || null;
  }
  const canvas = document.querySelector("#preview-canvas");
  if (!canvas) return null;
  const ctx2d = canvas.getContext("2d");
  const [x, y, w, h] = frame || [0, 0, canvas.width, canvas.height];
  return ctx2d.getImageData(x, y, w, h).data;
}


export { exposeAutomationApi };
