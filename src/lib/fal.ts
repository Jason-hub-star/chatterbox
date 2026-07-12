// VideoGenProvider: 영상생성 공급사 추상화(성역 — 공급사 종료/소송 대비 어댑터).
// MVP = Seedance 2.0 Fast 1개. 폴백(Kling/Luma)은 slice2.
// SSOT: docs/archive/STACK-COMPARE-VIDEOGEN.md §2 · docs/specs/VgenCostAnalysis.md
// 주: 실제 fal 모델 문자열은 서버(VGEN_MODEL_ID env)에서 관리 — 여기선 표시/비용 산정용 메타만.

export interface VideoGenProvider {
  id: string
  label: string
  maxDurationSec: number
  usdPerSec: number
  maxPromptLength: number
}

export const seedance: VideoGenProvider = {
  id: 'seedance',
  label: 'Seedance 2.0 Fast',
  maxDurationSec: 15,
  usdPerSec: 0.2419, // 720p (VgenCostAnalysis §1)
  maxPromptLength: 2000,
}

// 해상도 사용자 선택(slice1b). 크레딧은 해상도가중, USD 는 표시용 추정.
// ⚠️ 서버(trigger-vgen)가 크레딧 권위 — 아래 가중/단가는 trigger-vgen 의 RES_CREDIT_WEIGHT/
//   RES_USD_PER_SEC 와 동기 유지(표시 추정용). fal Seedance 2.0 실단가 확정 시 양쪽 갱신.
export type VgenResolution = '480p' | '720p' | '1080p'
export const RESOLUTIONS: VgenResolution[] = ['480p', '720p', '1080p']
const RES_CREDIT_WEIGHT: Record<VgenResolution, number> = { '480p': 0.5, '720p': 1, '1080p': 2.5 }
const RES_USD_PER_SEC: Record<VgenResolution, number> = { '480p': 0.15, '720p': seedance.usdPerSec, '1080p': 0.55 }

// 크레딧 비용 = ceil(초 × 해상도가중), 1크레딧 = 1초@720p 기준.
export const creditCost = (durationSec: number, resolution: VgenResolution): number =>
  Math.ceil(durationSec * RES_CREDIT_WEIGHT[resolution])
export const estimateUsd = (durationSec: number, resolution: VgenResolution): number =>
  +(durationSec * RES_USD_PER_SEC[resolution]).toFixed(2)
