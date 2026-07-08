// join-as-viewer: 관전 입장(LOB-07·ViewerGate MVP). 좌석·정원 비점유, canPublish=false 는
// livekit-token 이 role 로 강제. 잠금방은 공개 관전 불가(사적 공간) — 뷰어 초대(accept-invite)로만.
// SSOT: docs/contracts/ViewerGate.md — as-built: 로그인 뷰어부터(익명은 대시보드 anonymous sign-in 후속).
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { joinAsViewer } from "../_shared/roomJoin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);

  const { data: room } = await service
    .from("rooms").select("id, status, is_locked").eq("id", body.room_id).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);
  if (room.is_locked) return json({ error: "Room is locked" }, 403);

  return await joinAsViewer(service, room.id, userId);
});
