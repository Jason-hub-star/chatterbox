// get-recording-url(G3·ROOM-13): 녹화 재생용 단기 presigned GET 발급 — visibility 게이트는
// RLS(§1.11)와 동일 규칙을 서버에서 미러(R2 presign 은 Edge 만 가능하므로 여기가 실질 게이트).
// 입력: { recording_id }  출력: { ok, url, duration_ms }

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { presignGet } from "../_shared/r2.ts";

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

  const { data: rec } = await service
    .from("recordings")
    .select("id, room_id, user_id, status, visibility, storage_object_key, duration_ms")
    .eq("id", body.recording_id)
    .maybeSingle();
  if (!rec || rec.status !== "ready" || !rec.storage_object_key) {
    return json({ error: "재생할 수 있는 녹화가 아니에요." }, 404);
  }

  // visibility 게이트(§1.11 RLS 미러): private_hold 는 어떤 일반 경로도 불가.
  if (rec.visibility === "private_hold") return json({ error: "접근할 수 없어요." }, 403);
  if (rec.visibility === "private" && rec.user_id !== userId) {
    return json({ error: "접근할 수 없어요." }, 403);
  }
  if (rec.visibility === "members_only") {
    const { data: me } = await service
      .from("room_participants")
      .select("id")
      .eq("room_id", rec.room_id)
      .eq("user_id", userId)
      .neq("state", "left")
      .maybeSingle();
    if (!me) return json({ error: "방 참가자만 볼 수 있어요." }, 403);
  }

  const url = await presignGet(rec.storage_object_key, 900);
  return json({ ok: true, url, duration_ms: rec.duration_ms }, 200);
});
