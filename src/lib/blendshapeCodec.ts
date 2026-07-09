// SSOT: state-machines/WebRTC.md §DataChannel Multiplexing + RT-02 blendshape 프레임 포맷.
// 'blendshape' 토픽(unreliable) 220바이트 바이너리 프레임의 인코더/디코더.
// 순수 함수(React/Pixi/LiveKit 무의존) → 단위 테스트 가능. 네트워크 경계이므로 디코드는 반드시 검증한다.
//
// 프레임 레이아웃 (little-endian, 총 220B = 208 + 12):
//   [0  ..208)  Float32 × 52  — MediaPipe blendshape 점수 (CANONICAL_BLENDSHAPES 순서)
//   [208..216)  Float64       — timestamp_ms (발신측 monotonic clock)
//   [216..218)  Uint16        — seq (1..65535 순환, 역전 감지용)
//   [218..220)  Uint16        — crc16 (앞 208B 데이터부 체크섬)

// MediaPipe FaceLandmarker blendshape 카테고리 순서(52개, index 0 = _neutral).
// 송·수신 양단이 같은 배열로 pack/unpack하므로 인덱스 일치가 보장된다.
// (toFaceParams가 쓰는 8개 — eyeBlinkLeft/Right·jawOpen·mouthSmileLeft/Right·browInnerUp·browOuterUpLeft/Right — 는 모두 포함.)
export const CANONICAL_BLENDSHAPES = [
  '_neutral',
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeBlinkLeft', 'eyeBlinkRight',
  'eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookInLeft', 'eyeLookInRight',
  'eyeLookOutLeft', 'eyeLookOutRight', 'eyeLookUpLeft', 'eyeLookUpRight',
  'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawOpen', 'jawRight',
  'mouthClose', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthFrownLeft', 'mouthFrownRight',
  'mouthFunnel', 'mouthLeft', 'mouthLowerDownLeft', 'mouthLowerDownRight',
  'mouthPressLeft', 'mouthPressRight', 'mouthPucker', 'mouthRight',
  'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthStretchLeft', 'mouthStretchRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight', 'noseSneerLeft', 'noseSneerRight',
] as const

export const BLENDSHAPE_COUNT = CANONICAL_BLENDSHAPES.length // 52
export const FRAME_BYTES = BLENDSHAPE_COUNT * 4 + 12 // 220
const DATA_BYTES = BLENDSHAPE_COUNT * 4 // 208

export interface BlendshapeFrame {
  blendshapes: Record<string, number>
  timestampMs: number
  seq: number
}

// CRC-16/CCITT-FALSE — 부분 수신/손상 프레임 감지용 (RT-02 수신검증 1).
export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc & 0xffff
}

// 반환 타입은 Uint8Array<ArrayBuffer> 로 고정 — livekit-client 2.20.1+ publishData 가 SharedArrayBuffer 를
// 배제한 정확한 제네릭을 요구(TS6 기본 Uint8Array<ArrayBufferLike> 와 불일치). buf 는 실제 ArrayBuffer.
export function encodeBlendshapeFrame(
  blendshapes: Record<string, number>,
  seq: number,
  timestampMs: number,
): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(FRAME_BYTES)
  const view = new DataView(buf)
  for (let i = 0; i < BLENDSHAPE_COUNT; i++) {
    view.setFloat32(i * 4, blendshapes[CANONICAL_BLENDSHAPES[i]] ?? 0, true)
  }
  view.setFloat64(DATA_BYTES, timestampMs, true)
  view.setUint16(DATA_BYTES + 8, seq & 0xffff, true)
  view.setUint16(DATA_BYTES + 10, crc16(new Uint8Array(buf, 0, DATA_BYTES)), true)
  return new Uint8Array(buf)
}

// 원격(신뢰 불가) 페이로드 → 검증된 프레임. 길이·crc 불일치는 null(호출측이 드롭).
export function decodeBlendshapeFrame(bytes: Uint8Array): BlendshapeFrame | null {
  if (bytes.byteLength !== FRAME_BYTES) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const expected = crc16(new Uint8Array(bytes.buffer, bytes.byteOffset, DATA_BYTES))
  if (view.getUint16(DATA_BYTES + 10, true) !== expected) return null
  const blendshapes: Record<string, number> = {}
  for (let i = 0; i < BLENDSHAPE_COUNT; i++) {
    const v = view.getFloat32(i * 4, true)
    if (!Number.isFinite(v)) return null // NaN/Inf(손상·악의 peer) → 드롭. 안 막으면 EMA 상태 영구 오염.
    blendshapes[CANONICAL_BLENDSHAPES[i]] = v
  }
  return {
    blendshapes,
    timestampMs: view.getFloat64(DATA_BYTES, true),
    seq: view.getUint16(DATA_BYTES + 8, true),
  }
}

// seq 역전 감지(newer-wins). 65535 순환을 고려한 half-window 비교.
// ponytail: RT-02 5프레임 재정렬 버퍼는 TURN 열화 전용 → Phase 2. 여기선 stale 드롭만.
export function isNewerSeq(prev: number, next: number): boolean {
  if (prev === 0) return true
  const diff = (next - prev + 65536) % 65536
  return diff > 0 && diff < 32768
}
