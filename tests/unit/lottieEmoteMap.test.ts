import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LOTTIE_BY_ID, MAX_LOTTIE_FLOATS } from '@/features/reaction/lottieEmoteMap'
import { EMOTE_CATALOG, EMOTE_ID_BY_EMOJI } from '@/features/reaction/reactionCatalog'
import { DEFAULT_SLOTS, MAX_FLOATS } from '@/stores/reactionStore'

// 이모트 비주얼 레이어 계약(HANDOFF-EMOTE-LOTTIE 확장점) — 매핑 키·자산 실재·역색인 정합을 고정한다.
// "자산 추가 = 파일 1개 + 매핑 1줄" 절차가 어긋나면(고아 매핑·누락 파일) 여기서 잡힌다.
describe('lottieEmoteMap', () => {
  it('매핑 키는 전부 카탈로그 id (고아 매핑 금지)', () => {
    const ids = new Set(EMOTE_CATALOG.map((e) => e.id))
    for (const key of Object.keys(LOTTIE_BY_ID)) expect(ids.has(key), key).toBe(true)
  })

  it('URL 규약 /lotties/emotes/<id>.json + public 자산 실재 + Lottie 필수 키', () => {
    for (const [id, url] of Object.entries(LOTTIE_BY_ID)) {
      expect(url).toBe(`/lotties/emotes/${id}.json`)
      const path = resolve(process.cwd(), `public${url}`) // vitest 루트 = 레포 루트
      expect(existsSync(path), url).toBe(true)
      const data = JSON.parse(readFileSync(path, 'utf8'))
      for (const k of ['v', 'fr', 'ip', 'op', 'w', 'h', 'layers']) expect(k in data, `${id}.${k}`).toBe(true)
    }
  })

  it('기본 로드아웃은 전부 Lottie 보유(옐로 세트 완비)', () => {
    for (const s of DEFAULT_SLOTS) expect(LOTTIE_BY_ID[s.id], s.id).toBeDefined()
  })

  it('emoji 역색인: 카탈로그 emoji 무중복 → 플로트(emoji-only) 역매핑 안전', () => {
    expect(EMOTE_ID_BY_EMOJI.size).toBe(EMOTE_CATALOG.length)
    for (const s of DEFAULT_SLOTS) expect(EMOTE_ID_BY_EMOJI.get(s.emoji)).toBe(s.id)
  })

  it('플로트 Lottie 상한 ≤ 전체 플로트 상한', () => {
    expect(MAX_LOTTIE_FLOATS).toBeLessThanOrEqual(MAX_FLOATS)
  })
})
