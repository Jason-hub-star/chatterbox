import { Application, Container, Graphics } from 'pixi.js'

// PoC 절차적 얼굴 아바타 (PixiJS v8 Graphics).
// ponytail: 실제 제품은 43 PNG 파츠 rig + rig.json ParameterDriver (reference/patterns/pixijs-v8-avatar-render.md §2·§4).
// 여기선 rig 에셋이 아직 없어 blendshape→얼굴 파이프라인만 증명한다. 에셋 생기면 이 클래스를 RigRenderer로 교체.
export interface FaceParams {
  eyeOpenLeft: number // 0(감음)~1(뜸)
  eyeOpenRight: number
  mouthOpen: number // 0~1
  smile: number // 0~1
  browRaise: number // 0~1
  headRoll: number // 라디안
}

const NEUTRAL: FaceParams = {
  eyeOpenLeft: 1,
  eyeOpenRight: 1,
  mouthOpen: 0,
  smile: 0,
  browRaise: 0,
  headRoll: 0,
}

export class ProceduralAvatar {
  private readonly face: Container
  private readonly head: Graphics
  private readonly r: number
  private readonly smoothed: FaceParams = { ...NEUTRAL }

  private constructor(
    private readonly app: Application,
    size: number,
  ) {
    this.r = size * 0.32
    this.face = new Container()
    this.face.x = size / 2
    this.face.y = size / 2
    this.head = new Graphics()
    this.face.addChild(this.head)
    this.app.stage.addChild(this.face)
    this.redraw()
  }

  static async create(container: HTMLElement, size = 360): Promise<ProceduralAvatar> {
    const app = new Application()
    await app.init({
      width: size,
      height: size,
      backgroundColor: 0x14141a,
      antialias: true,
    })
    container.appendChild(app.canvas)
    return new ProceduralAvatar(app, size)
  }

  // MediaPipe 프레임마다 호출. EMA로 지터 완화 후 다시 그린다.
  // ponytail: One-Euro 필터 대신 단순 EMA(α) — PoC 충분. 정밀 스무딩은 Phase 2.
  update(target: FaceParams): void {
    const a = 0.45
    const s = this.smoothed
    s.eyeOpenLeft += (target.eyeOpenLeft - s.eyeOpenLeft) * a
    s.eyeOpenRight += (target.eyeOpenRight - s.eyeOpenRight) * a
    s.mouthOpen += (target.mouthOpen - s.mouthOpen) * a
    s.smile += (target.smile - s.smile) * a
    s.browRaise += (target.browRaise - s.browRaise) * a
    s.headRoll += (target.headRoll - s.headRoll) * a
    this.redraw()
  }

  destroy(): void {
    this.app.destroy({ removeView: true }, { children: true, texture: true })
  }

  private redraw(): void {
    const s = this.smoothed
    const r = this.r
    const g = this.head
    this.face.rotation = s.headRoll
    g.clear()

    // 머리 + 귀
    g.circle(-r, 0, r * 0.18).fill(0xe8b98f)
    g.circle(r, 0, r * 0.18).fill(0xe8b98f)
    g.circle(0, 0, r).fill(0xf2c9a0).stroke({ width: 3, color: 0x5a3b22, alpha: 0.35 })

    // 눈썹 (browRaise만큼 위로)
    const browY = -r * 0.34 - s.browRaise * r * 0.14
    g.roundRect(-r * 0.58, browY, r * 0.42, r * 0.07, 3).fill(0x5a3b22)
    g.roundRect(r * 0.16, browY, r * 0.42, r * 0.07, 3).fill(0x5a3b22)

    // 눈 (openness로 높이 조절 → 깜박임)
    this.drawEye(-r * 0.35, -r * 0.08, r * 0.17, r * 0.19 * s.eyeOpenLeft)
    this.drawEye(r * 0.35, -r * 0.08, r * 0.17, r * 0.19 * s.eyeOpenRight)

    // 코
    g.circle(0, r * 0.12, r * 0.05).fill(0xd9a986)

    // 입 (smile=corner lift, mouthOpen=lower lip drop)
    const cy = r * 0.5
    const w = r * 0.3
    const lift = s.smile * r * 0.16
    const open = s.mouthOpen * r * 0.3
    g.poly(
      [-w, cy - lift, 0, cy - lift * 0.35, w, cy - lift, 0, cy + Math.max(2, open)],
      true,
    ).fill(0x8a3b3b)
  }

  private drawEye(cx: number, cy: number, rx: number, ry: number): void {
    const g = this.head
    const openRy = Math.max(1.5, ry)
    g.ellipse(cx, cy, rx, openRy).fill(0xffffff).stroke({ width: 2, color: 0x5a3b22, alpha: 0.5 })
    if (ry > rx * 0.35) g.circle(cx, cy, rx * 0.5).fill(0x2a2a2a) // 충분히 떴을 때만 동공
  }
}
