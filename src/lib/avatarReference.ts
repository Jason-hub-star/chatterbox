// 선택 아바타를 reference-to-video 참조 시트로: 오프스크린 고해상 렌더 → PNG Blob → R2 업로드 → get_url.
// 캡처는 RigAvatar.extract()(PixiJS 정식 픽셀 추출) 사용 — WebGL 캔버스 toBlob 은 preserveDrawingBuffer
// 미설정 시 빈 이미지가 나올 수 있어 회피. SSOT: docs/contracts/VgenPanel.md §참조 이미지
import { RigAvatar } from '@/lib/pixi/rig'
import { createVgenReferenceUpload } from '@/lib/vgen'

// 아바타 rig 를 오프스크린 고해상으로 렌더 → RGBA 픽셀 추출 → 2D 캔버스 경유 PNG Blob.
export async function renderAvatarSheet(projectUrl: string, size = 1024): Promise<Blob> {
  const mount = document.createElement('div')
  mount.style.cssText = `position:fixed;left:-99999px;top:0;width:${size}px;height:${size}px;background:#e9e6df`
  document.body.appendChild(mount)
  let avatar: RigAvatar | null = null
  try {
    avatar = await RigAvatar.create(mount, { projectUrl, size })
    await new Promise((r) => setTimeout(r, 800)) // 물리/조립 안정
    const { pixels, width, height } = avatar.extract()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d 컨텍스트 없음')
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0)
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG 캡처 실패'))), 'image/png'),
    )
  } finally {
    avatar?.destroy()
    mount.remove()
  }
}

// 선택 아바타 → 참조 시트 → R2 업로드 → fal 이 fetch 할 get_url 반환.
export async function uploadAvatarReference(accessToken: string, roomId: string, projectUrl: string): Promise<string> {
  const blob = await renderAvatarSheet(projectUrl)
  const { upload_url, get_url } = await createVgenReferenceUpload(accessToken, roomId, 'image/png')
  const put = await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: blob })
  if (!put.ok) throw new Error(`참조 업로드 실패 (${put.status})`)
  return get_url
}
