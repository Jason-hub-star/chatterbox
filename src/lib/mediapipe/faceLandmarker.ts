import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision'

// MediaPipe FaceLandmarker 래퍼 (specs/MediaPipeConfig.md).
// 버전 핀: WASM CDN 경로와 npm 패키지 버전을 일치시킨다 (미스매치 방지).
const MP_VERSION = '0.10.21'
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`
// 정본 모델 경로 (2026-07-02 검증, 200/3.75MB). 구 경로 mediapipe-tasks/... 는 404.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

// ponytail: delegate 생략 = CPU 추론(항상 동작). GPU delegate·Web Worker·SIMD(COOP/COEP)는
// 6인 프로덕션 성능 튜닝 Phase 2. 단일 로컬 얼굴은 CPU로 충분.
export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL },
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    runningMode: 'VIDEO',
    numFaces: 1,
  })
}

export function hasFace(result: FaceLandmarkerResult): boolean {
  return (result.faceBlendshapes?.length ?? 0) > 0
}

// ARKit blendshape을 categoryName→score 맵으로. (인덱스 배열은 불완전하므로 이름으로 조회)
export function blendshapeMap(result: FaceLandmarkerResult): Record<string, number> {
  const categories = result.faceBlendshapes?.[0]?.categories
  if (!categories) return {}
  const map: Record<string, number> = {}
  for (const c of categories) map[c.categoryName] = c.score
  return map
}

// 머리 기울기(roll, 라디안). 4x4 변환행렬(column-major)의 회전 성분에서 추출.
// roll = atan2(R10, R00) = atan2(data[1], data[0]). 절차적 아바타(FaceParams.headRoll)용.
export function headRoll(result: FaceLandmarkerResult): number {
  const m = result.facialTransformationMatrixes?.[0]?.data
  if (!m || m.length < 16) return 0
  return Math.atan2(m[1], m[0])
}

// 랜드마크 기반 머리 포즈(yaw/pitch/roll, 도). 원천: aria-player drive.html rawChannels() 실측 이식
// (행렬이 아닌 눈·코·턱·이마 랜드마크로 산출 — 배포본과 동일 방식·동일 상수). 캘리브레이션(neutral)은
// 생략 = raw(배포본 기본 경로). 아리아 실 rig의 ParamAngleX/Y/Z 구동용(expressionDriver).
export function extractHeadPose(
  result: FaceLandmarkerResult,
): { yaw: number; pitch: number; roll: number } | null {
  const lm = result.faceLandmarks?.[0]
  if (!lm) return null
  const leftEye = lm[33] ?? lm[130]
  const rightEye = lm[263] ?? lm[359]
  const nose = lm[1] ?? lm[4]
  const chin = lm[152] ?? lm[175]
  const forehead = lm[10] ?? lm[9]
  if (!leftEye || !rightEye || !nose || !chin || !forehead) return null
  const eyeDx = rightEye.x - leftEye.x
  const eyeDy = rightEye.y - leftEye.y
  const eyeWidth = Math.max(Math.abs(eyeDx), 0.04)
  const faceHeight = Math.max(Math.abs(chin.y - forehead.y), 0.12)
  const eyeCenterX = (leftEye.x + rightEye.x) / 2
  const eyeCenterY = (leftEye.y + rightEye.y) / 2
  const clampDeg = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  return {
    roll: (Math.atan2(eyeDy, eyeDx) * 180) / Math.PI,
    yaw: clampDeg(((nose.x - eyeCenterX) / eyeWidth) * 42, -25, 25),
    pitch: clampDeg(((eyeCenterY - nose.y) / faceHeight) * 46, -20, 20),
  }
}
