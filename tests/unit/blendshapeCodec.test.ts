import { describe, it, expect } from 'vitest'
import {
  encodeBlendshapeFrame,
  decodeBlendshapeFrame,
  crc16,
  isNewerSeq,
  CANONICAL_BLENDSHAPES,
  FRAME_BYTES,
  BLENDSHAPE_COUNT,
} from '@/lib/blendshapeCodec'

const sample = { jawOpen: 0.8, eyeBlinkLeft: 0.5, mouthSmileRight: 0.3, browInnerUp: 0.2 }

describe('blendshapeCodec 프레임', () => {
  it('220바이트(=52*4 + 12) 프레임을 만든다', () => {
    expect(BLENDSHAPE_COUNT).toBe(52)
    expect(FRAME_BYTES).toBe(220)
    expect(encodeBlendshapeFrame(sample, 1, 1000).byteLength).toBe(220)
  })

  it('encode→decode 라운드트립: 값·seq·timestamp 보존(float32 오차 내)', () => {
    const frame = decodeBlendshapeFrame(encodeBlendshapeFrame(sample, 42, 123456))
    expect(frame).not.toBeNull()
    expect(frame!.seq).toBe(42)
    expect(frame!.timestampMs).toBe(123456)
    expect(frame!.blendshapes.jawOpen).toBeCloseTo(0.8, 5)
    expect(frame!.blendshapes.eyeBlinkLeft).toBeCloseTo(0.5, 5)
    expect(frame!.blendshapes.browInnerUp).toBeCloseTo(0.2, 5)
  })

  it('맵에 없는 채널은 0으로 채운다', () => {
    const frame = decodeBlendshapeFrame(encodeBlendshapeFrame(sample, 1, 0))!
    expect(frame.blendshapes.cheekPuff).toBe(0)
    for (const name of CANONICAL_BLENDSHAPES) {
      expect(typeof frame.blendshapes[name]).toBe('number')
    }
  })

  it('seq 65535 순환을 마스킹한다', () => {
    const frame = decodeBlendshapeFrame(encodeBlendshapeFrame(sample, 70000, 0))!
    expect(frame.seq).toBe(70000 & 0xffff)
  })
})

describe('blendshapeCodec 검증(네트워크 경계)', () => {
  it('길이가 220이 아니면 null', () => {
    expect(decodeBlendshapeFrame(new Uint8Array(10))).toBeNull()
    expect(decodeBlendshapeFrame(new Uint8Array(221))).toBeNull()
  })

  it('crc16 불일치(손상 프레임)면 null', () => {
    const bytes = encodeBlendshapeFrame(sample, 1, 0)
    bytes[0] ^= 0xff // 데이터부 1비트 손상 → crc 불일치
    expect(decodeBlendshapeFrame(bytes)).toBeNull()
  })

  it('byteOffset이 있는 뷰(LiveKit 페이로드)도 올바로 디코드', () => {
    const inner = encodeBlendshapeFrame(sample, 7, 5)
    const padded = new Uint8Array(FRAME_BYTES + 8)
    padded.set(inner, 8)
    const view = new Uint8Array(padded.buffer, 8, FRAME_BYTES)
    const frame = decodeBlendshapeFrame(view)
    expect(frame).not.toBeNull()
    expect(frame!.seq).toBe(7)
    expect(frame!.blendshapes.jawOpen).toBeCloseTo(0.8, 5)
  })

  it('crc16은 결정적', () => {
    const b = new Uint8Array([1, 2, 3, 4])
    expect(crc16(b)).toBe(crc16(b))
  })

  // CRC-16/CCITT-FALSE(init 0xFFFF, poly 0x1021) 표준 검증 벡터. "123456789" → 0x29B1.
  // (0x31C3은 XMODEM=init 0x0000 값 — 혼동 주의. 페이블 리뷰 P0 오탐 회귀 가드.)
  it('crc16이 CCITT-FALSE 표준 벡터와 일치', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x29b1)
  })

  it('NaN/Inf float(손상·악의 프레임)이면 null (EMA 오염 방지)', () => {
    const bytes = encodeBlendshapeFrame(sample, 1, 0)
    const view = new DataView(bytes.buffer)
    view.setFloat32(25 * 4, NaN, true) // jawOpen 슬롯을 NaN으로
    view.setUint16(208 + 10, crc16(new Uint8Array(bytes.buffer, 0, 208)), true) // crc 재계산(통과시켜도)
    expect(decodeBlendshapeFrame(bytes)).toBeNull()

    const b2 = encodeBlendshapeFrame(sample, 1, 0)
    const v2 = new DataView(b2.buffer)
    v2.setFloat32(0, Infinity, true)
    v2.setUint16(208 + 10, crc16(new Uint8Array(b2.buffer, 0, 208)), true)
    expect(decodeBlendshapeFrame(b2)).toBeNull()
  })
})

describe('isNewerSeq 역전 감지', () => {
  it('첫 프레임(prev=0)은 항상 수용', () => {
    expect(isNewerSeq(0, 1)).toBe(true)
  })
  it('증가하는 seq는 수용, 같거나 과거는 드롭', () => {
    expect(isNewerSeq(10, 11)).toBe(true)
    expect(isNewerSeq(10, 10)).toBe(false)
    expect(isNewerSeq(10, 9)).toBe(false)
  })
  it('65535 순환 경계에서 최신 판정', () => {
    expect(isNewerSeq(65535, 1)).toBe(true) // 순환 직후는 최신
    expect(isNewerSeq(1, 65535)).toBe(false) // 과거로 되돌아감
  })
})
