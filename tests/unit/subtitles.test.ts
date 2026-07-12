import { describe, expect, it } from 'vitest'
import { buildSrt, buildVtt } from '@/lib/ffmpeg'

// V-10 자막편집: 세그먼트→SRT(mov_text mux)/VTT(<track>) 변환 회귀 가드.
const cues = [
  { startMs: 500, endMs: 2500, text: '첫 대사' },
  { startMs: 3000, endMs: 65000, text: 'second line' },
]

describe('buildSrt', () => {
  it('SRT 포맷(인덱스·콤마 타임스탬프·본문)', () => {
    const srt = buildSrt(cues)
    expect(srt).toContain('1\n00:00:00,500 --> 00:00:02,500\n첫 대사\n')
    expect(srt).toContain('2\n00:00:03,000 --> 00:01:05,000\nsecond line\n')
  })

  it('빈 텍스트·역전 구간은 큐에서 제외', () => {
    const srt = buildSrt([
      { startMs: 0, endMs: 1000, text: '   ' },
      { startMs: 2000, endMs: 1000, text: 'inverted' },
      { startMs: 0, endMs: 1000, text: 'ok' },
    ])
    expect(srt).not.toContain('inverted')
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:01,000\nok\n')
  })

  it('전부 무효면 빈 문자열(먹싱 스킵 신호)', () => {
    expect(buildSrt([{ startMs: 0, endMs: 0, text: 'x' }]).trim()).toBe('')
  })
})

describe('buildVtt', () => {
  it('WEBVTT 헤더 + 점 타임스탬프', () => {
    const vtt = buildVtt(cues)
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
    expect(vtt).toContain('00:00:00.500 --> 00:00:02.500\n첫 대사\n')
  })
})
