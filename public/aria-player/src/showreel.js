// SHOWREEL-EXPLODE-001: 분해→조립 결정론적 타임라인 (홍보 쇼츠 컷1~5).
// ?showreel=1 진입 시 state.explode를 시간 기반으로 구동 → 매번 동일 영상(재녹화 자유).
// 텍스트/자막 없음 — 순수 비주얼. 컷6~7(리깅 LIVE)은 웹캠 드라이브에서 별도 녹화.

import { draw } from "./core/draw.js";
import { state } from "./core/state.js";

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 키프레임 [시각(초), explode] — 컷1 훅(정지) → 컷2 분해 → 컷3 절정 hold → 컷4 조립 → 컷5 완료
const KEYS = [
  [0.0, 0], // 컷1 훅: 조립된 일러스트
  [3.0, 0],
  [11.0, 1], // 컷2 분해: 펼쳐짐
  [13.0, 1], // 컷3 절정: 폭발도 hold
  [20.0, 0], // 컷4 조립: 복귀
  [22.0, 0], // 컷5 완료: 정지(숨쉬기는 물리/리깅이 담당)
];
const DURATION = KEYS[KEYS.length - 1][0];

function sampleExplode(t) {
  if (t <= KEYS[0][0]) return KEYS[0][1];
  if (t >= DURATION) return KEYS[KEYS.length - 1][1];
  for (let i = 0; i < KEYS.length - 1; i += 1) {
    const [t0, v0] = KEYS[i];
    const [t1, v1] = KEYS[i + 1];
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / ((t1 - t0) || 1);
      return v0 + (v1 - v0) * easeInOutCubic(u);
    }
  }
  return KEYS[KEYS.length - 1][1];
}

let rafId = null;
let startTs = null;

function frame(ts) {
  if (startTs == null) startTs = ts;
  const t = (ts - startTs) / 1000;
  state.explode = sampleExplode(t);
  draw();
  if (t < DURATION) {
    rafId = requestAnimationFrame(frame);
  } else {
    state.explode = sampleExplode(DURATION);
    draw();
    rafId = null;
  }
}

function playShowreel() {
  stopShowreel();
  startTs = null;
  rafId = requestAnimationFrame(frame);
}

function stopShowreel() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

// ?showreel=1이면 자동재생 + 콘솔/녹화용 수동 훅 노출
function startShowreelIfRequested() {
  const params = new URLSearchParams(location.search);
  if (params.get("showreel") !== "1") return;
  state.selectedPartId = null; // 녹화: 노란 선택 박스 오버레이 제거
  window.__showreel = {
    play: playShowreel,
    stop: stopShowreel,
    setExplode: (v) => {
      stopShowreel();
      state.explode = v;
      draw();
    },
    duration: DURATION,
  };
  playShowreel();
}

export { playShowreel, stopShowreel, sampleExplode, startShowreelIfRequested, DURATION };
