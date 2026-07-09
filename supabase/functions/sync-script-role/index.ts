// sync-script-role: 대본 역할 클레임 서버 릴레이 (ROOM-14, 주인님 확정: 클레임+호스트 조정).
//   claim   — 본인(활성 배우)이 역할을 맡는다. 서버가 auth 로 클레이머를 확정(스푸핑 차단, SEC-5 동형).
//   release — 본인 클레임 해제.
//   assign  — 호스트가 역할을 대상 참가자에게 배정(target_auth_id) 또는 해제(null).
// 선착순 충돌은 클라 가드 + LWW(서버 무상태 릴레이) — ponytail: 실사용 충돌 잦으면 DB 클레임 테이블로 승급.
// broadcast 'script-role' (reliable): {kind:'set', role, authId, name} | {kind:'clear', role}.
// 수신측은 participant=undefined(서버발)만 수락. SSOT: docs/DATA-SCHEMA.md §2 · contracts/ScriptPanel.md
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

const MAX_ROLE_LEN = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { room_id?: unknown; action?: unknown; role?: unknown; target_auth_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { room_id, action, role } = body;
  if (!isUuid(room_id)) return json({ error: "Invalid room_id" }, 400);
  if (action !== "claim" && action !== "release" && action !== "assign") {
    return json({ error: "Invalid action" }, 400);
  }
  if (typeof role !== "string" || role.length < 1 || role.length > MAX_ROLE_LEN) {
    return json({ error: "Invalid role" }, 400);
  }

  const { data: room } = await user.service
    .from("rooms").select("id, status, host_id").eq("id", room_id).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);

  // 호출자 = 활성 참가자(공통 게이트).
  const { data: me } = await user.service
    .from("room_participants").select("id, role")
    .eq("room_id", room_id).eq("user_id", user.userId).neq("state", "left")
    .limit(1).maybeSingle();
  if (!me) return json({ error: "Not a participant" }, 403);

  let msg: { kind: "set"; role: string; authId: string; name: string | null } | { kind: "clear"; role: string };

  if (action === "claim" || action === "release") {
    // 역할은 배우의 것 — 관전자는 클레임 불가.
    if (me.role === "viewer") return json({ error: "Viewers cannot claim roles" }, 403);
    if (action === "claim") {
      const { data: profile } = await user.service
        .from("users").select("display_name").eq("id", user.userId).single();
      msg = { kind: "set", role, authId: user.authId, name: (profile?.display_name as string | null) ?? null };
    } else {
      msg = { kind: "clear", role };
    }
  } else {
    // assign: 호스트만. target_auth_id=null 이면 해제.
    if (room.host_id !== user.userId) return json({ error: "Not host" }, 403);
    const target = body.target_auth_id;
    if (target === null || target === undefined) {
      msg = { kind: "clear", role };
    } else {
      if (!isUuid(target)) return json({ error: "Invalid target_auth_id" }, 400);
      // 대상 = 이 방의 활성 배우(auth_id → users.id → room_participants).
      const { data: targetUser } = await user.service
        .from("users").select("id, display_name").eq("auth_id", target).is("deleted_at", null).single();
      if (!targetUser) return json({ error: "Target not found" }, 404);
      const { data: targetMember } = await user.service
        .from("room_participants").select("id, role")
        .eq("room_id", room_id).eq("user_id", targetUser.id).neq("state", "left")
        .limit(1).maybeSingle();
      if (!targetMember || targetMember.role === "viewer") {
        return json({ error: "Target is not an active actor" }, 403);
      }
      msg = { kind: "set", role, authId: target, name: (targetUser.display_name as string | null) ?? null };
    }
  }

  const payload = new TextEncoder().encode(JSON.stringify(msg));
  try {
    await broadcastData(String(room_id), payload, "script-role");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
    return json({ error: "Broadcast failed" }, 502);
  }
  return json({ ok: true }, 200);
});
