import { supabase } from '@/lib/supabase'

// 방 로직 API 경계 (Phase 2).
// - 쓰기(생성/입장/퇴장)는 Edge Function 경유 — 서버가 service_role 로 RLS 우회 + 게이트 검증.
// - 읽기(로비 목록)는 public_rooms 뷰 직접 SELECT (host_id/비밀번호 제외, host_display_name만).
// SSOT: docs/API-SURFACE.md · docs/DATA-SCHEMA.md §1.2.0

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function callFn<T>(name: string, accessToken: string, body: unknown): Promise<T> {
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error ? String(json.error) : `${name} 실패 (${res.status})`)
  return json as T
}

export interface CreateRoomResult { room_id: string; participant_id: string; status: string }
export interface JoinRoomResult {
  room_id: string
  participant_id: string
  slot_index: number
  role: string
  rejoined?: boolean
}
export interface LeaveRoomResult { ok: boolean; new_host_id: string | null }

export const createRoom = (accessToken: string, title: string) =>
  callFn<CreateRoomResult>('create-room', accessToken, { title })

export const joinRoom = (accessToken: string, roomId: string) =>
  callFn<JoinRoomResult>('join-public-room', accessToken, { room_id: roomId })

export const leaveRoom = (accessToken: string, roomId: string) =>
  callFn<LeaveRoomResult>('leave-room', accessToken, { room_id: roomId })

// 로비 목록 행 (public_rooms 뷰, boundary 매핑으로 camelCase).
export interface LobbyRoom {
  id: string
  title: string
  genre: string | null
  status: string
  currentParticipants: number
  maxParticipants: number
  hostDisplayName: string | null
}

export async function fetchPublicRooms(): Promise<LobbyRoom[]> {
  const { data, error } = await supabase
    .from('public_rooms')
    .select('id, title, genre, status, current_participants, max_participants, host_display_name, created_at')
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    genre: (r.genre as string | null) ?? null,
    status: r.status as string,
    currentParticipants: (r.current_participants as number) ?? 0,
    maxParticipants: (r.max_participants as number) ?? 6,
    hostDisplayName: (r.host_display_name as string | null) ?? null,
  }))
}
