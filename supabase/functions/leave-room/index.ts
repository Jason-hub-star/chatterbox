// leave-room: 참가자 퇴장(soft) + 필요 시 호스트 승계 + 빈 방 종료.
// SSOT: docs/API-SURFACE.md, docs/state-machines/Room.md (Host Leaves / LIVE→ENDED)
// 입력: { room_id }  출력: { ok, new_host_id? }
//
// R5: soft-leave·승계·종료 로직은 _shared/roomLeave.ts 로 추출(무수정) — livekit-webhook 과 공유.
// ponytail: 30초 grace 후 ended(emptied_at)·room-authority 브로드캐스트는 후속 슬라이스.

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { softLeaveRoom } from "../_shared/roomLeave.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // LOB-07: 익명 게스트 뷰어의 정상 퇴장 허용(뷰어 퇴장은 좌석·승계 무영향).
  const auth = await getAppUser(req, { allowAnonymous: true });
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);

  const result = await softLeaveRoom(service, body.room_id, userId);
  if (result.kind === "room_not_found") return json({ error: "Room not found" }, 404);
  if (result.kind === "already_left") return json({ ok: true, already_left: true }, 200);
  return json({ ok: true, new_host_id: result.newHostId }, 200);
});
