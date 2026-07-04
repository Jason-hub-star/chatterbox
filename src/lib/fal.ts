// VideoGenProvider: 영상생성 공급사 추상화(성역 — 공급사 종료/소송 대비 어댑터).
// MVP = Seedance 2.0 Fast 1개. 폴백(Kling/Luma)은 slice2.
// SSOT: docs/STACK-COMPARE-VIDEOGEN.md §2 · docs/specs/VgenCostAnalysis.md
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

// 크레딧 비용 = 초(1크레딧 = 1초). USD 는 표시용 추정.
export const creditCost = (durationSec: number): number => durationSec
export const estimateUsd = (durationSec: number): number => +(durationSec * seedance.usdPerSec).toFixed(2)
