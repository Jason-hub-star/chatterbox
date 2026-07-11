// project.json + 파츠 이미지 로더. 원천: SNACK 플레이어 src/{main,core/utils}.js.
// projectUrl은 파라미터 — 특정 모델 하드코딩 아님(전 AUTORIG 모델 로드 가능, rig-format §7.5).

import type { Part, Project, RigConfig } from './types'
import { normalizeRig } from './rigMath'

export interface LoadedAvatar {
  project: Project
  rig: RigConfig
  images: Map<string, HTMLImageElement>
}

// project.json URL에서 파츠 베이스 경로 파생 (파일명 제거). 빌드가 _project_base_url을
// 안 박으므로 로더가 채운다 — source_path는 상대경로(parts/xxx.webp).
function deriveBaseUrl(projectUrl: string): string {
  return projectUrl.slice(0, projectUrl.lastIndexOf('/') + 1)
}

// 보안: 신뢰 오리진만(동일 오리진 또는 *.supabase.co). 임의 외부 URL 로드 차단 —
// 원본 플레이어 런타임 화이트리스트와 동일 정책(페이블 보안리뷰 반영).
function assertTrustedOrigin(projectUrl: string): void {
  const host = new URL(projectUrl, location.href).hostname
  if (host !== location.hostname && !host.endsWith('.supabase.co')) {
    throw new Error(`허용되지 않은 project URL origin: ${host}`)
  }
}

function partImageUrl(project: Project, part: Part): string {
  const v = project.generated_at || ''
  return `${project._project_base_url ?? ''}${part.source_path}${v ? `?v=${encodeURIComponent(v)}` : ''}`
}

async function loadImages(project: Project): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>()
  await Promise.all(
    project.parts.map(
      (part) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image()
          image.crossOrigin = 'anonymous' // Storage(크로스오리진) 텍스처를 WebGL이 쓰려면 필수
          image.onload = () => {
            images.set(part.id, image)
            resolve()
          }
          image.onerror = () => reject(new Error(`image failed: ${part.source_path}`))
          image.src = partImageUrl(project, part)
        }),
    ),
  )
  return images
}

export async function loadRigProject(projectUrl: string): Promise<LoadedAvatar> {
  assertTrustedOrigin(projectUrl)
  // project.json은 같은 URL로 내용이 갱신되는 가변 포인터 — Storage가 max-age=3600이라 기본 캐시면
  // 업데이트 후에도 유저가 최대 1시간(+캐시 엔트리 수명) 구본을 본다(2026-07-11 실측: 하드 리프레시도
  // 로드 후 fetch에는 무효). no-cache = ETag 재검증(304)이라 비용 미미. 파츠는 ?v=generated_at 불변 캐시.
  const response = await fetch(projectUrl, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`${projectUrl} ${response.status}`)
  const project = (await response.json()) as Project

  project._project_base_url = project._project_base_url || deriveBaseUrl(projectUrl)

  const rig = normalizeRig(project._mini_rig)
  // render_mode: AUTORIG 산출은 항상 메시변형. _mini_rig가 인라인 안 됐을 때 sprite 폴백(오작동)
  // 방지 — mesh를 기본 보장(rig-format §2, avatar-pipeline §2).
  rig.render_mode = rig.render_mode || 'mesh'

  const images = await loadImages(project)
  return { project, rig, images }
}
