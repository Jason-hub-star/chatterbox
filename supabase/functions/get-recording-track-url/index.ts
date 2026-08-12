// get-recording-track-url(ROOM-28 P2a): 참가자별 트랙의 단기 presign GET(재생·다운로드 공용).
// SSOT: contracts/VoiceRecording.md §P2 설계 / DATA-SCHEMA §1.11.2.
// 입력: { track_id }  출력: { ok, url, duration_ms, file_size_bytes }
//
// 기존 get-recording-url 을 확장하지 않고 신규로 낸 이유: 그 함수는 이 골의 무변경 대상이다
// (P1 회귀 위험 0 유지). 가시성 규칙은 같은 것을 미러한다 — 그 트랙이 속한 방의 참가자만.

import { cors, json, getAppUser, isUuid, requireActiveParticipant } from "../_shared/supa.ts";
import { presignGet } from "../_shared/r2.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { track_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.track_id)) return json({ error: "Invalid track_id" }, 400);

  const { data: track } = await service
    .from("recording_tracks")
    .select("id, storage_object_key, duration_ms, file_size_bytes, status, recordings!inner(room_id)")
    .eq("id", body.track_id)
    .maybeSingle();
  if (!track || !track.storage_object_key) return json({ error: "트랙을 찾을 수 없어요." }, 404);
  if (track.status !== "submitted") return json({ error: "아직 올라오지 않은 트랙이에요." }, 409);

  const roomId = (track.recordings as unknown as { room_id: string }).room_id;
  const gate = await requireActiveParticipant(service, roomId, userId);
  if (!gate.ok) return gate.res;

  const url = await presignGet(track.storage_object_key, 900); // 15분 — 기존 재생 URL 과 같은 수명
  return json({
    ok: true,
    url,
    duration_ms: track.duration_ms,
    file_size_bytes: track.file_size_bytes,
  }, 200);
});
