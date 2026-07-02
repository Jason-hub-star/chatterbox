// get-dub-output-url: 합성 완성본 재생/다운로드용 signed URL(방 멤버 전용).
// SSOT: docs/contracts/DubCompositor.md §5 (다운로드), get-dub-source-url 패턴
// 입력: { dub_session_id }  출력: { url, file_size_bytes, duration_ms }

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

const TTL_SEC = 3600;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { dub_session_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.dub_session_id)) return json({ error: "Invalid dub_session_id" }, 400);

  const { data: sess } = await service
    .from("dub_sessions")
    .select("room_id")
    .eq("id", body.dub_session_id)
    .maybeSingle();
  if (!sess) return json({ error: "세션을 찾을 수 없어요." }, 404);

  // 방 멤버만
  const { data: me } = await service
    .from("room_participants")
    .select("id")
    .eq("room_id", sess.room_id)
    .eq("user_id", userId)
    .neq("state", "left")
    .maybeSingle();
  if (!me) return json({ error: "방 참가자만 볼 수 있어요." }, 403);

  // 최신 ready output
  const { data: output } = await service
    .from("dub_outputs")
    .select("output_object_key, file_size_bytes, duration_ms")
    .eq("dub_session_id", body.dub_session_id)
    .eq("status", "ready")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!output || !output.output_object_key) return json({ error: "완성본이 아직 없어요." }, 404);

  const { data: signed, error } = await service.storage
    .from("dub-assets")
    .createSignedUrl(output.output_object_key, TTL_SEC);
  if (error || !signed) return json({ error: "URL 발급 실패", detail: error?.message }, 500);

  return json(
    { url: signed.signedUrl, file_size_bytes: output.file_size_bytes, duration_ms: output.duration_ms },
    200,
  );
});
