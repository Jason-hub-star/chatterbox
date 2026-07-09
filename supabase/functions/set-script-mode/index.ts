// set-script-mode: 호스트가 대본 진행 모드를 전환한다 (ROOM-14 리허설/본공연).
//   rehearsal   = 활성 참가자 전원 cue 진행 허용 (advance-script-cue 가 판정에 참조)
//   performance = 호스트만 진행 (기본)
// set-room-background 와 동형: 호스트 서버 검증 → rooms.script_mode UPDATE → room-authority broadcast.
// SSOT: docs/DATA-SCHEMA.md §1.2 · contracts/ScriptPanel.md
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const roomId = body.room_id;
  if (body.mode !== "rehearsal" && body.mode !== "performance") {
    return json({ error: "Invalid mode" }, 400);
  }

  // 방 존재 + 호스트 검증(서버가 진짜 권한 확정 — 클라 게이트는 표시용)
  const { data: room } = await service
    .from("rooms").select("id, host_id, status").eq("id", roomId).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);
  if (room.host_id !== userId) return json({ error: "Not host" }, 403);

  const { error: upErr } = await service
    .from("rooms").update({ script_mode: body.mode }).eq("id", roomId);
  if (upErr) return json({ error: "Set mode failed" }, 500);

  const payload = new TextEncoder().encode(JSON.stringify({ type: "script_mode", mode: body.mode }));
  try {
    await broadcastData(String(roomId), payload, "room-authority");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
    return json({ error: "Broadcast failed" }, 502);
  }
  return json({ ok: true, script_mode: body.mode }, 200);
});
