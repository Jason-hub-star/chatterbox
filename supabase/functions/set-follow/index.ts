// set-follow: 팔로우/언팔로우 토글(PROFILE-04, contracts/FriendSystem.md).
// 계약: relationship_type='follow' 는 즉시 accepted(비상호). 쓰기는 service 전용(RLS 무정책).
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { target_user_id?: unknown; follow?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.target_user_id)) return json({ error: "Invalid target_user_id" }, 400);
  if (typeof body.follow !== "boolean") return json({ error: "Invalid follow" }, 400);
  const target = body.target_user_id;
  if (target === userId) return json({ error: "Cannot follow self" }, 400);

  if (body.follow) {
    const { data: allowed } = await service
      .rpc("check_rate_limit", { p_key: `follow:${userId}`, p_max: 50, p_window_sec: 86_400 });
    if (allowed === false) return json({ error: "팔로우를 너무 많이 했어요. 내일 다시 시도해주세요." }, 429);

    const { data: targetUser } = await service
      .from("users").select("id").eq("id", target).is("deleted_at", null).maybeSingle();
    if (!targetUser) return json({ error: "Target not found" }, 404);

    const { error: upErr } = await service.from("friendships").upsert(
      {
        user_id: userId,
        friend_id: target,
        relationship_type: "follow",
        status: "accepted",
        deleted_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,friend_id,relationship_type" },
    );
    if (upErr) return json({ error: "Follow failed" }, 500);
    return json({ ok: true, following: true }, 200);
  }

  const { error: delErr } = await service
    .from("friendships")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("relationship_type", "follow")
    .eq("user_id", userId)
    .eq("friend_id", target)
    .is("deleted_at", null);
  if (delErr) return json({ error: "Unfollow failed" }, 500);
  return json({ ok: true, following: false }, 200);
});
