// ChatterBox 이모트 Lottie 생성기 (일회성 저작 도구 — 산출물만 커밋)
// 96×96 · fr60 · op120(2s) 심리스 루프 · 투명배경 · 옐로/앰버 라운드(fire-amber 언어)
import { writeFileSync, mkdirSync, statSync } from 'node:fs'

const OUT = '/Users/family/jason/ChatterBox/public/lotties/emotes'
mkdirSync(OUT, { recursive: true })

// ---- palette (RGB 0..1) ----
const YELLOW = [1, 0.773, 0.239]      // #FFC53D 본체
const AMBER = [1, 0.549, 0.165]       // #FF8C2A fire-amber 외곽/포인트
const DARK = [0.36, 0.227, 0]         // #5C3A00 이목구비
const GLOW = [1, 0.878, 0.541]        // #FFE08A 하이라이트
const WARM = [1, 0.96, 0.88]          // 눈물/글린트

// ---- easing anchors (motion-taste) : [x1,y1,x2,y2] ----
const SINE = [0.42, 0, 0.58, 1]        // 진동/루프 대칭
const SETTLE = [0, 0.65, 0.51, 0.99]   // settle-soft
const POP = [0.94, 0.75, 0.34, 0.94]   // expressive-pop
const SHARP = [0.2, 0.75, 0.34, 0.94]  // entrance-sharp

// ---- helpers ----
const st = (v) => ({ a: 0, k: v })
const pr = (v) => (v && typeof v === 'object' && 'a' in v ? v : st(v))
// kfs: [{t, s:number|number[], e?:[x1,y1,x2,y2], h?:1}] — 세그먼트 이징은 시작 kf 에 o+i(bodymovin 표준)
function anim(kfs) {
  return {
    a: 1,
    k: kfs.map((k, idx) => {
      const o = { t: k.t, s: Array.isArray(k.s) ? k.s : [k.s] }
      if (k.h) o.h = 1
      else if (idx < kfs.length - 1) {
        const e = k.e ?? SINE
        o.o = { x: [e[0]], y: [e[1]] }
        o.i = { x: [e[2]], y: [e[3]] }
      }
      return o
    }),
  }
}
const gr = (nm, items, tr = {}) => ({
  ty: 'gr', nm,
  it: [...items, { ty: 'tr', p: pr(tr.p ?? [0, 0]), a: pr(tr.a ?? [0, 0]), s: pr(tr.s ?? [100, 100]), r: pr(tr.r ?? 0), o: pr(tr.o ?? 100) }],
})
const el = (p, s) => ({ ty: 'el', p: st(p), s: st(s) })
const rc = (p, s, r) => ({ ty: 'rc', p: st(p), s: st(s), r: st(r) })
const sh = (v, i, o, c) => ({ ty: 'sh', ks: st({ i, o, v, c }) })
const fl = (c, o = 100) => ({ ty: 'fl', c: st([...c, 1]), o: st(o), r: 1 })
const stk = (c, w, o = 100) => ({ ty: 'st', c: st([...c, 1]), o: st(o), w: st(w), lc: 2, lj: 2 })
const OP = 120
function layer(nm, shapes, t = {}) {
  return {
    ddd: 0, ty: 4, nm, sr: 1,
    ks: { o: pr(t.o ?? 100), r: pr(t.r ?? 0), p: pr(t.p ?? [48, 48]), a: pr(t.a ?? [48, 48]), s: pr(t.s ?? [100, 100]) },
    ao: 0, ip: t.ip ?? 0, op: t.op ?? OP, st: 0, bm: 0, shapes,
  }
}
const doc = (nm, layers) => ({ v: '5.9.6', fr: 60, ip: 0, op: OP, w: 96, h: 96, nm, ddd: 0, assets: [], layers: layers.map((L, i) => ({ ...L, ind: i + 1 })) })

// 공용: 옐로 라운드 얼굴(윤곽+글로스) — 이목구비는 emote 별 items 로 주입, 전부 한 레이어(바운스 공유)
function faceShapes(features) {
  return [
    ...features,
    gr('gloss', [el([37, 36], [18, 11]), fl(WARM, 45)], { a: [37, 36], p: [37, 36], r: -18 }),
    gr('head', [el([48, 50], [66, 66]), fl(YELLOW), stk(AMBER, 3)]),
  ]
}
// 눈 아치(웃음 ∩): 중심 (cx,cy), 반폭 w — 열린 스트로크
const archEye = (cx, cy, w) =>
  sh([[cx - w, cy], [cx, cy - w * 0.9], [cx + w, cy]], [[0, 0], [-w * 0.55, 0], [0, -w * 0.5]], [[0, -w * 0.5], [w * 0.55, 0], [0, 0]], false)

// ============ 1. thumbsup 👍 ============
{
  const hand = [
    gr('lines', [
      sh([[44, 53], [68, 53]], [[0, 0], [0, 0]], [[0, 0], [0, 0]], false),
      sh([[44, 62], [68, 62]], [[0, 0], [0, 0]], [[0, 0], [0, 0]], false),
      stk(AMBER, 2, 70),
    ]),
    gr('palm', [rc([54, 59], [32, 30], 9), fl(YELLOW), stk(AMBER, 3)]),
    gr('thumb', [rc([0, 0], [13, 30], 6.5), fl(YELLOW), stk(AMBER, 3)], { a: [0, 12], p: [40, 47], r: -20 }),
  ]
  const L = layer('hand', hand, {
    a: [48, 62], p: [48, 62],
    r: anim([{ t: 0, s: 0, e: SINE }, { t: 12, s: -12, e: POP }, { t: 26, s: 7, e: SETTLE }, { t: 42, s: 0 }, { t: 120, s: 0 }]),
    s: anim([{ t: 0, s: [100, 100], e: SINE }, { t: 12, s: [94, 94], e: POP }, { t: 26, s: [110, 110], e: SETTLE }, { t: 42, s: [100, 100] }, { t: 120, s: [100, 100] }]),
  })
  write('thumbsup', doc('emote-thumbsup', [L]))
}

// ============ 2. laugh 😂 ============
{
  const mouth = gr('mouth', [
    sh([[34, 57], [62, 57], [48, 72]], [[0, 0], [0, 0], [9, 0]], [[0, 0], [0, 9], [-9, 0]], true),
    fl(DARK),
  ])
  const eyes = gr('eyes', [archEye(36, 45, 7), archEye(60, 45, 7), stk(DARK, 4.5)])
  const face = layer('face', faceShapes([eyes, mouth]), {
    a: [48, 80], p: [48, 80],
    s: anim([
      { t: 0, s: [100, 100] }, { t: 10, s: [105, 93] }, { t: 20, s: [100, 100] }, { t: 30, s: [105, 93] },
      { t: 40, s: [100, 100] }, { t: 50, s: [105, 93] }, { t: 60, s: [100, 100], e: SETTLE }, { t: 78, s: [100, 100] }, { t: 120, s: [100, 100] },
    ]),
  })
  const tear = (x, dir, t0) =>
    layer(`tear${dir}`, [gr('drop', [el([0, 0], [10, 13]), fl(WARM)])], {
      a: [0, 0],
      p: anim([{ t: t0, s: [x, 44], e: SETTLE }, { t: t0 + 26, s: [x + 6 * dir, 58], h: 1 }, { t: t0 + 60, s: [x, 44] }]),
      o: anim([{ t: t0, s: 0, e: SHARP }, { t: t0 + 8, s: 90, e: SINE }, { t: t0 + 26, s: 0, h: 1 }, { t: t0 + 60, s: 0 }]),
      r: dir > 0 ? 20 : -20,
    })
  write('laugh', doc('emote-laugh', [tear(16, -1, 8), tear(80, 1, 38), face]))
}

// ============ 3. clap 👏 ============
{
  const mitten = (side) =>
    gr('mitt', [rc([0, 0], [21, 32], 10.5), fl(YELLOW), stk(AMBER, 3)], { a: [0, 14], p: [48 + 11 * side, 52], r: 0 })
  const handL = layer('handL', [mitten(-1)], {
    a: [48, 80], p: [48, 80],
    r: anim([{ t: 0, s: -27 }, { t: 16, s: -1, e: POP }, { t: 40, s: -27 }, { t: 56, s: -1, e: POP }, { t: 80, s: -27 }, { t: 96, s: -1, e: POP }, { t: 120, s: -27 }]),
  })
  const handR = layer('handR', [mitten(1)], {
    a: [48, 80], p: [48, 80],
    r: anim([{ t: 0, s: 27 }, { t: 16, s: 1, e: POP }, { t: 40, s: 27 }, { t: 56, s: 1, e: POP }, { t: 80, s: 27 }, { t: 96, s: 1, e: POP }, { t: 120, s: 27 }]),
  })
  const sparkShapes = [
    sh([[48, 34], [48, 19]], [[0, 0], [0, 0]], [[0, 0], [0, 0]], false),
    sh([[38, 35], [31, 26]], [[0, 0], [0, 0]], [[0, 0], [0, 0]], false),
    sh([[58, 35], [65, 26]], [[0, 0], [0, 0]], [[0, 0], [0, 0]], false),
    stk(GLOW, 5),
  ]
  const spark = layer('spark', [gr('rays', sparkShapes)], {
    a: [48, 30], p: [48, 30],
    o: anim([
      { t: 0, s: 0, h: 1 }, { t: 16, s: 100, e: SETTLE }, { t: 28, s: 0, h: 1 },
      { t: 56, s: 100, e: SETTLE }, { t: 68, s: 0, h: 1 }, { t: 96, s: 100, e: SETTLE }, { t: 108, s: 0, h: 1 }, { t: 120, s: 0 },
    ]),
    s: anim([
      { t: 0, s: [60, 60], h: 1 }, { t: 16, s: [70, 70], e: SETTLE }, { t: 28, s: [125, 125], h: 1 },
      { t: 56, s: [70, 70], e: SETTLE }, { t: 68, s: [125, 125], h: 1 }, { t: 96, s: [70, 70], e: SETTLE }, { t: 108, s: [125, 125], h: 1 }, { t: 120, s: [60, 60] },
    ]),
  })
  write('clap', doc('emote-clap', [spark, handL, handR]))
}

// ============ 4. fire 🔥 ============
{
  const flamePath = (k) => // k = 크기 배율, 중심 (48, 바닥 78 기준)
    sh(
      [[48, 78 - 62 * k], [48 + 22 * k, 78 - 22 * k], [48, 78], [48 - 22 * k, 78 - 22 * k]],
      [[-6 * k, 14 * k], [4 * k, -16 * k], [14 * k, 0], [0, 12 * k]],
      [[6 * k, 14 * k], [0, 12 * k], [-14 * k, 0], [-2 * k, -18 * k]],
      true
    )
  const outer = layer('outer', [gr('f', [flamePath(1), fl(AMBER)])], {
    a: [48, 78], p: [48, 78],
    s: anim([{ t: 0, s: [100, 100] }, { t: 30, s: [105, 108] }, { t: 60, s: [97, 95] }, { t: 90, s: [103, 105] }, { t: 120, s: [100, 100] }]),
    r: anim([{ t: 0, s: 0 }, { t: 30, s: 2.5 }, { t: 60, s: -2 }, { t: 90, s: 1.5 }, { t: 120, s: 0 }]),
  })
  const inner = layer('inner', [gr('f', [flamePath(0.58), fl(YELLOW)])], {
    a: [48, 78], p: [48, 78],
    s: anim([{ t: 0, s: [100, 103] }, { t: 30, s: [95, 96] }, { t: 60, s: [104, 107] }, { t: 90, s: [98, 97] }, { t: 120, s: [100, 103] }]),
    r: anim([{ t: 0, s: -1.5 }, { t: 30, s: 1.5 }, { t: 60, s: -1 }, { t: 90, s: 2 }, { t: 120, s: -1.5 }]),
  })
  const core = layer('core', [gr('c', [el([48, 66], [13, 16]), fl(GLOW)])], {
    a: [48, 78], p: [48, 78],
    s: anim([{ t: 0, s: [100, 100] }, { t: 30, s: [110, 112] }, { t: 60, s: [92, 90] }, { t: 90, s: [106, 108] }, { t: 120, s: [100, 100] }]),
  })
  const ember = (nm, x, t0, dur) =>
    layer(nm, [gr('e', [el([0, 0], [5, 5]), fl(GLOW)])], {
      a: [0, 0],
      p: anim([{ t: t0, s: [x, 58], e: SETTLE }, { t: t0 + dur, s: [x - 6, 24], h: 1 }, { t: 119, s: [x, 58] }]),
      o: anim([{ t: t0, s: 0, e: SHARP }, { t: t0 + 8, s: 90, e: SINE }, { t: t0 + dur, s: 0, h: 1 }, { t: 119, s: 0 }]),
    })
  write('fire', doc('emote-fire', [ember('emberA', 44, 6, 44), ember('emberB', 54, 62, 48), core, inner, outer]))
}

// ============ 5. heart ❤️ ============
{
  const heart = sh(
    [[48, 26.3], [25.6, 26.3], [25.6, 48.7], [48, 70.4], [70.4, 48.7], [70.4, 26.3]],
    [[5.6, -6.3], [5.6, -6.3], [-5.6, -6.3], [0, 0], [0, 0], [5.6, 6.3]],
    [[-5.6, -6.3], [-5.6, 6.3], [0, 0], [0, 0], [5.6, -6.3], [-5.6, -6.3]],
    true
  )
  const beat = anim([
    { t: 0, s: [100, 100], e: POP }, { t: 8, s: [115, 115], e: SETTLE }, { t: 18, s: [103, 103], e: POP },
    { t: 26, s: [111, 111], e: SETTLE }, { t: 44, s: [100, 100] }, { t: 120, s: [100, 100] },
  ])
  const L = layer('heart', [
    gr('gloss', [el([38, 34], [14, 9]), fl(WARM, 50)], { a: [38, 34], p: [38, 34], r: -22 }),
    gr('h', [heart, fl(AMBER), stk(AMBER, 2)]),
  ], { a: [48, 48], p: [48, 48], s: beat })
  write('heart', doc('emote-heart', [L]))
}

// ============ 6. cry 😢 ============
{
  const frown = sh([[40, 67], [56, 67]], [[0, 0], [-5, -6]], [[5, -6], [0, 0]], false) // 중앙이 위로 볼록한 ∩ = 시무룩
  const features = [
    gr('eyeL', [el([36, 46], [9, 9]), fl(DARK)]),
    gr('eyeR', [el([60, 46], [9, 9]), fl(DARK)]),
    gr('brows', [
      sh([[29, 37], [41, 33]], [[0, 0], [0, 0]], [[0, 0], [0, 0]], false), // 안쪽이 올라간 걱정 눈썹
      sh([[55, 33], [67, 37]], [[0, 0], [0, 0]], [[0, 0], [0, 0]], false),
      stk(DARK, 3.5, 85),
    ]),
    gr('frown', [frown, stk(DARK, 4.5)]),
  ]
  const face = layer('face', faceShapes(features), {
    a: [48, 80], p: [48, 80],
    s: anim([{ t: 0, s: [100, 100] }, { t: 30, s: [101, 98.5] }, { t: 60, s: [100, 100] }, { t: 90, s: [101, 98.5] }, { t: 120, s: [100, 100] }]),
  })
  const tear = (t0) =>
    layer(`tear${t0}`, [gr('drop', [
      sh([[0, -7], [5, 2], [0, 7], [-5, 2]], [[3, -4], [0, -3], [3, 3], [0, 3]], [[-3, -4], [0, 3], [-3, 3], [0, -3]], true),
      fl(WARM),
    ])], {
      a: [0, 0],
      p: anim([{ t: t0, s: [61, 50], e: SETTLE }, { t: t0 + 22, s: [62, 60], e: SHARP }, { t: t0 + 38, s: [63, 78], h: 1 }, { t: t0 + 60, s: [61, 50] }]),
      s: anim([{ t: t0, s: [40, 40], e: SETTLE }, { t: t0 + 14, s: [100, 100] }, { t: t0 + 38, s: [100, 100], h: 1 }, { t: t0 + 60, s: [40, 40] }]),
      o: anim([{ t: t0, s: 0, e: SHARP }, { t: t0 + 8, s: 95, e: SINE }, { t: t0 + 30, s: 95, e: SINE }, { t: t0 + 38, s: 0, h: 1 }, { t: t0 + 60, s: 0 }]),
    })
  write('cry', doc('emote-cry', [tear(0), tear(60), face]))
}

// ============ 7. wow 😮 ============
{
  const features = [
    gr('eyeL', [el([36, 44], [11, 11]), fl(DARK)]),
    gr('eyeR', [el([60, 44], [11, 11]), fl(DARK)]),
    gr('glintL', [el([38, 42], [3.5, 3.5]), fl(WARM)]),
    gr('glintR', [el([62, 42], [3.5, 3.5]), fl(WARM)]),
    gr('brows', [archEye(36, 31, 6), archEye(60, 31, 6), stk(DARK, 3.5, 85)]),
  ]
  const mouth = layer('mouth', [gr('o', [el([48, 64], [15, 18]), fl(DARK)])], {
    a: [48, 64], p: anim([{ t: 0, s: [48, 64] }, { t: 30, s: [48, 64.8] }, { t: 60, s: [48, 64] }, { t: 90, s: [48, 64.8] }, { t: 120, s: [48, 64] }]),
    s: anim([{ t: 0, s: [100, 100] }, { t: 30, s: [112, 118] }, { t: 60, s: [100, 100] }, { t: 90, s: [112, 118] }, { t: 120, s: [100, 100] }]),
  })
  const face = layer('face', faceShapes(features), {
    a: [48, 80], p: [48, 80],
    s: anim([{ t: 0, s: [100, 100] }, { t: 30, s: [104, 104] }, { t: 60, s: [100, 100] }, { t: 90, s: [104, 104] }, { t: 120, s: [100, 100] }]),
  })
  write('wow', doc('emote-wow', [mouth, face]))
}

// ============ 8. question ❓ (핑) ============
{
  const qMark = gr('q', [
    sh([[36, 33], [48, 21], [60, 33], [48, 46], [48, 53]],
      [[0, 0], [-7, 0], [0, -7], [5, -6], [0, -4]],
      [[0, -7], [7, 0], [0, 7], [0, 4], [0, 0]], false),
    stk(AMBER, 9),
  ])
  const dot = gr('dot', [el([48, 67], [11, 11]), fl(AMBER)])
  const mark = layer('mark', [qMark, dot], {
    a: [48, 46], p: [48, 46],
    r: anim([{ t: 0, s: 0, e: POP }, { t: 8, s: -8, e: SETTLE }, { t: 22, s: 5, e: SETTLE }, { t: 36, s: 0 }, { t: 60, s: 0, e: POP }, { t: 68, s: -8, e: SETTLE }, { t: 82, s: 5, e: SETTLE }, { t: 96, s: 0 }, { t: 120, s: 0 }]),
    s: anim([{ t: 0, s: [100, 100], e: POP }, { t: 8, s: [112, 112], e: SETTLE }, { t: 24, s: [100, 100] }, { t: 60, s: [100, 100], e: POP }, { t: 68, s: [112, 112], e: SETTLE }, { t: 84, s: [100, 100] }, { t: 120, s: [100, 100] }]),
  })
  const ring = (t0) =>
    layer(`ring${t0}`, [gr('r', [el([48, 46], [40, 40]), stk(AMBER, 4)])], {
      a: [48, 46], p: [48, 46],
      s: anim([{ t: t0, s: [46, 46], e: SETTLE }, { t: t0 + 36, s: [185, 185], h: 1 }, { t: t0 + 60, s: [46, 46] }]),
      o: anim([{ t: t0, s: 60, e: SINE }, { t: t0 + 36, s: 0, h: 1 }, { t: t0 + 60, s: 60 }]),
    })
  write('question', doc('emote-question', [ring(0), ring(60), mark]))
}

// ---- write + validate ----
function write(id, json) {
  const path = `${OUT}/${id}.json`
  const s = JSON.stringify(json)
  JSON.parse(s) // validate
  writeFileSync(path, s)
  console.log(`${id}.json  ${(statSync(path).size / 1024).toFixed(1)}KB`)
}
