// ASSEMBLY-SHOWREEL-001: "무에서 만들어지는" 홍보 쇼츠.
// 백지 → 왼쪽 파츠함에 파츠 생성(스태거 페이드인) → 오른쪽 무대로 날아가 부착 →
// 초록 리깅(메시+디포머) 표시 → 캐릭터 움직임. ?assembly=1, 결정론(시간 기반).
// 2분할 레이아웃을 단일 2048 캔버스 안에서 구현(왼쪽 bin / 오른쪽 stage).

import { applyCanvasViewZoom, defaultViewZoom, draw } from "./core/draw.js";
import { state } from "./core/state.js";

const CANVAS = 2048;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 레이아웃: 왼쪽 파츠함(bin) | 오른쪽 조립무대(stage)
let BIN = { x0: 70, y0: 110, w: 850, h: 1820, cols: 4 };
// 카메라: 생성·부착은 오른쪽 무대(작게, 2분할) → 조립 후 화면중앙 상체 클로즈업으로 푸시인
let STAGE_BUILD = { cx: 1440, cy: 1044, s: 0.62 };
const STAGE_FOCUS = { cx: 1024, cy: 1003, s: 0.82 }; // 화면중앙·풀바디(전체 보이게 + 여백)
// SHORTS 9:16 세로(?vertical=1): 보이는 중앙열 x[448,1600] 안으로 재배치
const BIN_V = { x0: 470, y0: 70, w: 1110, h: 740, cols: 6 };
const STAGE_BUILD_V = { cx: 1024, cy: 1500, s: 0.46 };

// ④ 타임라인 12초로 조임 (기존 16.6s)
const T = {
  blank: 0.8,
  spawnSpan: 2.0,
  flyStart: 3.0,
  flySpan: 4.8,
  flyDur: 0.9,
  camStart: 8.6,
  camEnd: 10.0,
  rigIn: 9.2,
  rigRevealDur: 1.6,
  moveStart: 11.2,
  end: 12.0,
  holdFace: 1.2,
  autoRigReveal: 1.8,
  autoRigFlex: 1.8,
  autoMotionDur: 7.0,
};

function buildSchedule(project) {
  const parts = [...project.parts].sort((a, b) => a.draw_order - b.draw_order);
  const n = parts.length;
  const rows = Math.ceil(n / BIN.cols);
  const slotW = BIN.w / BIN.cols;
  const slotH = BIN.h / rows;
  const map = {};
  // 착지 시각 순으로 정렬된 배열도 함께 저장 (라벨 추적용)
  const byLanding = [];
  parts.forEach((part, i) => {
    const c = i % BIN.cols;
    const r = Math.floor(i / BIN.cols);
    const binCx = BIN.x0 + (c + 0.5) * slotW;
    const binCy = BIN.y0 + (r + 0.5) * slotH;
    const [, , bw, bh] = part.bbox;
    const sBin = Math.min((slotW * 0.82) / bw, (slotH * 0.82) / bh);
    const flyStart = T.flyStart + (i / n) * T.flySpan;
    const landAt = flyStart + T.flyDur;
    map[part.id] = { binCx, binCy, sBin, appearAt: T.blank + (i / n) * T.spawnSpan, flyStart };
    byLanding.push({ id: part.id, landAt });
  });
  byLanding.sort((a, b) => a.landAt - b.landAt);
  return { map, byLanding, total: n };
}

function driveMotion(t, moveStart) {
  const m = t - moveStart;
  if (m < 0) return;
  const set = (id, v) => {
    if (state.parameters[id] !== undefined) state.parameters[id] = v;
  };
  set("ParamAngleX", Math.sin(m * 0.45) * 6);
  set("ParamAngleY", Math.sin(m * 0.33) * 2);
  set("ParamAngleZ", Math.sin(m * 0.6) * 5);
  set("ParamEyeBallX", Math.sin(m * 0.7) * 0.5);
  set("ParamEyeBallY", Math.sin(m * 0.5 + 0.6) * 0.4);
  set("ParamBodyAngleX", Math.sin(m * 0.4) * 3);
  set("ParamBreath", clamp01(0.5 + 0.5 * Math.sin(m * 1.1)));
}

// ── HUD (② 라벨·카운터 / ③ 화이트 플래시) ──
// 녹화: macOS Cmd+Shift+5 네이티브 화면 녹화 권장 (브라우저 MediaRecorder보다 신뢰성·화질 우수)
let _hudEl = null, _counterEl = null, _labelEl = null, _flashEl = null;
let _labelTimer = null, _prevLanded = 0;

function createHUD() {
  if (_hudEl) return;
  _hudEl = document.createElement("div");
  _hudEl.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:99;";

  // ② 카운터 — 우상단
  _counterEl = document.createElement("div");
  _counterEl.style.cssText = [
    "position:absolute;top:3.5%;right:4%;",
    "font-family:-apple-system,sans-serif;font-weight:800;font-size:min(2.4vw,28px);",
    "color:#00e87a;text-shadow:0 2px 8px #0009;",
    "opacity:0;transition:opacity .4s;letter-spacing:.04em;",
  ].join("");

  // ② 파츠 라벨 — 하단 중앙
  _labelEl = document.createElement("div");
  _labelEl.style.cssText = [
    "position:absolute;bottom:7%;left:50%;transform:translateX(-50%);",
    "font-family:-apple-system,sans-serif;font-weight:700;font-size:min(3vw,32px);",
    "color:#fff;text-shadow:0 2px 14px #000b;",
    "opacity:0;transition:opacity .25s;white-space:nowrap;",
  ].join("");

  // ③ 화이트 플래시 — 전체 덮개
  _flashEl = document.createElement("div");
  _flashEl.style.cssText = "position:absolute;inset:0;background:#fff;opacity:0;";

  _hudEl.append(_counterEl, _labelEl, _flashEl);
  document.body.appendChild(_hudEl);
}


let rafId = null;
let startTs = null;
// canvas_origin 보정된 stage 타겟 (startAssemblyIfRequested에서 계산)
let _stageBuild = { ...STAGE_BUILD };
let _stageFocus = { ...STAGE_FOCUS };

function applyTimeline(t) {
  state.assembly.t = t;

  // 카메라 푸시인
  const cam = easeInOutCubic(clamp01((t - T.camStart) / (T.camEnd - T.camStart)));
  state.assembly.stage = {
    cx: lerp(_stageBuild.cx, _stageFocus.cx, cam),
    cy: lerp(_stageBuild.cy, _stageFocus.cy, cam),
    s: lerp(_stageBuild.s, _stageFocus.s, cam),
  };

  // 리깅 리빌
  const auto = state.assembly.autoMotion;
  const rigIn = auto ? (T.camEnd + T.holdFace) : T.rigIn;
  const revealDur = auto ? T.autoRigReveal : T.rigRevealDur;
  const moveStart = rigIn + revealDur;
  const rigOff = moveStart + T.autoRigFlex;
  const showRig = auto ? (t >= rigIn && t < rigOff) : (t >= rigIn);
  state.assembly.overlay = showRig;
  state.assembly.overlayProgress = clamp01((t - rigIn) / revealDur);
  state.overlays.mesh = showRig;
  state.overlays.deformers = showRig;
  document.body.classList.toggle("rig-overlay", showRig);
  if (auto) driveMotion(t, moveStart);

  // ─── HUD 업데이트 ───
  const byLanding = state.assembly.scheduleByLanding;
  const total = state.assembly.scheduleTotal;
  if (!byLanding) return;

  // ② 카운터 + 라벨
  let landed = 0;
  for (const { landAt } of byLanding) { if (t >= landAt) landed++; else break; }
  if (_counterEl) {
    if (t >= T.flyStart) {
      _counterEl.style.opacity = "1";
      _counterEl.textContent = `${landed} / ${total} parts`;
    } else {
      _counterEl.style.opacity = "0";
    }
  }
  if (_labelEl && landed > _prevLanded) {
    const justLanded = byLanding[landed - 1];
    if (justLanded) {
      _labelEl.textContent = justLanded.id.replace(/_/g, " ");
      _labelEl.style.opacity = "1";
      clearTimeout(_labelTimer);
      _labelTimer = setTimeout(() => { if (_labelEl) _labelEl.style.opacity = "0"; }, 700);
    }
    _prevLanded = landed;
  }

  // ③ 화이트 플래시 — rigIn 순간 100ms 섬광
  if (_flashEl) {
    const fp = clamp01(1 - (t - rigIn) / 0.18);
    _flashEl.style.opacity = (t >= rigIn && t < rigIn + 0.4) ? (fp * 0.92).toFixed(2) : "0";
  }
}

function frame(ts) {
  if (startTs == null) startTs = ts;
  let t = (ts - startTs) / 1000;
  const endT = state.assembly.autoMotion
    ? (T.camEnd + T.holdFace + T.autoRigReveal + T.autoRigFlex + T.autoMotionDur)
    : T.end;
  if (state.assembly.autoMotion && t >= endT) { startTs = ts; t = 0; }
  applyTimeline(t);
  draw();
  if (state.assembly.autoMotion || t < endT) rafId = requestAnimationFrame(frame);
  else rafId = null;
}

function play() {
  stop();
  startTs = null;
  _prevLanded = 0;
  rafId = requestAnimationFrame(frame);
}

function stop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function startAssemblyIfRequested() {
  const params = new URLSearchParams(location.search);
  if (params.get("assembly") !== "1") return;
  if (params.get("vertical") === "1") {
    BIN = BIN_V;
    STAGE_BUILD = STAGE_BUILD_V;
    document.body.classList.add("vertical");
  }
  state.selectedPartId = null;
  // canvas_origin Y 보정: canvas_origin이 stage 전체를 아래로 밀므로 assembly cy에서 차감
  const originY = state.project.canvas_origin?.[1] || 0;
  _stageBuild = { ...STAGE_BUILD, cy: STAGE_BUILD.cy - originY };
  _stageFocus = { ...STAGE_FOCUS, cy: STAGE_FOCUS.cy - originY };
  const sched = buildSchedule(state.project);
  state.assembly = {
    active: true,
    t: 0,
    overlay: false,
    overlayProgress: 0,
    autoMotion: params.get("automotion") === "1",
    schedule: sched.map,            // rig.js가 part.id 키로 직접 읽음
    scheduleByLanding: sched.byLanding,
    scheduleTotal: sched.total,
    stage: { ..._stageBuild },
    canvasCenter: [CANVAS / 2, CANVAS / 2],
    timing: T,
  };
  window.__assembly = {
    play,
    stop,
    seek: (t) => {
      startTs = performance.now() - t * 1000;
      _prevLanded = 0;
      applyTimeline(t);
      draw();
    },
    showRig: (on) => {
      if (on) {
        state.assembly.overlay = true;
        state.assembly.overlayProgress = 1;
        state.overlays.mesh = true;
        state.overlays.deformers = true;
      } else {
        stop();
        state.assembly.t = 999;
        state.assembly.stage = { ..._stageFocus };
        state.assembly.overlay = false;
        state.overlays.mesh = false;
        state.overlays.deformers = false;
        document.body.classList.remove("rig-overlay");
        document.body.classList.remove("obs", "clean");
        state.viewZoom = defaultViewZoom();
        state.panX = 0;
        state.panY = 0;
        const cv = document.querySelector("#preview-canvas");
        if (cv) applyCanvasViewZoom(cv);
      }
      draw();
    },
    end: T.end,
  };

  createHUD();
  play();
}

export { startAssemblyIfRequested, play, stop };
