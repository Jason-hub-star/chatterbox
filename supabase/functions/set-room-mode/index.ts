// set-room-mode: 호스트가 무대 진행 모드를 전환한다 (G-261, contracts/RoomView.md).
// 입력: { room_id, mode: 'normal' | 'vgen' | 'dub' }
// 보안(성역): 호출자 == rooms.host_id 서버 검증. set-room-background 와 동형 패턴 —
//   DB(rooms.current_mode) 반영 후 room-authority 'mode_change' 서버 broadcast(수신측이 서버발만 신뢰).
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

const MODES = ["normal", "vgen", "dub"] as const;
type Mode = (typeof MODES)[number];

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
  if (typeof body.mode !== "string" || !MODES.includes(body.mode as Mode)) {
    return json({ error: "Invalid mode" }, 400);
  }
  const mode = body.mode as Mode;

  // 방 존재 + 호스트 검증(서버가 진짜 권한 확정 — 클라 게이트는 표시용)
  const { data: room } = await service
    .from("rooms").select("id, host_id, status").eq("id", roomId).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);
  if (room.host_id !== userId) return json({ error: "Not host" }, 403);

  // DB 반영(late joiner 복원용) 후 방 전체 broadcast(수신측 stageStore.announceMode → 배너+탭 자동전환).
  const { error: upErr } = await service
    .from("rooms").update({ current_mode: mode }).eq("id", roomId);
  if (upErr) return json({ error: "Set mode failed" }, 500);

  const payload = new TextEncoder().encode(JSON.stringify({
    type: "mode_change",
    new_mode: mode,
    changed_at_ms: Date.now(),
    changed_by_host_id: userId,
  }));
  try {
    await broadcastData(String(roomId), payload, "room-authority");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
    return json({ error: "Broadcast failed" }, 502);
  }
  return json({ ok: true, mode }, 200);
});
