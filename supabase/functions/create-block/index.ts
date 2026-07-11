// supabase/functions/create-block/index.ts
// V-2 차단(reporting-logging-feedback.md §16.2) — 개인 경험 필터(입장 차단·신고 자동생성 아님).
// 대상은 blocked_user_id(users.id) 또는 blocked_auth_id(auth uid — 채팅 발신자 키) 중 하나. 멱등 upsert.
import { getAppUser, json, isUuid, cors } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  let body: { blocked_user_id?: unknown; blocked_auth_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  type TargetUser = { id: string; auth_id: string };
  let target: TargetUser | null = null;
  if (body.blocked_user_id !== undefined) {
    if (!isUuid(body.blocked_user_id)) return json({ error: "Invalid blocked_user_id" }, 400);
    const { data } = await user.service
      .from("users").select("id, auth_id").eq("id", body.blocked_user_id).is("deleted_at", null).maybeSingle();
    target = data as TargetUser | null;
  } else if (typeof body.blocked_auth_id === "string" && body.blocked_auth_id.length > 0) {
    const { data } = await user.service
      .from("users").select("id, auth_id").eq("auth_id", body.blocked_auth_id).is("deleted_at", null).maybeSingle();
    target = data as TargetUser | null;
  } else {
    return json({ error: "No target" }, 400);
  }
  if (!target) return json({ error: "User not found" }, 404);
  if (target.id === user.userId) return json({ error: "Cannot block yourself" }, 400);

  const { data: rlOk } = await user.service.rpc("check_rate_limit", { p_key: `block:${user.userId}`, p_max: 30, p_window_sec: 86400 });
  if (rlOk === false) return json({ error: "Too many blocks" }, 429);

  const { error } = await user.service.from("user_blocks").upsert(
    { blocker_user_id: user.userId, blocked_user_id: target.id, blocked_auth_id: target.auth_id },
    { onConflict: "blocker_user_id,blocked_user_id", ignoreDuplicates: true },
  );
  if (error) return json({ error: "Block failed" }, 500);
  return json({ ok: true, blocked_user_id: target.id, blocked_auth_id: target.auth_id }, 200);
});
