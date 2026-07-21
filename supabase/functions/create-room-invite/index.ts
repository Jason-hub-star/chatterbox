// create-room-invite: 호스트가 초대링크 발급(LOB-05). SSOT: contracts/LobbyPage.md §초대링크 · DATA-SCHEMA §1.2.2
// 원문 코드(128-bit hex)는 이 응답에서 1회만 노출 — DB엔 SHA-256 해시만. URL 조립은 클라(origin은 클라가 안다).
// role: 'actor'(기본) | 'viewer'(관전 초대, Phase 4 — 잠금방도 관전 가능해지는 유일한 문).
import { cors, json, getAppUser, isUuid, requireHostRoom, type HostRoom } from "../_shared/supa.ts";
import { inviteCodeHash } from "../_shared/inviteCode.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown; max_uses?: unknown; expires_h?: unknown; role?: unknown; invited_user_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const role = body.role === "viewer" ? "viewer" : "actor";
  // 지명 초대(LOB-08 재초대): 코드가 그 사용자에게만 유효(consume 의 not_invited 게이트).
  const invitedUserId = isUuid(body.invited_user_id) ? body.invited_user_id : null;
  if (invitedUserId === userId) return json({ error: "Cannot invite yourself" }, 400);
  const maxUses = typeof body.max_uses === "number" && Number.isInteger(body.max_uses) &&
      body.max_uses >= 1 && body.max_uses <= 20
    ? body.max_uses
    : 5;
  const expiresH = typeof body.expires_h === "number" && Number.isFinite(body.expires_h) &&
      body.expires_h >= 1 && body.expires_h <= 168
    ? body.expires_h
    : 72;

  const gate = await requireHostRoom(service, body.room_id, userId, "title");
  if (!gate.ok) return gate.res;
  const room = gate.room as HostRoom & { title: string | null };

  // 레이트리밋(SEC-INVITE-FLOOD): 호스트당 20회/시간 — 지명초대 알림(notifications INSERT) 폭탄 +
  // room_invites 행 스팸 차단. send-friend-request·create-room 과 동일 프리미티브(check_rate_limit).
  const { data: rlOk } = await service.rpc("check_rate_limit", { p_key: `invite:${userId}`, p_max: 20, p_window_sec: 3600 });
  if (rlOk === false) return json({ error: "초대를 너무 많이 보냈어요. 잠시 후 다시 시도해주세요." }, 429);

  if (invitedUserId) {
    const { data: target } = await service
      .from("users").select("id").eq("id", invitedUserId).is("deleted_at", null).maybeSingle();
    if (!target) return json({ error: "Invitee not found" }, 404);
  }

  const bytes = new Uint8Array(16); // 128-bit(SEC-INVITE-ENTROPY)
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + expiresH * 3_600_000).toISOString();

  const { error } = await service.from("room_invites").insert({
    room_id: room.id,
    invited_user_id: invitedUserId,
    invite_code_hash: await inviteCodeHash(code),
    role,
    role_source: "host_selected",
    max_uses: invitedUserId ? 1 : maxUses, // 지명 초대는 1회용
    expires_at: expiresAt,
    created_by: userId,
  });
  if (error) return json({ error: "Insert failed" }, 500);

  // 지명 초대는 인앱 알림으로 전달(LOB-08). payload 의 원문 코드는 invited_user_id 에 고정된
  // 초대라 bearer 자격이 아니다(타인이 코드를 알아도 consume 이 not_invited 로 거부) — 저장 허용.
  if (invitedUserId) {
    const { data: host } = await service
      .from("users").select("display_name").eq("id", userId).maybeSingle();
    await service.from("notifications").insert({
      user_id: invitedUserId,
      type: "re_invite",
      room_id: room.id,
      payload: { invite_code: code, room_title: room.title, host_name: host?.display_name ?? null },
    });
  }

  return json({ invite_code: code, room_id: room.id, role, max_uses: invitedUserId ? 1 : maxUses, expires_at: expiresAt }, 201);
});
