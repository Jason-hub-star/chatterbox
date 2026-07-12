// create-room-recording-upload(G3·ROOM-13): all_consented 게이트 통과 시 녹화 상태 전이 + R2 업로드 presign.
// SSOT: consent-credits-quota §11.1.1(게이트)·DATA-SCHEMA §1.11. 키는 서버가 생성(위조 여지 0).
// 입력: { recording_id }  출력: { ok, upload_url, storage_key }
// ponytail: 시작 후 새로 입장한 참가자의 동의는 시작 게이트 범위 밖(계약 §11.1.1 은 "시작 전" 게이트)
// — 입장자는 REC 배지로 고지, 사후확인(§11.1.2)은 defer.

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { presignPut } from "../_shared/r2.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { recording_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.recording_id)) return json({ error: "Invalid recording_id" }, 400);
  const recordingId = body.recording_id;

  const { data: rec } = await service
    .from("recordings")
    .select("id, room_id, user_id, status, consent_json, storage_object_key, rooms!inner(host_id)")
    .eq("id", recordingId)
    .maybeSingle();
  if (!rec) return json({ error: "녹화를 찾을 수 없어요." }, 404);
  const hostId = (rec.rooms as unknown as { host_id: string }).host_id;
  if (hostId !== userId) return json({ error: "호스트만 녹화를 실행할 수 있어요." }, 403);
  if (rec.status !== "consent_pending" && rec.status !== "recording") {
    return json({ error: "시작할 수 있는 상태가 아니에요." }, 409);
  }
  // §11.1.1 시작 게이트: 전원 사전 동의 없이는 recording 전이 금지
  if ((rec.consent_json as { all_consented?: boolean } | null)?.all_consented !== true) {
    return json({ error: "모든 참가자의 동의가 필요해요.", code: "consent_required" }, 412);
  }

  const key = rec.storage_object_key ?? `recordings/${rec.room_id}/${recordingId}.webm`;
  const { error: uErr } = await service
    .from("recordings")
    .update({
      status: "recording",
      storage_object_key: key,
      started_at: new Date().toISOString(),
    })
    .eq("id", recordingId)
    .eq("status", rec.status); // 낙관적 — 동시 호출은 재시도로 수렴(같은 키·멱등)
  if (uErr) return json({ error: "상태 전이 실패", detail: uErr.message }, 500);

  try {
    await broadcastData(
      rec.room_id,
      new TextEncoder().encode(JSON.stringify({ type: "recording_started", recording_id: recordingId, rid: crypto.randomUUID() })),
      "room-authority",
    );
  } catch { /* 비치명 */ }

  const uploadUrl = await presignPut(key, 3600); // 긴 공연 대비 1시간(업로드는 정지 직후 1회)
  return json({ ok: true, upload_url: uploadUrl, storage_key: key }, 200);
});
