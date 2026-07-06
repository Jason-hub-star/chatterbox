// create-dub-session: 업로드된 소스로 dub_sessions 행 생성(호스트 전용).
// SSOT: docs/state-machines/DubSession.md (UPLOADING→UPLOADED), DATA-SCHEMA §1.12
// 입력: { room_id, source_path, source_type? }  출력: { dub_session_id, status }
//
// ponytail: 소스 검열(프레임 샘플링 + STT 텍스트)은 후속 슬라이스 → MVP 는 uploaded 로 바로 진입.

import { cors, json, getAppUser, isUuid, isSafeObjectKey } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown; source_path?: unknown; source_type?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const roomId = body.room_id;
  const sourcePath = typeof body.source_path === "string" ? body.source_path : "";
  // 경로 조작 방지(SEC-2): 업로드 소스(sources/) 또는 vgen 결과(vgen/)만, ../ 차단
  if (!isSafeObjectKey(sourcePath, roomId, ["sources", "vgen"])) {
    return json({ error: "Invalid source_path" }, 400);
  }
  // MVP: mp4 만. vgen/youtube 는 후속.
  const sourceType = body.source_type === "vgen" ? "vgen" : "mp4";

  // 호스트 전용
  const { data: room } = await service
    .from("rooms")
    .select("id")
    .eq("id", roomId)
    .eq("host_id", userId)
    .maybeSingle();
  if (!room) return json({ error: "호스트만 더빙 세션을 만들 수 있어요." }, 403);

  const { data: sess, error: iErr } = await service
    .from("dub_sessions")
    .insert({
      room_id: roomId,
      created_by: userId,
      source_video_url: sourcePath,
      source_type: sourceType,
      status: "uploaded",
    })
    .select("id, status")
    .single();
  if (iErr || !sess) return json({ error: "세션 생성 실패", detail: iErr?.message }, 500);

  return json({ dub_session_id: sess.id, status: sess.status }, 201);
});
