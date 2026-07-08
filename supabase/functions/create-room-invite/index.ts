// create-room-invite: 호스트가 초대링크 발급(LOB-05). SSOT: contracts/LobbyPage.md §초대링크 · DATA-SCHEMA §1.2.2
// 원문 코드(128-bit hex)는 이 응답에서 1회만 노출 — DB엔 SHA-256 해시만. URL 조립은 클라(origin은 클라가 안다).
// role: 'actor'(기본) | 'viewer'(관전 초대, Phase 4 — 잠금방도 관전 가능해지는 유일한 문).
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { inviteCodeHash } from "../_shared/inviteCode.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown; max_uses?: unknown; expires_h?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const role = body.role === "viewer" ? "viewer" : "actor";
  const maxUses = typeof body.max_uses === "number" && Number.isInteger(body.max_uses) &&
      body.max_uses >= 1 && body.max_uses <= 20
    ? body.max_uses
    : 5;
  const expiresH = typeof body.expires_h === "number" && Number.isFinite(body.expires_h) &&
      body.expires_h >= 1 && body.expires_h <= 168
    ? body.expires_h
    : 72;

  const { data: room } = await service
    .from("rooms").select("id, host_id, status").eq("id", body.room_id).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);
  if (room.host_id !== userId) return json({ error: "Not host" }, 403);

  const bytes = new Uint8Array(16); // 128-bit(SEC-INVITE-ENTROPY)
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + expiresH * 3_600_000).toISOString();

  const { error } = await service.from("room_invites").insert({
    room_id: room.id,
    invite_code_hash: await inviteCodeHash(code),
    role,
    role_source: "host_selected",
    max_uses: maxUses,
    expires_at: expiresAt,
    created_by: userId,
  });
  if (error) return json({ error: "Insert failed" }, 500);

  return json({ invite_code: code, room_id: room.id, role, max_uses: maxUses, expires_at: expiresAt }, 201);
});
