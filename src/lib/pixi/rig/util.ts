// 순수 수학 헬퍼 (원천: SNACK 플레이어 src/core/utils.js의 수학 부분만).
import type { BBox, Vec2 } from './types'

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function bboxCenter(bbox: BBox): Vec2 {
  return [bbox[0] + bbox[2] / 2, bbox[1] + bbox[3] / 2]
}

export function groupBy<T>(items: T[], getKey: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = getKey(item)
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
    return groups
  }, {})
}
