// verify-invite-code: 초대코드 read-only 검증(LOB-05). 사용횟수 증가·참가자 생성 없음 —
// 소비는 accept-invite 의 consume_room_invite RPC 만. SSOT: contracts/LobbyPage.md §초대링크
// 브루트포스 방어(SEC-P0-04): user당 5회/5분, fail-open — 128-bit 코드 자체가 2차 방어(pwjoin 과 동일 정책).
import { cors, json, getAppUser } from "../_shared/supa.ts";
import { isInviteCode, inviteCodeHash } from "../_shared/inviteCode.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { invite_code?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isInviteCode(body.invite_code)) return json({ error: "invalid" }, 404);

  const { data: allowed } = await service
    .rpc("check_rate_limit", { p_key: `invite:${userId}`, p_max: 5, p_window_sec: 300 });
  if (allowed === false) {
    return json({ error: "시도가 너무 많아요. 잠시 후 다시 시도해주세요." }, 429);
  }

  const hash = await inviteCodeHash(body.invite_code);
  const { data: inv } = await service
    .from("room_invites")
    .select("room_id, role, max_uses, used_count, expires_at, revoked_at, invited_user_id, rooms(title, status, host_id)")
    .eq("invite_code_hash", hash)
    .maybeSingle();
  if (!inv) return json({ error: "invalid" }, 404);
  if (inv.revoked_at) return json({ error: "revoked" }, 410);
  if (new Date(inv.expires_at as string) <= new Date()) return json({ error: "expired" }, 410);
  if (inv.used_count >= inv.max_uses) return json({ error: "used_up" }, 410);
  if (inv.invited_user_id && inv.invited_user_id !== userId) return json({ error: "invalid" }, 404);

  // FK 단수 조인 — supabase-js 타입상 배열일 수 있어 정규화.
  const room = (Array.isArray(inv.rooms) ? inv.rooms[0] : inv.rooms) as
    | { title: string; status: string; host_id: string }
    | undefined;
  if (!room || room.status === "ended") return json({ error: "room_ended" }, 410);

  const { data: host } = await service
    .from("users").select("display_name").eq("id", room.host_id).maybeSingle();

  return json({
    room_id: inv.room_id,
    title: room.title,
    host_display_name: host?.display_name ?? null,
    role: inv.role,
  }, 200);
});
