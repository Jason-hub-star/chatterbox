import { describe, expect, it } from 'vitest'
import { estimateVgenSeconds, etaProgress } from '@/lib/vgenEta'

// A-SEAM-2 진행/ETA 데이터의 그라운드 트루스: 요청 길이 → 추정 소요초(단조 증가·음수 방어).
describe('estimateVgenSeconds (VGEN ETA seam)', () => {
  it('출력 길이가 길수록 추정 소요가 단조 증가한다', () => {
    expect(estimateVgenSeconds(5)).toBeLessThan(estimateVgenSeconds(10))
    expect(estimateVgenSeconds(10)).toBeLessThan(estimateVgenSeconds(15))
  })

  it('0초/음수는 기저값으로 클램프된다(음수 배제)', () => {
    const base = estimateVgenSeconds(0)
    expect(base).toBeGreaterThan(0)
    expect(estimateVgenSeconds(-5)).toBe(base)
  })

  it('정수 초를 반환한다(진행바 계산 안정)', () => {
    expect(Number.isInteger(estimateVgenSeconds(7))).toBe(true)
  })
})

// 트랙 B P-2 진행바 표현값: 95% 캡(거짓 완료 금지) + remaining 0 하한.
describe('etaProgress (진행바 표현값)', () => {
  it('중간 경과는 비율 그대로, 남은초는 올림', () => {
    expect(etaProgress(30, 60)).toEqual({ ratio: 0.5, remainingSec: 30 })
    expect(etaProgress(30.5, 60).remainingSec).toBe(30)
  })

  it('추정 초과 시 ratio 0.95 캡·remaining 0 하한(음수 카운트다운 금지)', () => {
    expect(etaProgress(120, 60)).toEqual({ ratio: 0.95, remainingSec: 0 })
  })

  it('음수 경과·비정상 eta 방어', () => {
    expect(etaProgress(-3, 60).ratio).toBe(0)
    expect(etaProgress(10, 0)).toEqual({ ratio: 0.95, remainingSec: 0 })
  })
})
