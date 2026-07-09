// invite-to-stage: 호스트가 손든 관객을 무대로 초대한다(ROOM-21, G-154). 아직 승격 아님 —
// 대상에게 수락 모달을 띄우는 room-authority stage_invite broadcast(대상 본인만 반응). 수락은 accept-stage-invite.
// SSOT: contracts/HostConsole.md §G-154. MUST NOT: 손들기(raise_hand_at) 없이 초대·대상 동의 없이 강제 승격.
import { getAppUser, json, isUuid, cors } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; target_user_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, target_user_id } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (!isUuid(target_user_id)) return json({ error: "Invalid target_user_id" }, 400);

  // 호스트 검증(서버 확정)
  const { data: room } = await user.service
    .from("rooms").select("id, host_id, status").eq("id", room_id).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);
  if (room.host_id !== user.userId) return json({ error: "Not host" }, 403);

  // 대상 = 손든 활성 viewer 여야 초대 가능(손들기 선행·viewer 만). users.auth_id 는 수신측 본인 판별용.
  const { data: target } = await user.service
    .from("room_participants")
    .select("id, role, raise_hand_at, users(auth_id)")
    .eq("room_id", room_id).eq("user_id", target_user_id).neq("state", "left")
    .maybeSingle();
  if (!target) return json({ error: "Target not a participant" }, 404);
  if (target.role !== "viewer") return json({ error: "Already an actor" }, 409);
  if (!target.raise_hand_at) return json({ error: "Target has not raised hand" }, 409);

  const targetAuthId = (target.users as unknown as { auth_id: string }).auth_id;

  // 방 전체 broadcast — 대상(auth_id 일치) 본인만 수락 모달 표시(다른 참가자는 무시).
  const payload = new TextEncoder().encode(JSON.stringify({ type: "stage_invite", target_auth_id: targetAuthId }));
  try {
    await broadcastData(String(room_id), payload, "room-authority");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
    return json({ error: "Broadcast failed" }, 502);
  }
  return json({ ok: true }, 200);
});
