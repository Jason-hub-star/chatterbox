import { supabase } from '@/lib/supabase'
import { callFn } from '@/lib/edgeFn'

// 더빙(DUB) Edge Function 경계 래퍼. rooms.ts 와 동일 패턴(callFn + 타입드 래퍼).
// 와이어는 snake_case(DB/API), React 안은 camelCase.
// SSOT: docs/API-SURFACE.md, docs/state-machines/DubSession.md

// presigned PUT(R2)로 blob 직접 업로드. Supabase Storage uploadToSignedUrl 대체(R2 egress $0).
async function putToR2(uploadUrl: string, body: Blob, contentType: string): Promise<void> {
  const res = await fetch(uploadUrl, { method: 'PUT', body, headers: { 'Content-Type': contentType } })
  if (!res.ok) throw new Error(`업로드 실패 (${res.status})`)
}

// ── 타입 ────────────────────────────────────────────────────────────
export type DubStatus =
  | 'uploaded' | 'transcribing' | 'ready' | 'recording' | 'compositing' | 'completed' | 'failed'

export interface DubSegment { id: number; start_ms: number; end_ms: number; text: string; translated_text?: string }
export interface DubTrack {
  id: string
  participantId: string
  speakerName: string
  startTimeMs: number
  endTimeMs: number
  transcriptText: string
  translatedText: string | null
  status: 'assigned' | 'recording' | 'submitted' | 'synced'
}
export interface RoomMember { userId: string; authId: string; displayName: string | null; avatarUrl: string | null; slotIndex: number; role: string; mutedByHost: boolean; mutedUntil: string | null; raiseHandAt: string | null }
export interface RoleAssignment { segment_id: number; participant_id: string }

// ── 업로드(create-dub-upload → storage signed upload) ────────────────
export async function uploadDubSource(accessToken: string, roomId: string, file: File): Promise<string> {
  const { path, uploadUrl } = await callFn<{ path: string; uploadUrl: string }>(
    'create-dub-upload', accessToken,
    { room_id: roomId, file_name: file.name, size_bytes: file.size, mime_type: file.type },
  )
  await putToR2(uploadUrl, file, file.type)
  return path
}

// ── Edge Function 래퍼 ──────────────────────────────────────────────
export const createDubSession = (accessToken: string, roomId: string, sourcePath: string) =>
  callFn<{ dub_session_id: string; status: DubStatus }>(
    'create-dub-session', accessToken, { room_id: roomId, source_path: sourcePath },
  )

export const startTranscription = (accessToken: string, dubSessionId: string) =>
  callFn<{ dub_session_id: string; status: DubStatus; segment_count: number }>(
    'start-dub-transcription', accessToken, { dub_session_id: dubSessionId },
  )

// DUB-06: STT 대본 세그먼트를 JP/EN→KR 자동 번역(원문 ko 면 skipped=true·무과금).
export const translateDubScript = (accessToken: string, dubSessionId: string) =>
  callFn<{ dub_session_id: string; translated_count: number; skipped_count: number; skipped?: boolean }>(
    'translate-dub-script', accessToken, { dub_session_id: dubSessionId },
  )

// V-10 자막편집: READY 상태에서 세그먼트 대사(원문/번역) 수정 — 프롬프터·합성 자막에 반영.
export const updateDubSegmentText = (
  accessToken: string, dubSessionId: string, segmentId: number,
  patch: { text?: string; translated_text?: string },
) =>
  callFn<{ dub_session_id: string; segment_id: number }>(
    'update-dub-segment-text', accessToken, { dub_session_id: dubSessionId, segment_id: segmentId, ...patch },
  )

export const assignRoles = (accessToken: string, dubSessionId: string, assignments: RoleAssignment[]) =>
  callFn<{ dub_session_id: string; track_count: number }>(
    'assign-dub-roles', accessToken, { dub_session_id: dubSessionId, assignments },
  )

export const recordConsent = (accessToken: string, dubSessionId: string, consented: boolean) =>
  callFn<{ ok: boolean; all_consented: boolean }>(
    'record-consent', accessToken, { dub_session_id: dubSessionId, consented },
  )

export const startRecording = (accessToken: string, dubSessionId: string) =>
  callFn<{ dub_session_id: string; status: DubStatus; role_version: number }>(
    'start-dub-recording', accessToken, { dub_session_id: dubSessionId },
  )

// ── 녹음(DUB-04) ────────────────────────────────────────────────────
// 소스 재생용 signed URL (원본 음소거 재생).
export const getDubSourceUrl = (accessToken: string, dubSessionId: string) =>
  callFn<{ url: string }>('get-dub-source-url', accessToken, { dub_session_id: dubSessionId })
    .then((r) => r.url)

// 녹음 blob 업로드 → path 반환 (create-dub-recording-upload → presigned PUT).
export async function uploadDubRecording(accessToken: string, dubTrackId: string, blob: Blob): Promise<string> {
  const { path, uploadUrl } = await callFn<{ path: string; uploadUrl: string }>(
    'create-dub-recording-upload', accessToken, { dub_track_id: dubTrackId },
  )
  await putToR2(uploadUrl, blob, 'audio/webm')
  return path
}

export const submitDubTrack = (accessToken: string, dubTrackId: string, recordingPath: string, durationMs: number) =>
  callFn<{ track_id: string; status: string }>(
    'submit-dub-track', accessToken,
    { dub_track_id: dubTrackId, recording_path: recordingPath, duration_ms: durationMs },
  )

export const confirmDubTrack = (accessToken: string, dubTrackId: string) =>
  callFn<{ track_id: string; status: string; all_synced: boolean }>(
    'confirm-dub-track', accessToken, { dub_track_id: dubTrackId },
  )

// ── 합성(DUB-05, 원본 재더빙) ───────────────────────────────────────
export interface DubRecordingUrl { trackId: string; startTimeMs: number; url: string }
export interface DubOutput { url: string; fileSizeBytes: number | null; durationMs: number | null }

// 음원분리(G-280): 원어 대사(vocals) 제거 → 비보컬 배경 스템 URL. 합성 중간에 호스트가 호출.
export const separateDubAudio = (accessToken: string, dubSessionId: string) =>
  callFn<{ dub_session_id: string; background_urls: string[]; stem_count: number }>(
    'separate-dub-audio', accessToken, { dub_session_id: dubSessionId },
  )

// 합성 시작: dub_outputs(compositing) 생성 + 산출물 업로드 URL. 세션 compositing 전이.
export const startDubCompositing = (accessToken: string, dubSessionId: string) =>
  callFn<{ output_id: string; path: string; uploadUrl: string }>(
    'create-dub-output-upload', accessToken, { dub_session_id: dubSessionId },
  )

// 합성 결과 blob 업로드(presigned PUT). path 는 startDubCompositing 이 이미 반환하므로 void.
export async function uploadDubOutput(uploadUrl: string, blob: Blob): Promise<void> {
  await putToR2(uploadUrl, blob, 'video/mp4')
}

// 확정: 성공(outputPath 등) → ready+completed / 실패(errorMessage) → failed+recording 복귀.
export const finalizeDubOutput = (
  accessToken: string,
  args: { outputId: string; outputPath?: string; fileSizeBytes?: number; durationMs?: number; errorMessage?: string },
) =>
  callFn<{ output_id: string; status: string }>('submit-dub-output', accessToken, {
    output_id: args.outputId,
    output_path: args.outputPath,
    file_size_bytes: args.fileSizeBytes,
    duration_ms: args.durationMs,
    error_message: args.errorMessage,
  })

export const getDubOutputUrl = (accessToken: string, dubSessionId: string) =>
  callFn<{ url: string; file_size_bytes: number | null; duration_ms: number | null }>(
    'get-dub-output-url', accessToken, { dub_session_id: dubSessionId },
  ).then((r) => ({ url: r.url, fileSizeBytes: r.file_size_bytes, durationMs: r.duration_ms } as DubOutput))

export async function fetchDubRecordings(accessToken: string, dubSessionId: string): Promise<DubRecordingUrl[]> {
  const { recordings } = await callFn<{
    recordings: Array<{ track_id: string; start_time_ms: number; url: string }>
  }>('get-dub-recordings', accessToken, { dub_session_id: dubSessionId })
  return recordings.map((r) => ({ trackId: r.track_id, startTimeMs: r.start_time_ms, url: r.url }))
}

// 완료 세션 재로드 시 완성본 존재 확인(RLS: member SELECT).
export async function fetchDubOutput(dubSessionId: string): Promise<boolean> {
  const { data } = await supabase
    .from('dub_outputs')
    .select('id')
    .eq('dub_session_id', dubSessionId)
    .eq('status', 'ready')
    .limit(1)
    .maybeSingle()
  return !!data
}

export async function fetchRoomMembers(accessToken: string, roomId: string): Promise<RoomMember[]> {
  const { members } = await callFn<{
    members: Array<{
      user_id: string; auth_id: string; display_name: string | null
      avatar_url: string | null; slot_index: number; role: string; muted_by_host?: boolean; muted_until?: string | null; raise_hand_at?: string | null
    }>
  }>('list-room-members', accessToken, { room_id: roomId })
  return members.map((m) => ({
    userId: m.user_id, authId: m.auth_id, displayName: m.display_name,
    avatarUrl: m.avatar_url, slotIndex: m.slot_index, role: m.role,
    mutedByHost: m.muted_by_host ?? false, // 배포 지연 대비 옵셔널(구 배포본은 미반환)
    mutedUntil: m.muted_until ?? null, // R4 시간제 음소거 만료 시각(무기한·구 배포본 → null)
    raiseHandAt: m.raise_hand_at ?? null, // ROOM-20 손들기 큐(구 배포본 미반환 → null)
  }))
}

// ── 조회(RLS: 같은 방 참가자만) ─────────────────────────────────────
export async function fetchDubSession(dubSessionId: string) {
  const { data, error } = await supabase
    .from('dub_sessions')
    .select('id, status, diarization_result_json, consent_json, role_version')
    .eq('id', dubSessionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// 내 users.id (auth_id → 프로필). users RLS 는 본인 행 조회 허용.
export async function fetchMyUserId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data } = await supabase.from('users').select('id').eq('auth_id', auth.user.id).maybeSingle()
  return data?.id ?? null
}

// 방 호스트(users.id). rooms RLS 는 멤버 SELECT 허용.
export async function fetchRoomHostId(roomId: string): Promise<string | null> {
  const { data } = await supabase.from('rooms').select('host_id').eq('id', roomId).maybeSingle()
  return data?.host_id ?? null
}

// 방의 최신 더빙 세션. 완료(completed)본도 다운로드 표시를 위해 포함(최신 1건).
// ponytail: 완료 후 새 더빙(closeSession/reset)은 후속 — 현재는 방당 최신 세션만 노출.
export async function fetchActiveDubSession(roomId: string) {
  const { data } = await supabase
    .from('dub_sessions')
    .select('id, status, created_by, diarization_result_json, consent_json, role_version')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

export async function fetchDubTracks(dubSessionId: string): Promise<DubTrack[]> {
  const { data, error } = await supabase
    .from('dub_tracks')
    .select('id, participant_id, speaker_name, start_time_ms, end_time_ms, transcript_text, translated_text, status')
    .eq('dub_session_id', dubSessionId)
    .order('start_time_ms', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((t) => ({
    id: t.id,
    participantId: t.participant_id,
    speakerName: t.speaker_name,
    startTimeMs: t.start_time_ms,
    endTimeMs: t.end_time_ms,
    transcriptText: t.transcript_text,
    translatedText: t.translated_text ?? null,
    status: t.status,
  }))
}
