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

export interface KickResult { ok: boolean; kicked_identity: string; display_name: string | null }

// 호스트 강퇴 (HOST-01). target = LiveKit identity(=auth uid). 서버가 rooms.host_id 로 권한 검증.
export const kickParticipant = (accessToken: string, roomId: string, targetIdentity: string) =>
  callFn<KickResult>('kick-participant', accessToken, { room_id: roomId, target_identity: targetIdentity })

// 리액션 서버 릴레이(ROOM-19). 서버가 멤버십 검증 후 방 전체 broadcast — 클라 직접 방송보다 유실0·스푸핑 불가.
export const sendReactionRelay = (accessToken: string, roomId: string, emoji: string, idempotencyKey: string) =>
  callFn<{ ok: boolean }>('send-reaction', accessToken, { room_id: roomId, emoji, idempotency_key: idempotencyKey })

// 대본 큐 진행 서버 릴레이(SEC-5). 서버가 host 검증 후 방 전체 broadcast — 클라 직접 publish 의 진행권한 스푸핑·유실 제거.
export const advanceScriptCueRelay = (accessToken: string, roomId: string, sceneId: string, cueIndex: number) =>
  callFn<{ ok: boolean }>('advance-script-cue', accessToken, { room_id: roomId, scene_id: sceneId, cue_index: cueIndex })

export interface MuteResult { ok: boolean; muted: boolean; target_identity: string; display_name: string | null }

// 호스트 음소거/해제 (HOST-08). 서버가 canPublish 를 토글 + muted_by_host 를 DB 에 기록.
export const setParticipantMute = (accessToken: string, roomId: string, targetIdentity: string, muted: boolean) =>
  callFn<MuteResult>('set-participant-mute', accessToken, { room_id: roomId, target_identity: targetIdentity, muted })

export interface SetPasswordResult { ok: boolean; is_locked: boolean }

// 호스트 방 비밀번호 설정/해제 (HOST-06). password '' 이면 잠금 해제. 해시는 서버 room_secrets 에만.
export const setRoomPassword = (accessToken: string, roomId: string, password: string) =>
  callFn<SetPasswordResult>('set-room-password', accessToken, { room_id: roomId, password })

// 잠금방 비밀번호 입장. 서버가 PBKDF2 로 대조(상수시간). 결과는 join-public-room 과 동일 형태.
export const joinRoomWithPassword = (accessToken: string, roomId: string, password: string) =>
  callFn<JoinRoomResult>('join-room-with-password', accessToken, { room_id: roomId, password })

// 로비 목록 행 (public_rooms 뷰, boundary 매핑으로 camelCase).
export interface LobbyRoom {
  id: string
  title: string
  genre: string | null
  status: string
  currentParticipants: number
  maxParticipants: number
  hostDisplayName: string | null
  isLocked: boolean
}

export async function fetchPublicRooms(): Promise<LobbyRoom[]> {
  const { data, error } = await supabase
    .from('public_rooms')
    .select('id, title, genre, status, current_participants, max_participants, host_display_name, is_locked, created_at')
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
    isLocked: (r.is_locked as boolean) ?? false,
  }))
}
