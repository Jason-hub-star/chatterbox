import { describe, it, expect } from 'vitest'
import { clampTrimRange, estimateTrimBytes, MIN_TRIM_MS } from '@/lib/ffmpeg'

// DUB-TRIM v1 순수부 — 슬라이더 정규화·예상 용량 (ffmpeg.wasm 실행부는 헤드리스 하네스가 실측)

describe('clampTrimRange', () => {
  it('전체 범위는 그대로 통과한다', () => {
    expect(clampTrimRange(10000, 0, 10000)).toEqual({ startMs: 0, endMs: 10000 })
  })
  it('음수 시작·초과 끝을 영상 길이 안으로 클램프한다', () => {
    expect(clampTrimRange(10000, -500, 99999)).toEqual({ startMs: 0, endMs: 10000 })
  })
  it('시작을 끝 너머로 끌면 최소 간격(1s)을 유지하며 끝을 민다', () => {
    const r = clampTrimRange(10000, 9800, 5000)
    expect(r.startMs).toBe(10000 - MIN_TRIM_MS)
    expect(r.endMs - r.startMs).toBeGreaterThanOrEqual(MIN_TRIM_MS)
    expect(r.endMs).toBeLessThanOrEqual(10000)
  })
  it('1초 미만 영상은 전체 범위로 degrade 한다', () => {
    const r = clampTrimRange(600, 100, 500)
    expect(r.startMs).toBe(0)
    expect(r.endMs).toBe(600)
  })
})

describe('estimateTrimBytes', () => {
  it('구간 비율로 근사한다', () => {
    expect(estimateTrimBytes(1000, 10000, { startMs: 0, endMs: 5000 })).toBe(500)
  })
  it('길이 0이면 전체 크기를 돌려준다(0 나눗셈 방지)', () => {
    expect(estimateTrimBytes(1000, 0, { startMs: 0, endMs: 0 })).toBe(1000)
  })
})
