// blendshape(52 ARKit) + head pose → AUTORIG ParamXxx 매핑. 원천: SNACK 플레이어 drive.html
// convert()+rawChannels() (실측 검증본, rig-format §3). self(로컬 웹캠)·remote(RT-02 수신) 공용 브릿지.
//
// 팩토리인 이유: 눈 개폐가 **적응형 데드존(eyeOpenBaseline)** + EMA 상태를 가진다. self와 각 remote
// 아바타가 **각자 인스턴스**를 가져야 baseline이 안 섞인다.
//
// 입력 층 구분(rig-format §3):
//  - blendshape(52): 눈 개폐·입 개폐·입꼴·**gaze(eyeLook*)** → 로컬·원격 공통(RT-02가 52ch 전송).
//  - headPose(yaw/pitch/roll, 도): **로컬 랜드마크 전용** — RT-02는 head pose 미전송이라 원격은 null → AngleX/Y/Z=0.
// ponytail: body(shoulder/Pose)·표정 번들(ParamEyeExpr 등)은 후속 매핑/UI 층. gaze/head는 여기서 구동.

import type { RigParams } from './types'

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0))
}
function normalizeCentered(v: number, lo: number, hi: number): number {
  const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1
  return clamp(v / m, -1, 1)
}
function remapDeadzone(v: number, dz: number, mx: number): number {
  if (v <= dz) return 0
  if (mx <= dz) return 1
  return clamp((v - dz) / (mx - dz), 0, 1)
}
function avg(...vs: number[]): number {
  return vs.reduce((a, b) => a + b, 0) / vs.length
}

// 랜드마크 기반 머리 포즈(도 단위). 로컬 웹캠에서만 산출(faceLandmarker.extractHeadPose).
export interface HeadPose {
  yaw: number
  pitch: number
  roll: number
}

export interface ExpressionDriverOptions {
  // 수평·롤 채널 미러(M=−1). self-view는 셀카 거울(video scaleX−1)과 방향 일치를 위해 true(기본).
  // remote는 미러 불필요(false) — 단 RT-02는 head pose 미전송이라 AngleX/Z는 어차피 0.
  mirror?: boolean
}

export type ExpressionDriver = (
  blendshapes: Record<string, number>,
  headPose?: HeadPose | null,
) => RigParams

export function createExpressionDriver(options: ExpressionDriverOptions = {}): ExpressionDriver {
  const M = options.mirror === false ? 1 : -1
  let eyeOpenBaseline = 0.3 // 눈 평상 eyeBlink 시작 추정(높게=뜸 바이어스). 라이브 적응.
  let eyeSmooth = 1 // EMA 상태(뜸=1)

  return function drive(bs: Record<string, number>, headPose?: HeadPose | null): RigParams {
    const g = (k: string) => bs[k] ?? 0

    // 눈: 양눈 링크(THA4 — 뜬눈 디테일이 ParamEyeLOpen 공유, 독립 윙크 불가) + 적응 데드존.
    const maxEB = Math.max(g('eyeBlinkLeft'), g('eyeBlinkRight')) // 더 감긴 값으로 통일
    if (maxEB < eyeOpenBaseline) eyeOpenBaseline += (maxEB - eyeOpenBaseline) * 0.05
    else if (maxEB - eyeOpenBaseline < 0.28) eyeOpenBaseline += (maxEB - eyeOpenBaseline) * 0.04
    eyeOpenBaseline = clamp(eyeOpenBaseline, 0.05, 0.6)
    const dz = eyeOpenBaseline + 0.28
    const mx = eyeOpenBaseline + 0.45
    const openBoth = clamp(1 - remapDeadzone(maxEB, dz, mx), 0, 1)
    const k = openBoth < eyeSmooth ? 0.45 : 0.3 // 감을 땐 빠르게, 뜰 땐 부드럽게
    eyeSmooth = eyeSmooth * (1 - k) + openBoth * k

    // gaze(눈알) — blendshape eyeLook*에서. 로컬·원격 공통.
    const gazeX = clamp(
      avg(g('eyeLookOutRight'), g('eyeLookInLeft')) - avg(g('eyeLookInRight'), g('eyeLookOutLeft')),
      -1,
      1,
    )
    const gazeY = clamp(
      avg(g('eyeLookUpLeft'), g('eyeLookUpRight')) - avg(g('eyeLookDownLeft'), g('eyeLookDownRight')),
      -1,
      1,
    )

    // 머리 포즈(로컬만) — 미러: yaw·roll에 M(셀카 거울과 방향 일치), pitch는 불변.
    const yaw = headPose ? clamp(headPose.yaw, -25, 25) : 0
    const pitch = headPose ? clamp(headPose.pitch, -20, 20) : 0
    const roll = headPose ? clamp(headPose.roll, -25, 25) : 0

    return {
      ParamEyeLOpen: eyeSmooth,
      ParamEyeROpen: eyeSmooth, // 링크: 단일 값을 두 파라미터에
      ParamEyeBallX: clamp(gazeX * M, -1, 1),
      ParamEyeBallY: clamp(gazeY, -1, 1),
      ParamMouthOpenY: clamp(remapDeadzone(g('jawOpen'), 0.05, 0.2), 0, 1), // jawOpen 0.2에서 풀오픈(정상 개구가 리그 최대치에 닿게 — 구 0.32는 웹캠 정상값 ~0.18이라 절반만 열림)
      ParamMouthForm: clamp(
        avg(g('mouthSmileLeft'), g('mouthSmileRight')) - avg(g('mouthFrownLeft'), g('mouthFrownRight')),
        -1,
        1,
      ),
      ParamAngleX: clamp(normalizeCentered(yaw, -25, 25) * 30 * M, -30, 30),
      // 게인 18(=1.0 아래)로 축소 — rig 실렌더 검증 결과 ParamAngleY≥~22에서 head_z_warp 저피벗 스쿼시가
      // 입/코를 뭉개고 앞뒤 머리 어긋남이 커짐(mimi·akane 공통 재현). 실측 피치 ±20°가 이 파손 구간에
      // 진입하지 않도록 게인을 낮춤 — rig 쪽(스쿼시 피벗·격자, 앞/뒤 머리 바인딩) 근본 수정은 별도 작업.
      ParamAngleY: clamp(normalizeCentered(pitch, -20, 20) * 18, -30, 30),
      ParamAngleZ: clamp(normalizeCentered(roll, -25, 25) * 30 * M, -30, 30),
      ParamBreath: clamp(0.5 + 0.5 * Math.sin(((performance.now() % 4000) / 4000) * Math.PI * 2), 0, 1),
    }
  }
}
