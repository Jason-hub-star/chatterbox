// assign-dub-roles: 세그먼트→참가자 배정으로 dub_tracks 생성(호스트 전용).
// SSOT: docs/contracts/DubRoleAssigner.md (DUB-03), docs/state-machines/DubSession.md (READY 단계)
// 입력: { dub_session_id, assignments: [{ segment_id, participant_id }] }
// 출력: { dub_session_id, track_count }
//
// 설계: MVP 는 세그먼트 1개 = 트랙 1개(speaker_name='Segment N'). 실화자 그룹핑은 후속(ponytail).
// 재실행 가능(멱등): 잠금 전이면 기존 트랙 전량 교체.

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

interface Segment { id: number; start_ms: number; end_ms: number; text: string }
interface Assignment { segment_id: number; participant_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { dub_session_id?: unknown; assignments?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.dub_session_id)) return json({ error: "Invalid dub_session_id" }, 400);
  const sessionId = body.dub_session_id;
  if (!Array.isArray(body.assignments) || body.assignments.length === 0) {
    return json({ error: "assignments 가 필요해요." }, 400);
  }
  const assignments = body.assignments as Assignment[];

  const { data: sess } = await service
    .from("dub_sessions")
    .select("id, room_id, status, roles_locked_at, diarization_result_json, rooms(host_id)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess) return json({ error: "세션을 찾을 수 없어요." }, 404);
  const room = sess.rooms as unknown as { host_id: string };
  if (room.host_id !== userId) return json({ error: "호스트만 역할을 배정할 수 있어요." }, 403);
  if (sess.status !== "ready") return json({ error: `현재 상태(${sess.status})에선 배정 불가` }, 409);
  if (sess.roles_locked_at) return json({ error: "녹음 중 역할 변경 불가(H12)" }, 409);

  const segments: Segment[] = (sess.diarization_result_json?.segments ?? []);
  const segById = new Map(segments.map((s) => [s.id, s]));

  // 활성 참가자(users.id) 집합
  const { data: parts } = await service
    .from("room_participants")
    .select("user_id")
    .eq("room_id", sess.room_id)
    .neq("state", "left");
  const memberIds = new Set((parts ?? []).map((p) => p.user_id));

  // 검증 + 트랙 행 구성
  const rows = [];
  for (const a of assignments) {
    const seg = segById.get(a.segment_id);
    if (!seg) return json({ error: `없는 segment_id: ${a.segment_id}` }, 400);
    if (!isUuid(a.participant_id) || !memberIds.has(a.participant_id)) {
      return json({ error: `참가자가 방에 없어요: ${a.participant_id}` }, 400);
    }
    rows.push({
      dub_session_id: sessionId,
      participant_id: a.participant_id,
      speaker_name: `Segment ${a.segment_id + 1}`,
      start_time_ms: seg.start_ms,
      end_time_ms: seg.end_ms,
      transcript_text: seg.text,
      status: "assigned",
    });
  }

  // 멱등: 잠금 전이므로 기존 트랙 교체
  await service.from("dub_tracks").delete().eq("dub_session_id", sessionId);
  const { error: iErr } = await service.from("dub_tracks").insert(rows);
  if (iErr) return json({ error: "역할 배정 실패", detail: iErr.message }, 500);

  return json({ dub_session_id: sessionId, track_count: rows.length }, 200);
});
