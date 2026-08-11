import { describe, expect, it } from 'vitest'
import { SHOP_SAFE_AREA, WORLDS, resolveWorld, type HubShop } from '@/scenes/manifest'

// 광장 가게 좌표 계약 게이트(GOAL-plaza-fit F5, 2026-08-11).
// 광장은 3:2 원화를 뷰포트에 cover 하므로 화면비 1.8 에서 위아래 8.3% 가 잘린다 — 캔버스 끝에 붙은
// 박스는 화면 밖으로 밀린다(감사 실측: 동양 야외무대가 16:9 에서 77.6%, 21:9 에서 37% 만 보였다).
// 여기서 막지 않으면 **새 월드를 캘리브할 때마다 같은 실수가 반복된다** — 원화에 맞춰 끝까지 붙이는 게
// 캘리브의 자연스러운 손버릇이기 때문이다. 실렌더 게이트는 scripts/check-plaza-fit.mjs(뷰포트 6종).
const worldIds = Object.keys(WORLDS)

function overlapArea(a: HubShop['box'], b: HubShop['box']): number {
  const w = Math.min(a.l + a.w, b.l + b.w) - Math.max(a.l, b.l)
  const h = Math.min(a.t + a.h, b.t + b.h) - Math.max(a.t, b.t)
  return w > 0 && h > 0 ? w * h : 0 // 변이 닿는 것(=0)은 허용, 면적이 생기면 겹침
}

describe('광장 가게 안전영역 (전 월드)', () => {
  it('월드 레지스트리가 비어있지 않다 (순회 게이트의 전제)', () => {
    expect(worldIds.length).toBeGreaterThan(0)
  })

  it.each(worldIds)('%s — 모든 가게 박스가 안전영역 안에 있다', (id) => {
    const offenders = resolveWorld(id).plaza.blocks.flatMap((block, bi) =>
      block.shops
        .map(({ dest, box }) => {
          const bad: string[] = []
          if (box.l < SHOP_SAFE_AREA.l) bad.push(`l ${box.l} < ${SHOP_SAFE_AREA.l}`)
          if (box.t < SHOP_SAFE_AREA.t) bad.push(`t ${box.t} < ${SHOP_SAFE_AREA.t}`)
          if (box.l + box.w > SHOP_SAFE_AREA.r) bad.push(`r ${box.l + box.w} > ${SHOP_SAFE_AREA.r}`)
          if (box.t + box.h > SHOP_SAFE_AREA.b) bad.push(`b ${box.t + box.h} > ${SHOP_SAFE_AREA.b}`)
          return bad.length ? `block${bi}/${dest}: ${bad.join(', ')}` : null
        })
        .filter((x): x is string => x !== null),
    )
    expect(offenders, `안전영역 이탈 — cover 에서 잘린다: ${offenders.join(' | ')}`).toEqual([])
  })

  it.each(worldIds)('%s — 가게 박스끼리 겹치지 않는다 (호버 우선권 모호 방지)', (id) => {
    const overlaps = resolveWorld(id).plaza.blocks.flatMap((block, bi) => {
      const found: string[] = []
      for (let i = 0; i < block.shops.length; i++) {
        for (let j = i + 1; j < block.shops.length; j++) {
          const area = overlapArea(block.shops[i].box, block.shops[j].box)
          if (area > 0) found.push(`block${bi}/${block.shops[i].dest}×${block.shops[j].dest} (${area.toFixed(2)}%²)`)
        }
      }
      return found
    })
    expect(overlaps, `박스 겹침: ${overlaps.join(' | ')}`).toEqual([])
  })

  it.each(worldIds)('%s — 가게 목적지가 중복 없이 7종 전부 있다', (id) => {
    for (const block of resolveWorld(id).plaza.blocks) {
      const dests = block.shops.map((s) => s.dest)
      expect(new Set(dests).size, `중복 dest: ${dests.join(',')}`).toBe(dests.length)
      expect(dests.sort()).toEqual(['create', 'practice', 'profile', 'reserved', 'rooms', 'social', 'troupe'])
    }
  })

  it.each(worldIds)('%s — 점등 코어가 박스 안(0~100%%)에 있다', (id) => {
    const offenders = resolveWorld(id).plaza.blocks.flatMap((block) =>
      block.shops.flatMap(({ dest, cores }) =>
        cores
          .filter((c) => c.x < 0 || c.x > 100 || c.y < 0 || c.y > 100)
          .map((c) => `${dest}: (${c.x}, ${c.y})`),
      ),
    )
    expect(offenders, `코어가 박스 밖: ${offenders.join(' | ')}`).toEqual([])
  })
})
