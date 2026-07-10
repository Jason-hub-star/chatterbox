// list-friends: 내 친구/요청 목록 + 표시명(PROFILE-04).
// users RLS 가 본인 행만 SELECT 라 타인 display_name 은 service 만 읽을 수 있음(list-recent-people 동형) —
// 그래서 목록 조회도 Edge. 미러 행(양방향)은 상대 id 기준으로 dedupe.
import { cors, json, getAppUser } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  const { data: rows } = await service
    .from("friendships")
    .select("id, user_id, friend_id, relationship_type, status")
    .is("deleted_at", null)
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  const friendIds = new Set<string>();
  const followingIds = new Set<string>(); // 내가 팔로우(PROFILE-05 공연시작 알림 대상 관계)
  const pendingIn: { friendship_id: string; user_id: string }[] = [];
  const pendingOut: string[] = [];
  for (const r of rows ?? []) {
    const other = r.user_id === userId ? r.friend_id : r.user_id;
    if (r.relationship_type === "follow") {
      if (r.user_id === userId && r.status === "accepted") followingIds.add(other);
      continue;
    }
    if (r.status === "accepted") friendIds.add(other);
    else if (r.status === "pending" && r.friend_id === userId) pendingIn.push({ friendship_id: r.id, user_id: other });
    else if (r.status === "pending" && r.user_id === userId) pendingOut.push(other);
  }

  const allIds = [...new Set([...friendIds, ...followingIds, ...pendingIn.map((p) => p.user_id), ...pendingOut])];
  const names = new Map<string, string | null>();
  const lastActive = new Map<string, string | null>();
  if (allIds.length) {
    const { data: users } = await service
      .from("users").select("id, display_name, last_active_at").in("id", allIds).is("deleted_at", null);
    for (const u of users ?? []) {
      names.set(u.id, u.display_name ?? null);
      lastActive.set(u.id, u.last_active_at ?? null);
    }
  }

  // presence(DP-1): 친구관계 검증된 목록에 대해서만 서버가 online/activity 판정 → 전역 노출 0.
  // online = last_active_at 최근 60s(heartbeat 30s 의 2배 여유). activity = 활성 room_participants 있으면 'room'.
  const ONLINE_WINDOW_MS = 60_000;
  const nowMs = Date.now();
  const inRoom = new Set<string>();
  if (friendIds.size) {
    const { data: parts } = await service
      .from("room_participants").select("user_id").in("user_id", [...friendIds]).neq("state", "left");
    for (const p of parts ?? []) inRoom.add(p.user_id);
  }
  const onlineOf = (id: string): boolean => {
    const la = lastActive.get(id);
    return !!la && nowMs - Date.parse(la) < ONLINE_WINDOW_MS;
  };
  const entry = (id: string) => ({ user_id: id, display_name: names.get(id) ?? null });
  const friendEntry = (id: string) => ({
    ...entry(id),
    online: onlineOf(id),
    activity: inRoom.has(id) ? "room" : "lobby",
  });

  return json({
    friends: [...friendIds].filter((id) => names.has(id)).map(friendEntry),
    following: [...followingIds].filter((id) => names.has(id)).map(entry),
    pending_in: pendingIn.filter((p) => names.has(p.user_id)).map((p) => ({ friendship_id: p.friendship_id, ...entry(p.user_id) })),
    pending_out: pendingOut.filter((id) => names.has(id)).map(entry),
  }, 200);
});
