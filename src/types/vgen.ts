// VGEN(AI 영상생성) 도메인 타입 — slice1. DB snake_case ↔ React camelCase 경계.
// SSOT: docs/DATA-SCHEMA.md §1.8 · docs/state-machines/Vgen.md

export type VgenStatus = 'pending' | 'generating' | 'done' | 'failed' | 'flagged'

export interface VgenJob {
  id: string
  roomId: string
  triggeredBy: string
  promptText: string
  status: VgenStatus
  creditCost: number
  resultUrl: string | null
  durationSec: number
  failureReason: string | null
  createdAt: string
}
