// accept-stage-invite: 초대받은 관객이 무대 초대를 수락한다(ROOM-21). 대상 본인만 → promote_viewer_to_actor RPC.
// 승격 후 room-authority promoted broadcast: 본인=토큰 재발급·재연결(canPublish=true), 전원=무대 좌석 갱신.
// SSOT: contracts/HostConsole.md §G-154. 수락은 본인만(무동의 강제 승격 금지).
import { getAppUser, json, isUuid, cors } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);

  const { data: room } = await user.service
    .from("rooms").select("id, status").eq("id", room_id).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);

  // 대상 = 호출자 본인(수락은 본인만). 승격은 원자 RPC(FOR UPDATE 슬롯 배정 + token_version++).
  const { data: rows, error } = await user.service
    .rpc("promote_viewer_to_actor", { p_room_id: room_id, p_user_id: user.userId });
  if (error) return json({ error: "Promote failed", detail: error.message }, 500);
  const r = (Array.isArray(rows) ? rows[0] : rows) as
    { status: string; slot_index: number | null; token_version: number | null } | undefined;
  if (!r) return json({ error: "Promote failed" }, 500);
  if (r.status === "full") return json({ error: "Stage is full" }, 409);
  if (r.status === "not_participant") return json({ error: "Not a participant" }, 403);
  if (r.status === "not_found") return json({ error: "Room not found" }, 404);
  // 'promoted' 또는 'already_actor'(멱등) → 성공 처리

  // 방 전체 broadcast: 본인(auth_id) 재연결 + 전원 좌석 갱신.
  const payload = new TextEncoder().encode(
    JSON.stringify({ type: "promoted", auth_id: user.authId, slot_index: r.slot_index }),
  );
  try {
    await broadcastData(String(room_id), payload, "room-authority");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
    // 승격은 이미 커밋됨 — broadcast 실패해도 본인 재조회/재연결로 복구(치명적 아님).
  }
  return json({ ok: true, slot_index: r.slot_index, token_version: r.token_version }, 200);
});
