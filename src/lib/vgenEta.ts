// VGEN 생성 소요시간 추정(초). 진행/ETA 데이터 seam(A-SEAM-2 / UX-GAPS P-2)의 순수 로직.
// fal Seedance 는 실 ETA·큐위치를 아직 노출하지 않아, 요청한 출력 길이 기반 정적 추정으로 근사한다.
// ponytail: 정적 휴리스틱(관측 텔레메트리 없음) — 상한(ceiling)은 "대략적". 진행바(트랙 B)는 이 값을
//   목표로 채우되 초과 시 ≈95% 에서 캡해 거짓 완료를 피한다. 업그레이드 경로: trigger-vgen 이 fal
//   큐위치/모델 ETA 를 vgen_jobs.estimated_duration_sec 로 저장 → 매퍼가 실측 ETA 를 노출.
const BASE_SEC = 20
const PER_OUTPUT_SEC = 18

export function estimateVgenSeconds(durationSec: number): number {
  return Math.round(BASE_SEC + Math.max(0, durationSec) * PER_OUTPUT_SEC)
}

// 경과/추정 → 진행바 표현값. ratio 는 0.95 캡(완료 판정은 realtime 이벤트 몫 — 100% 거짓말 금지),
// remainingSec 은 0 하한(카운트다운이 음수로 가지 않게). etaSec 비정상(≤0)이면 캡 상태로 간주.
export function etaProgress(elapsedSec: number, etaSec: number): { ratio: number; remainingSec: number } {
  if (etaSec <= 0) return { ratio: 0.95, remainingSec: 0 }
  return {
    ratio: Math.min(Math.max(elapsedSec / etaSec, 0), 0.95),
    remainingSec: Math.max(Math.ceil(etaSec - elapsedSec), 0),
  }
}
