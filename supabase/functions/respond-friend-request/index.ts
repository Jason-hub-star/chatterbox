// respond-friend-request: 친구 요청 수락/거절(PROFILE-04).
// 보안(성역): 수신자 본인만 응답. 수락 시 미러 행(수신자→요청자, accepted)을 service 가 생성 —
// 계약의 "양방향 별도 행"은 클라 INSERT 로 불가(RLS 무정책)라 여기서 강제.
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { friendship_id?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.friendship_id)) return json({ error: "Invalid friendship_id" }, 400);
  if (body.action !== "accept" && body.action !== "reject") return json({ error: "Invalid action" }, 400);

  const { data: row } = await service
    .from("friendships")
    .select("id, user_id, friend_id, status")
    .eq("id", body.friendship_id)
    .eq("relationship_type", "friend")
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return json({ error: "Request not found" }, 404);
  if (row.friend_id !== userId) return json({ error: "Not recipient" }, 403);
  if (row.status !== "pending") return json({ error: "Not pending", status: row.status }, 409);

  const nextStatus = body.action === "accept" ? "accepted" : "rejected";
  const { error: upErr } = await service
    .from("friendships")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (upErr) return json({ error: "Update failed" }, 500);

  if (body.action === "accept") {
    // 미러 행(양방향 기록) — 과거 rejected/deleted 행이 있으면 되살림(unique upsert).
    const { error: mirrorErr } = await service.from("friendships").upsert(
      {
        user_id: userId,
        friend_id: row.user_id,
        relationship_type: "friend",
        status: "accepted",
        deleted_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,friend_id,relationship_type" },
    );
    if (mirrorErr) return json({ error: "Mirror failed" }, 500);

    const { data: me } = await service.from("users").select("display_name").eq("id", userId).maybeSingle();
    await service.from("notifications").insert({
      user_id: row.user_id,
      type: "friend_accepted",
      payload: { user_id: userId, name: me?.display_name ?? null },
    });
  }

  return json({ ok: true, status: nextStatus }, 200);
});
