// AUTORIG 실 rig 아바타 — SNACK 플레이어 렌더러의 인스턴스화 이식.
// 인터페이스는 create/destroy + setParams(ParamXxx) 계약. 각 인스턴스가
// 자체 App·ctx·rig 수학·렌더러·티커를 소유 → 멀티 participant가 서로 독립(경로 B 전제).
//
// 구동 계층(rig-format §3, avatar-pipeline §3):
//  - setParams(ParamXxx): 트래킹(로컬 웹캠 / 원격 RT-02)·표정 번들이 여기로 들어온다(B2/B3).
//  - 물리(머리·머리카락 스프링)는 티커가 매 프레임 stepPhysics로 갱신 — 물리 소유 파라미터는
//    setParams가 덮어쓰지 않는다(스프링 출력 보존).

import { Application } from 'pixi.js'
import type { RigParams, RigContext } from './types'
import { loadRigProject } from './loader'
import { createRigMath, type RigMath } from './rigMath'
import { createRenderer, type Renderer } from './renderer'

export interface RigAvatarOptions {
  projectUrl: string // project.json URL — 모델별(특정 모델 하드코딩 아님)
  size?: number // 표시 캔버스 한 변(px). 내부는 canvas_size(예 2048²) 렌더 후 CSS 다운스케일.
  transparent?: boolean // 룸 합성용 투명 배경(기본 false = #f4f0e8, 플레이어 골든 대조).
  preserveDrawingBuffer?: boolean // 방송 다운스케일 캡처용(2D canvas drawImage 로 프레임 읽기) — 기본 false.
}

const MAX_DT = 1 / 15 // 탭 복귀 시 물리 폭주 방지

export class RigAvatar {
  private disposed = false
  private tick = (): void => {}

  private constructor(
    private readonly app: Application,
    private readonly ctx: RigContext,
    private readonly rig: RigMath,
    private readonly renderer: Renderer,
    private readonly ownedParams: Set<string>,
  ) {}

  static async create(container: HTMLElement, options: RigAvatarOptions): Promise<RigAvatar> {
    const { project, rig: rigConfig, images } = await loadRigProject(options.projectUrl)

    const ctx: RigContext = {
      project,
      images,
      rig: rigConfig,
      parameters: Object.fromEntries(project.parameters.map((p) => [p.id, p.default])),
      physics: new Map(),
    }

    const rig = createRigMath(ctx)
    rig.initPhysicsState(project)

    // 내부 렌더 해상도 = 표시 크기(×DPR, 최대 2) — canvas_size(예 2048²) 풀렌더는 표시가
    // 190~500px 인데도 프레임당 4~100배 픽셀을 태워 거울/6인 무대가 렉 걸린 듯 움직였다
    // (2026-07-10 주인님 실측). stage 를 균일 스케일해 rig 좌표계는 그대로 둔다.
    const size = options.size ?? 360
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const maxDim = Math.max(project.canvas_size[0], project.canvas_size[1]) || 1
    const renderScale = Math.min(1, (size * dpr) / maxDim)

    const app = new Application()
    await app.init({
      width: Math.max(1, Math.round(project.canvas_size[0] * renderScale)),
      height: Math.max(1, Math.round(project.canvas_size[1] * renderScale)),
      preference: 'webgl',
      background: '#f4f0e8',
      backgroundAlpha: options.transparent ? 0 : 1,
      autoStart: false, // 티커는 아래에서 직접 구동(stepPhysics→drawPixi)
      antialias: true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false, // drawImage 복사 캡처 안정
    })

    const renderer = createRenderer(app, ctx, rig, { transparent: options.transparent })
    renderer.buildScene(project)
    app.stage.scale.set(renderScale)
    if (project.canvas_origin) {
      app.stage.position.set(
        (project.canvas_origin[0] || 0) * renderScale,
        (project.canvas_origin[1] || 0) * renderScale,
      )
    }

    // 표시 크기: CSS 정사각 (내부 해상도와 무관하게 레이아웃 고정).
    app.canvas.style.width = `${size}px`
    app.canvas.style.height = `${size}px`
    app.canvas.style.display = 'block'
    container.appendChild(app.canvas)

    const ownedParams = new Set(
      (project.physics_profiles || []).map((p) => p.output_parameter).filter(Boolean) as string[],
    )

    const avatar = new RigAvatar(app, ctx, rig, renderer, ownedParams)
    avatar.start()
    return avatar
  }

  private start(): void {
    this.tick = () => {
      if (this.disposed) return
      const dt = Math.min(this.app.ticker.deltaMS / 1000, MAX_DT)
      this.rig.stepPhysics(dt)
      this.renderer.drawPixi()
    }
    this.app.ticker.add(this.tick)
    this.app.ticker.start()
  }

  // ParamXxx 값 주입. 물리 소유 파라미터(body sway 등)는 스프링 출력 보존 위해 건너뜀.
  setParams(params: RigParams): void {
    if (this.disposed) return
    for (const [id, value] of Object.entries(params)) {
      if (this.ownedParams.has(id)) continue
      this.rig.setParameterValue(id, value)
    }
  }

  // dev 골든 대조용 — 현재 스테이지 픽셀 추출(중립 포즈 등). frame=[x,y,w,h]로 영역 한정 가능.
  extract(frame?: [number, number, number, number]) {
    return this.renderer.extractPixels(frame)
  }

  // dev 진단용 — 현재 파라미터 스냅샷(E2E에서 원격 구동 도달 확인).
  debugParams(): Record<string, number> {
    return { ...this.ctx.parameters }
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas
  }

  destroy(): void {
    if (this.disposed) return
    this.disposed = true
    this.app.ticker.remove(this.tick)
    this.app.destroy({ removeView: true }, { children: true, texture: true })
  }
}
