// send-friend-request: 친구 요청(PROFILE-04, contracts/FriendSystem.md).
// 보안(성역): 쓰기는 service 전용(RLS 무정책) — 자기자신/대상 부재/중복을 서버 검증 + rate-limit + 상대 알림.
// 멱등: 이미 pending(내 발신)/accepted 면 200 으로 현재 상태 반환. 상대가 먼저 보낸 pending 은 409(수신함 안내).
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
  if (target === userId) return json({ error: "Cannot friend self" }, 400);

  // rate-limit(SEC-4 프리미티브 재사용): 요청·알림 스팸 차단.
  const { data: allowed } = await service
    .rpc("check_rate_limit", { p_key: `friend-req:${userId}`, p_max: 30, p_window_sec: 86_400 });
  if (allowed === false) return json({ error: "친구 요청을 너무 많이 보냈어요. 내일 다시 시도해주세요." }, 429);

  const { data: targetUser } = await service
    .from("users").select("id").eq("id", target).is("deleted_at", null).maybeSingle();
  if (!targetUser) return json({ error: "Target not found" }, 404);

  // 기존 관계(양방향·friend 타입, soft-deleted 포함 — unique 제약 재사용 위해).
  const { data: rows } = await service
    .from("friendships")
    .select("id, user_id, friend_id, status, deleted_at")
    .eq("relationship_type", "friend")
    .or(`and(user_id.eq.${userId},friend_id.eq.${target}),and(user_id.eq.${target},friend_id.eq.${userId})`);
  const live = (rows ?? []).filter((r) => !r.deleted_at);
  if (live.some((r) => r.status === "accepted")) return json({ ok: true, status: "accepted" }, 200);
  const incoming = live.find((r) => r.user_id === target && r.status === "pending");
  if (incoming) {
    return json({ error: "Incoming request exists", code: "incoming_exists", friendship_id: incoming.id }, 409);
  }
  const mine = (rows ?? []).find((r) => r.user_id === userId);
  if (mine && !mine.deleted_at && mine.status === "pending") {
    return json({ ok: true, status: "pending", friendship_id: mine.id }, 200);
  }

  let friendshipId: string;
  if (mine) {
    // rejected/soft-deleted 재요청 → pending 으로 되살림(unique 행 재사용).
    const { error: upErr } = await service
      .from("friendships")
      .update({ status: "pending", deleted_at: null, updated_at: new Date().toISOString() })
      .eq("id", mine.id);
    if (upErr) return json({ error: "Request failed" }, 500);
    friendshipId = mine.id;
  } else {
    const { data: ins, error: insErr } = await service
      .from("friendships")
      .insert({ user_id: userId, friend_id: target, relationship_type: "friend", status: "pending" })
      .select("id").single();
    if (insErr || !ins) return json({ error: "Request failed" }, 500);
    friendshipId = ins.id;
  }

  // 상대 알림(예약 패턴 동형). 실패해도 요청은 성립(수신함에 남음).
  const { data: me } = await service.from("users").select("display_name").eq("id", userId).maybeSingle();
  await service.from("notifications").insert({
    user_id: target,
    type: "friend_request",
    payload: { friendship_id: friendshipId, requester_id: userId, requester_name: me?.display_name ?? null },
  });

  return json({ ok: true, status: "pending", friendship_id: friendshipId }, 201);
});
