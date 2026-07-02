// get-dub-source-url: 더빙 소스 영상 재생용 signed download URL(방 멤버 전용).
// SSOT: docs/contracts/DubRecorder.md §2 (원본 영상 음소거 재생)
// 입력: { dub_session_id }  출력: { url }
//
// dub-assets 는 비공개 버킷 → 클라가 직접 서명 불가. service_role 로 짧은 TTL signed URL 발급.

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
    .select("room_id, source_video_url")
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

  const { data: signed, error } = await service.storage
    .from("dub-assets")
    .createSignedUrl(sess.source_video_url, TTL_SEC);
  if (error || !signed) return json({ error: "URL 발급 실패", detail: error?.message }, 500);

  return json({ url: signed.signedUrl }, 200);
});
