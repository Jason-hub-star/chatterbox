import { supabase } from '@/lib/supabase'

// 방 로직 API 경계 (Phase 2).
// - 쓰기(생성/입장/퇴장)는 Edge Function 경유 — 서버가 service_role 로 RLS 우회 + 게이트 검증.
// - 읽기(로비 목록)는 public_rooms 뷰 직접 SELECT (host_id/비밀번호 제외, host_display_name만).
// SSOT: docs/API-SURFACE.md · docs/DATA-SCHEMA.md §1.2.0

import { callFn } from '@/lib/edgeFn'
import type { ChatMessage } from '@/stores/roomStore'

export interface CreateRoomResult { room_id: string; participant_id: string; status: string }
export interface JoinRoomResult {
  room_id: string
  participant_id: string
  slot_index: number
  role: string
  rejoined?: boolean
}
export interface LeaveRoomResult { ok: boolean; new_host_id: string | null }

// 장르(LOB-03)는 옵션 — 서버 화이트리스트(create-room GENRES)와 i18n lobby.genre.* 가 어휘 SSOT.
export const ROOM_GENRES = ['comedy', 'drama', 'romance', 'fantasy', 'horror', 'free'] as const

export const createRoom = (accessToken: string, title: string, genre?: string) =>
  callFn<CreateRoomResult>('create-room', accessToken, genre ? { title, genre } : { title })

// 쇼츠 제작소(로비 IA 재편): VGEN 이 room 에 강결합(room_id·호스트검증·R2 경로)이라, 유저당
// 숨겨진 1인 스튜디오 방을 get-or-create 로 재사용한다(vgen_jobs 히스토리 누적). 서버 멱등.
export const ensureStudioRoom = (accessToken: string) =>
  callFn<{ room_id: string }>('ensure-studio-room', accessToken, {})

// signal: 입장 취소 버튼(트랙 B) — 취소 시 AbortError 전파(edgeFn 계약: 호출부가 조용히 처리).
export const joinRoom = (accessToken: string, roomId: string, signal?: AbortSignal) =>
  callFn<JoinRoomResult>('join-public-room', accessToken, { room_id: roomId }, { signal })

// 관전 입장(LOB-07·ViewerGate) — 좌석·정원 비점유, 잠금방은 403(뷰어 초대로만).
export const joinRoomAsViewer = (accessToken: string, roomId: string, signal?: AbortSignal) =>
  callFn<JoinRoomResult>('join-as-viewer', accessToken, { room_id: roomId }, { signal })

export const leaveRoom = (accessToken: string, roomId: string) =>
  callFn<LeaveRoomResult>('leave-room', accessToken, { room_id: roomId })

export interface KickResult { ok: boolean; kicked_identity: string; display_name: string | null }

// 호스트 강퇴 (HOST-01). target = LiveKit identity(=auth uid). 서버가 rooms.host_id 로 권한 검증.
// reason(선택, ≤200자)은 서버가 절단 직전 대상에게 room-authority 로 통지.
export const kickParticipant = (accessToken: string, roomId: string, targetIdentity: string, reason?: string) =>
  callFn<KickResult>('kick-participant', accessToken, { room_id: roomId, target_identity: targetIdentity, ...(reason ? { reason } : {}) })

// 호스트 모드 전환 (G-261). 서버가 rooms.current_mode 반영 + room-authority 'mode_change' broadcast.
export const setRoomMode = (accessToken: string, roomId: string, mode: 'normal' | 'vgen' | 'dub') =>
  callFn<{ ok: boolean; mode: string }>('set-room-mode', accessToken, { room_id: roomId, mode })

// 리액션 서버 릴레이(ROOM-19). 서버가 멤버십 검증 후 방 전체 broadcast — 클라 직접 방송보다 유실0·스푸핑 불가.
export const sendReactionRelay = (accessToken: string, roomId: string, emoji: string, idempotencyKey: string) =>
  callFn<{ ok: boolean }>('send-reaction', accessToken, { room_id: roomId, emoji, idempotency_key: idempotencyKey })

// 채팅 서버 릴레이(ChatPanel.md). 서버가 sanitize·멤버십·rate-limit 검증 후 messages 영속 + 방 전체 broadcast.
// rid = 수신측 self-echo dedupe 키(리액션과 동형).
export const sendChatRelay = (accessToken: string, roomId: string, text: string, rid: string) =>
  callFn<{ ok: boolean; id: string }>('send-chat', accessToken, { room_id: roomId, text, rid })

// 채팅 히스토리(늦입장 백필) — RLS(멤버 + visible)로 보호되는 직접 SELECT. 최근 50건을 시간순으로.
export async function fetchRoomMessages(roomId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_name, sender_auth_id, text, created_at')
    .eq('room_id', roomId)
    .eq('message_type', 'chat')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []).reverse().map((m) => ({
    id: m.id as string,
    sender: (m.sender_name as string | null) ?? (m.sender_auth_id as string),
    senderAuthId: m.sender_auth_id as string,
    text: m.text as string,
    ts: new Date(m.created_at as string).getTime(),
    isLocal: false,
  }))
}

// 호스트 채팅 정책(HOST-09 슬로우모드·HOST-10 금칙어) — 강제는 send-chat 서버측, 이 호출은 rooms 정책 컬럼 갱신.
export const setChatPolicy = (
  accessToken: string,
  roomId: string,
  policy: { slow_mode_sec?: number; banned_words?: string[] },
) => callFn<{ ok: boolean; chat_slow_mode_sec: number; chat_banned_words: string[] }>('set-chat-policy', accessToken, { room_id: roomId, ...policy })

// 채팅 정책 초기값(HOST-09·10) — rooms RLS(멤버 SELECT) 직접 조회.
export async function fetchChatPolicy(roomId: string): Promise<{ slowSec: number; bannedWords: string[] }> {
  const { data, error } = await supabase
    .from('rooms')
    .select('chat_slow_mode_sec, chat_banned_words')
    .eq('id', roomId)
    .single()
  if (error) throw new Error(error.message)
  return {
    slowSec: (data?.chat_slow_mode_sec as number | null) ?? 0,
    bannedWords: (data?.chat_banned_words as string[] | null) ?? [],
  }
}

// 호스트 채팅 숨김/클리어(HOST-11) — soft delete(status='hidden') + audit_logs + 'chat-mod' broadcast.
export const moderateChat = (
  accessToken: string,
  roomId: string,
  action: { action: 'hide'; message_id: string } | { action: 'clear' },
) => callFn<{ ok: boolean; hidden: number }>('moderate-chat', accessToken, { room_id: roomId, ...action })

// V-2 신고(reporting-logging-feedback.md §16.1) — 운영 검토 큐. 메시지 신고는 발신자·본문을 서버가 확정.
export const createReport = (
  accessToken: string,
  payload: { room_id?: string; reported_user_id?: string; message_id?: string; reason: string; description?: string },
) => callFn<{ ok: boolean; id: string }>('create-report', accessToken, payload)

// V-2 차단(§16.2 — 개인 경험 필터, 입장 차단 아님). 대상은 users.id 또는 auth id(채팅 발신자 키).
export const createBlock = (accessToken: string, target: { blocked_user_id?: string; blocked_auth_id?: string }) =>
  callFn<{ ok: boolean; blocked_user_id: string; blocked_auth_id: string }>('create-block', accessToken, target)

export const deleteBlock = (accessToken: string, target: { blocked_user_id?: string; blocked_auth_id?: string }) =>
  callFn<{ ok: boolean }>('delete-block', accessToken, target)

// 내 차단 목록(RLS 본인 행만) — ChatPanel 접힘 필터 키(auth id).
export async function fetchMyBlockedAuthIds(): Promise<string[]> {
  const { data, error } = await supabase.from('user_blocks').select('blocked_auth_id')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.blocked_auth_id as string)
}

// 대본 큐 진행 서버 릴레이(SEC-5). 서버가 host 검증 후 방 전체 broadcast — 클라 직접 publish 의 진행권한 스푸핑·유실 제거.
export const advanceScriptCueRelay = (accessToken: string, roomId: string, sceneId: string, cueIndex: number) =>
  callFn<{ ok: boolean }>('advance-script-cue', accessToken, { room_id: roomId, scene_id: sceneId, cue_index: cueIndex })

// 대본 역할 클레임/해제/호스트배정 서버 릴레이(ROOM-14). 서버가 클레이머를 auth 로 확정 후 'script-role' broadcast.
export const scriptRoleAction = (
  accessToken: string,
  roomId: string,
  body: { action: 'claim' | 'release'; role: string } | { action: 'assign'; role: string; target_auth_id: string | null },
) => callFn<{ ok: boolean }>('sync-script-role', accessToken, { room_id: roomId, ...body })

// 호스트 대본 모드 전환(ROOM-14): rehearsal=전원 진행 / performance=호스트만. 서버가 host 검증 후 room-authority broadcast.
export const setScriptMode = (accessToken: string, roomId: string, mode: 'rehearsal' | 'performance') =>
  callFn<{ ok: boolean; script_mode: string }>('set-script-mode', accessToken, { room_id: roomId, mode })

export interface MuteResult { ok: boolean; muted: boolean; target_identity: string; display_name: string | null }

// 호스트 음소거/해제 (HOST-08). 서버가 canPublish 를 토글 + muted_by_host 를 DB 에 기록.
export const setParticipantMute = (accessToken: string, roomId: string, targetIdentity: string, muted: boolean) =>
  callFn<MuteResult>('set-participant-mute', accessToken, { room_id: roomId, target_identity: targetIdentity, muted })

export interface SetPasswordResult { ok: boolean; is_locked: boolean }

// 호스트 방 비밀번호 설정/해제 (HOST-06). password '' 이면 잠금 해제. 해시는 서버 room_secrets 에만.
export const setRoomPassword = (accessToken: string, roomId: string, password: string) =>
  callFn<SetPasswordResult>('set-room-password', accessToken, { room_id: roomId, password })

export interface SetBackgroundResult { ok: boolean; background_url: string | null }

// 호스트 무대 배경 교체/해제 (HOST-04·05). backgroundUrl '' 이면 해제. 서버가 '/scenes/' 에셋만 허용 + host 검증 후 방 전체 broadcast.
export const setRoomBackground = (accessToken: string, roomId: string, backgroundUrl: string) =>
  callFn<SetBackgroundResult>('set-room-background', accessToken, { room_id: roomId, background_url: backgroundUrl })

// 관객 손들기 토글(ROOM-20). raised=true 손들기·false 내리기. 서버가 raise_hand_at 세팅 + 호스트 큐 broadcast.
export const raiseHand = (accessToken: string, roomId: string, raised: boolean) =>
  callFn<{ ok: boolean; raised: boolean }>('raise-hand', accessToken, { room_id: roomId, raised })

// 호스트가 손든 관객을 무대로 초대(ROOM-21). 승격 아님 — 대상에게 수락 모달 broadcast. 대상 수락은 acceptStageInvite.
export const inviteToStage = (accessToken: string, roomId: string, targetUserId: string) =>
  callFn<{ ok: boolean }>('invite-to-stage', accessToken, { room_id: roomId, target_user_id: targetUserId })

// 초대받은 관객이 수락(ROOM-21) → viewer→actor 승격. 응답 후 클라가 토큰 재발급·재연결로 무대 등단.
export const acceptStageInvite = (accessToken: string, roomId: string) =>
  callFn<{ ok: boolean; slot_index: number | null; token_version: number | null }>('accept-stage-invite', accessToken, { room_id: roomId })

// 잠금방 비밀번호 입장. 서버가 PBKDF2 로 대조(상수시간). 결과는 join-public-room 과 동일 형태.
export const joinRoomWithPassword = (accessToken: string, roomId: string, password: string) =>
  callFn<JoinRoomResult>('join-room-with-password', accessToken, { room_id: roomId, password })

export interface CreateInviteResult { invite_code: string; room_id: string; max_uses: number; expires_at: string }
export interface VerifyInviteResult { room_id: string; title: string; host_display_name: string | null; role: string }

// 초대링크 (LOB-05). 원문 코드는 발급 응답에 1회만 — URL 조립(`/lobby?invite=<code>`)은 호출부.
// role='viewer' 는 관전 초대(Phase 4) — 잠금방도 이 문으로만 관전 가능.
// invitedUserId(LOB-08 지명 재초대): 그 사용자 전용 1회권 + 상대 인앱 알림(re_invite) 발송.
export const createRoomInvite = (
  accessToken: string,
  roomId: string,
  role: 'actor' | 'viewer' = 'actor',
  invitedUserId?: string,
) =>
  callFn<CreateInviteResult>('create-room-invite', accessToken, {
    room_id: roomId,
    role,
    ...(invitedUserId ? { invited_user_id: invitedUserId } : {}),
  })

export interface RecentRoom {
  room_id: string
  title: string
  status: string
  last_joined_at: string
  fellows: { user_id: string; display_name: string | null }[]
}
export interface RecentPerson { user_id: string; display_name: string | null }

// 최근 함께한 방/사람(LOB-08) — 타인 display_name 은 서버(service_role)만 읽는다.
export const listRecentRooms = (accessToken: string) =>
  callFn<{ rooms: RecentRoom[] }>('list-recent-rooms', accessToken, {})
export const listRecentPeople = (accessToken: string, excludeRoomId?: string) =>
  callFn<{ people: RecentPerson[] }>('list-recent-people', accessToken, excludeRoomId ? { exclude_room_id: excludeRoomId } : {})

export interface Reservation { id: string; title: string; scheduled_at: string }

// 예약 공연(LOB-06 MVP): 생성은 Edge(대상자 알림 발송 겸), 내 예약 조회는 RLS 직접 SELECT.
export const createReservation = (accessToken: string, title: string, scheduledAtIso: string, inviteeIds: string[]) =>
  callFn<{ reservation_id: string; scheduled_at: string; notified: number }>('create-reservation', accessToken, {
    title,
    scheduled_at: scheduledAtIso,
    invitee_ids: inviteeIds,
  })

export async function fetchMyReservations(): Promise<Reservation[]> {
  const { data, error } = await supabase
    .from('room_reservations')
    .select('id, title, scheduled_at')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10)
  if (error) throw new Error(error.message)
  return (data ?? []) as Reservation[]
}

// read-only 검증(사용횟수 무변화) — 수락 확인 UI 용.
export const verifyInviteCode = (accessToken: string, code: string) =>
  callFn<VerifyInviteResult>('verify-invite-code', accessToken, { invite_code: code })

// 수락 = 서버가 원자 소비 + 참가자 등록(멱등). 유효 초대는 잠금방도 비번 없이 입장(as-built 편차).
export const acceptInvite = (accessToken: string, code: string) =>
  callFn<JoinRoomResult>('accept-invite', accessToken, { invite_code: code })

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
  isDemo: boolean
  isPractice: boolean
}

export async function fetchPublicRooms(): Promise<LobbyRoom[]> {
  // LOB-01: 진행 중(live)인 방도 목록에 — 카드의 ●/○ 상태 점이 구분(ended 만 제외).
  const { data, error } = await supabase
    .from('public_rooms')
    .select('id, title, genre, status, current_participants, max_participants, host_display_name, is_locked, is_demo, is_practice, created_at')
    .in('status', ['waiting', 'live'])
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
    isDemo: (r.is_demo as boolean) ?? false,
    isPractice: (r.is_practice as boolean) ?? false,
  }))
}
