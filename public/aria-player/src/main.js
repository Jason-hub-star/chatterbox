// 엔트리포인트.

import { defaultViewZoom, draw } from "./core/draw.js";
import { initPhysicsState, stepPhysics } from "./core/physics.js";
import { normalizeRig } from "./core/rig.js";
import { state } from "./core/state.js";
import { escapeHtml, fetchJson, loadImages } from "./core/utils.js";
import { startAssemblyIfRequested } from "./assembly.js";
import { exposeAutomationApi } from "./probe.js";
import { startShowreelIfRequested } from "./showreel.js";
import { render } from "./ui/components.js";
import { app } from "./ui/dom.js";

async function init() {
  // 방송 모드(?obs=1): UI 숨김 + 캔버스 풀스크린 + green screen — OBS 브라우저 소스용 (styles.css body.obs)
  // 클린 모드(?clean=1): 동일 풀스크린 레이아웃이되 green 아님(베이지) — 공유 플레이어 임베드용.
  const launchParams = new URLSearchParams(location.search);
  const obsMode = launchParams.get("obs") === "1";
  const cleanMode = obsMode || launchParams.get("clean") === "1";
  if (cleanMode) document.body.classList.add("obs");           // 풀스크린+UI숨김 레이아웃 재사용
  if (!obsMode && cleanMode) document.body.classList.add("clean"); // green 대신 베이지 배경
  try {
    // ?project=<url> 로 아무 아바타나 로드 (Storage URL 등). 미지정 시 로컬 api/project 폴백.
    // 보안: origin 화이트리스트 — Supabase Storage(*.supabase.co) 또는 동일 오리진만 허용.
    // (임의 외부 URL 로드 차단: 신뢰 도메인 피싱·DoS·트래킹 방지. public/ 정적파일이라 import.meta.env 미사용.)
    // ponytail: *.supabase.co 로 넓게 허용 — 정확한 프로젝트 ref로 좁히려면 빌드시 host를 주입.
    const projectParam = new URLSearchParams(location.search).get("project");
    if (projectParam) {
      const host = new URL(projectParam, location.href).hostname;
      if (host !== location.hostname && !host.endsWith(".supabase.co")) {
        throw new Error("허용되지 않은 project URL origin: " + host);
      }
    }
    const project = await fetchJson(projectParam || "api/project");
    state.project = project;
    const search = new URLSearchParams(location.search);
    state.renderScale = parseFloat(search.get("render_scale")) || 1; // 드라이브 성능용 저해상 렌더 (canvas 백엔드 전용)
    state.rendererBackend = search.get("renderer") === "pixi" ? "pixi" : "canvas";
    state.rig = normalizeRig(project._mini_rig);
    state.viewZoom = defaultViewZoom();
    state.parameters = Object.fromEntries(project.parameters.map((param) => [param.id, param.default]));
    initPhysicsState(project);
    state.selectedPartId = project.parts[0]?.id || null;
    await loadImages(project);
    if (state.rendererBackend === "pixi") {
      try {
        const pixi = await import("./core/draw_pixi.js"); // 켤 때만 로드 — canvas 모드는 의존성 0
        await pixi.initPixi(project);
      } catch (error) {
        console.warn("pixi 백엔드 초기화 실패 — canvas 폴백:", error);
        state.rendererBackend = "canvas";
      }
    }
    exposeAutomationApi();
    render();
    draw();
    startShowreelIfRequested(); // SHOWREEL-EXPLODE-001: ?showreel=1 → 분해/조립 타임라인 자동재생
    startAssemblyIfRequested(); // ASSEMBLY-SHOWREEL-001: ?assembly=1 → 무에서 조립+리깅 타임라인
    if (project.physics_profiles?.length) {
      // 물리 프로파일이 있으면 30fps 상시 스테핑 — 슬라이더 조작만으로 찰랑임이 보인다
      setInterval(() => stepPhysics(1 / 30), 33);
    }
  } catch (error) {
    app.innerHTML = `<div class="fatal">Mini Cubism preview failed: ${escapeHtml(error.message)}</div>`;
  }
}

init();


export { init };
