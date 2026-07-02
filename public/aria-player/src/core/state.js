// 전역 상태와 파라미터 상수. UI/DOM 의존 없음.

const state = {
  project: null,
  images: new Map(),
  selectedPartId: null,
  overlays: {
    mesh: false,
    deformers: false,
  },
  activePanel: "preview",
  clippingPreview: true,
  parameters: {},
  explode: 0, // SHOWREEL-EXPLODE-001: 0=조립(원위치) → 1=분해(폭발도). showreel.js가 구동, 0이면 무영향
  assembly: null, // ASSEMBLY-SHOWREEL-001: 무→조립 쇼츠 상태(assembly.js가 채움). null이면 무영향
  physics: new Map(),
  rig: null,
  rendererBackend: "canvas", // 'canvas' | 'pixi' (?renderer=pixi — PIXI-RENDER-001)
  pixiCanvas: null, // pixi 백엔드의 영속 캔버스 — render()가 DOM을 재구성해도 재부착
  pixiDraw: null, // draw_pixi.js가 주입 (draw.js ← draw_pixi 순환 임포트 방지)
  pixiExtract: null, // probe 픽셀 추출 훅 (WebGL 캔버스는 getContext('2d') 불가)
  rigStatus: "",
  rigTool: "mesh",
  selectedCoverSide: "L",
  draggedVertex: null,
  draggedCover: null,
  viewZoom: 0.42,
  panX: 0, // ZOOM-TO-CURSOR-001: 캔버스 중심 기준 변위(px) — 스크롤 비의존 줌/팬 (에디터+드라이브 공통)
  panY: 0,
  panelsCollapsed: false, // PANEL-COLLAPSE-001: 사이드 패널 접기(캔버스 확대 — 줌/팬과 함께 부위 확인)
};

const PARAM_LABELS = {
  ParamAngleX: "Angle X",
  ParamAngleZ: "Tilt",
  ParamBodyAngleZ: "Body Tilt",
  ParamEyeLOpen: "Eye L",
  ParamEyeROpen: "Eye R",
  ParamEyeBallX: "Eye Ball X",
  ParamEyeBallY: "Eye Ball Y",
  ParamBrowLY: "Brow L",
  ParamBrowRY: "Brow R",
  ParamEyeSmile: "Eye Smile",
  ParamCheek: "Cheek",
  ParamMouthOpenY: "Mouth",
  ParamMouthForm: "Mouth Form",
  ParamHairFront: "Hair Front",
  ParamHairBack: "Hair Back",
  ParamAccessory: "Accessory",
};

const PREVIEW_PARAMETER_GROUPS = {
  head: ["ParamAngleX", "ParamAngleY", "ParamAngleZ"],
  body: ["ParamBodyAngleX", "ParamBodyAngleY", "ParamBodyAngleZ", "ParamBreath"],
  eye: ["ParamEyeLOpen", "ParamEyeROpen", "ParamEyeBallX", "ParamEyeBallY", "ParamEyeSmile"],
  mouth: ["ParamMouthOpenY", "ParamMouthForm"],
  hair: ["ParamHairFront", "ParamHairSide", "ParamHairBack"],
};


export { state, PARAM_LABELS, PREVIEW_PARAMETER_GROUPS };
