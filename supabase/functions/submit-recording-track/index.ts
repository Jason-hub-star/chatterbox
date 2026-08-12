// submit-recording-track(ROOM-28 P2a): 참가자가 자기 트랙 업로드를 마쳤다고 알린다.
// SSOT: contracts/VoiceRecording.md §P2 설계 / DATA-SCHEMA §1.11.2.
// 입력: { recording_id, duration_ms?, start_offset_ms?, file_size_bytes? }  출력: { ok, status, submitted_count }
//
// **storage key 를 받지 않는다.** 키는 create-recording-track-upload 가 만들어 DB 에 이미 박아뒀고,
// 대상 행은 (recording_id, 인증된 participant_id) 로만 찾는다 — 남의 트랙을 지목할 파라미터가 없다.
// (프리픽스 검증보다 강한 구조적 차단: 위조할 입력이 존재하지 않음.)

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

const posInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: {
    recording_id?: unknown;
    duration_ms?: unknown;
    start_offset_ms?: unknown;
    file_size_bytes?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.recording_id)) return json({ error: "Invalid recording_id" }, 400);
  const recordingId = body.recording_id;

  const { data: track } = await service
    .from("recording_tracks")
    .select("id, status")
    .eq("recording_id", recordingId)
    .eq("participant_id", userId) // 인증 주체로만 대상 지정 — 남의 행에 도달할 경로 없음
    .maybeSingle();
  if (!track) return json({ error: "내 트랙이 없어요. 먼저 업로드를 시작해 주세요." }, 404);

  const { error: uErr } = await service
    .from("recording_tracks")
    .update({
      status: "submitted",
      duration_ms: posInt(body.duration_ms),
      start_offset_ms: posInt(body.start_offset_ms) ?? 0,
      file_size_bytes: posInt(body.file_size_bytes),
      updated_at: new Date().toISOString(),
    })
    .eq("id", track.id);
  if (uErr) return json({ error: "트랙 제출 실패", detail: uErr.message }, 500);

  const { count } = await service
    .from("recording_tracks")
    .select("id", { count: "exact", head: true })
    .eq("recording_id", recordingId)
    .eq("status", "submitted");

  return json({ ok: true, status: "submitted", submitted_count: count ?? 0 }, 200);
});
