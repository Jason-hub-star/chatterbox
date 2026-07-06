// advance-script-cue: 대본 큐 진행 서버 릴레이 — 호스트만 진행, 서버가 host 를 auth 로 확정 후 방 전체 broadcast.
// 왜 서버 경유(SEC-5, dogfood-audit): 클라 직접 'script-cue' publishData 는 (1) 아무 참가자나 위조 가능(진행권한
//   스푸핑 → 전원 텔레프롬프터 desync), (2) datachannel 개설지연으로 첫 방송 유실. 서버는 host 를 확정 +
//   안정연결(유실0). 수신측은 participant=undefined(서버발)만 수락 → 클라 직접 publish 는 드롭. send-reaction 과 동형.
// SSOT: contracts/ScriptPanel.md · state-machines/Script.md · docs/DOGFOOD-AUDIT-2026-07.md §SEC-5
import { getAppUser, json, isUuid, cors } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; scene_id?: unknown; cue_index?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, scene_id, cue_index } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (typeof scene_id !== "string" || scene_id.length < 1 || scene_id.length > 100) {
    return json({ error: "Invalid scene_id" }, 400);
  }
  if (!Number.isInteger(cue_index) || (cue_index as number) < 0 || (cue_index as number) > 9999) {
    return json({ error: "Invalid cue_index" }, 400);
  }

  // 방 존재 + 종료 아님 + 호스트 전용(진행 권한을 서버가 확정)
  const { data: room } = await user.service
    .from("rooms").select("id, status, host_id").eq("id", room_id).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);
  if (room.host_id !== user.userId) return json({ error: "호스트만 대본을 진행할 수 있어요." }, 403);

  // 방 전체 broadcast(reliable). 수신측은 participant=undefined 로 받아 신뢰(클라 직접발은 드롭).
  const payload = new TextEncoder().encode(JSON.stringify({ sceneId: scene_id, cueIndex: cue_index }));
  try {
    await broadcastData(String(room_id), payload, "script-cue");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
    return json({ error: "Broadcast failed" }, 502);
  }
  return json({ ok: true }, 200);
});
