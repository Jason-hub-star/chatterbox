// PNG→Live2D 리깅 잡 타입. 와이어는 snake_case(DB), React 안은 camelCase(avatarJobs.ts 매핑).
export type AvatarJobStatus = 'queued' | 'running' | 'done' | 'failed'
export type AvatarJobPhase = 'analyzing' | 'cutting' | 'rigging' | 'finishing' | null

export interface AvatarJob {
  id: string
  userId: string
  status: AvatarJobStatus
  phase: AvatarJobPhase
  resultProjectUrl: string | null
  error: string | null
  createdAt: string
  cached: boolean // provider==='cache' — 콘텐츠-해시 디덥으로 즉시 반환된 재사용 잡(레버 ④)
}
