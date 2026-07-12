// complete-room-recording(G3·ROOM-13): 업로드 완료 확정(ready + 보존기간 + 작품 등록) 또는 취소.
// SSOT: DATA-SCHEMA §1.11(retention=ended+90일·cancelled 의미론)·§1.22 room_artifacts.
// 입력: { recording_id, cancel?, duration_ms?, file_size_bytes? }
// 출력: { ok, status } (+ artifact_id)

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { recording_id?: unknown; cancel?: unknown; duration_ms?: unknown; file_size_bytes?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.recording_id)) return json({ error: "Invalid recording_id" }, 400);
  const recordingId = body.recording_id;

  const { data: rec } = await service
    .from("recordings")
    .select("id, room_id, user_id, status, storage_object_key, rooms!inner(host_id, title)")
    .eq("id", recordingId)
    .maybeSingle();
  if (!rec) return json({ error: "녹화를 찾을 수 없어요." }, 404);
  const room = rec.rooms as unknown as { host_id: string; title: string | null };
  if (room.host_id !== userId) return json({ error: "호스트만 마감할 수 있어요." }, 403);

  if (body.cancel === true) {
    if (rec.status === "ready") return json({ error: "완료된 녹화는 취소할 수 없어요." }, 409);
    const { error } = await service.from("recordings")
      .update({ status: "cancelled", ended_at: new Date().toISOString() })
      .eq("id", recordingId);
    if (error) return json({ error: "취소 실패", detail: error.message }, 500);
    return json({ ok: true, status: "cancelled" }, 200);
  }

  if (rec.status !== "recording") return json({ error: "완료할 수 있는 상태가 아니에요." }, 409);
  if (!rec.storage_object_key) return json({ error: "업로드 키가 없어요." }, 409);

  const duration = typeof body.duration_ms === "number" && body.duration_ms > 0 ? Math.floor(body.duration_ms) : null;
  const size = typeof body.file_size_bytes === "number" && body.file_size_bytes > 0 ? Math.floor(body.file_size_bytes) : null;
  const ended = new Date();
  const retention = new Date(ended.getTime() + 90 * 24 * 3600 * 1000); // §11.4 기본 90일

  const { error: uErr } = await service
    .from("recordings")
    .update({
      status: "ready",
      duration_ms: duration,
      file_size_bytes: size,
      ended_at: ended.toISOString(),
      retention_expires_at: retention.toISOString(),
    })
    .eq("id", recordingId)
    .eq("status", "recording");
  if (uErr) return json({ error: "완료 처리 실패", detail: uErr.message }, 500);

  const { data: artifact, error: aErr } = await service
    .from("room_artifacts")
    .insert({
      room_id: rec.room_id,
      user_id: rec.user_id,
      source_type: "recording",
      source_id: recordingId,
      title: room.title ? `${room.title} 녹화` : "무대 녹화",
      media_object_key: rec.storage_object_key,
      visibility: "room",
    })
    .select("id")
    .single();
  if (aErr) return json({ error: "작품 등록 실패", detail: aErr.message }, 500);

  try {
    await broadcastData(
      rec.room_id,
      new TextEncoder().encode(JSON.stringify({ type: "recording_done", recording_id: recordingId, rid: crypto.randomUUID() })),
      "room-authority",
    );
  } catch { /* 비치명 */ }

  return json({ ok: true, status: "ready", artifact_id: artifact.id }, 200);
});
