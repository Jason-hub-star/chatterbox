// supabase/functions/delete-block/index.ts
// V-2 차단 해제 — 본인 행만 삭제(멱등: 없는 행 삭제도 ok). 대상 키는 create-block 과 동형.
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

  let q = user.service.from("user_blocks").delete().eq("blocker_user_id", user.userId);
  if (body.blocked_user_id !== undefined) {
    if (!isUuid(body.blocked_user_id)) return json({ error: "Invalid blocked_user_id" }, 400);
    q = q.eq("blocked_user_id", body.blocked_user_id);
  } else if (typeof body.blocked_auth_id === "string" && body.blocked_auth_id.length > 0) {
    q = q.eq("blocked_auth_id", body.blocked_auth_id);
  } else {
    return json({ error: "No target" }, 400);
  }
  const { error } = await q;
  if (error) return json({ error: "Unblock failed" }, 500);
  return json({ ok: true }, 200);
});
