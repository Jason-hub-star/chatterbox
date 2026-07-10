// remove-friend: 친구 삭제(PROFILE-04) — 양방향 soft delete(계약: 30일 유예 후 영구삭제는 후속 pg_cron).
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { target_user_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.target_user_id)) return json({ error: "Invalid target_user_id" }, 400);
  const target = body.target_user_id;

  const { error: upErr } = await service
    .from("friendships")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("relationship_type", "friend")
    .is("deleted_at", null)
    .or(`and(user_id.eq.${userId},friend_id.eq.${target}),and(user_id.eq.${target},friend_id.eq.${userId})`);
  if (upErr) return json({ error: "Remove failed" }, 500);

  return json({ ok: true }, 200);
});
