// list-recent-people: 최근 함께한 사람(LOB-08 재초대 소스). 호스트가 룸 안에서 지명 초대할 때
// 후보 목록 — 현재 방의 활성 참가자는 제외. service_role 조회(타인 display_name).
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { exclude_room_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const excludeRoomId = isUuid(body.exclude_room_id) ? body.exclude_room_id : null;

  // 내 최근 참가 방 → 그 방들의 동료(최신순 중복 제거)
  const { data: mine } = await service
    .from("room_participants")
    .select("room_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false })
    .limit(20);
  const roomIds = [...new Set((mine ?? []).map((m) => m.room_id))];
  if (!roomIds.length) return json({ people: [] }, 200);

  const { data: fellows } = await service
    .from("room_participants")
    .select("room_id, user_id, joined_at, users(display_name, deleted_at)")
    .in("room_id", roomIds)
    .neq("user_id", userId)
    .order("joined_at", { ascending: false })
    .limit(100);

  // excludeRoomId 는 내가 참가한 방일 때만 신뢰(SEC-RES-2): 임의 방 참가자 추론(멤버십 미검증) 차단.
  // 정상 사용 = "지금 있는 방 제외"라 그 방은 내 최근 참가 이력(roomIds)에 포함 → 무손상.
  let excluded = new Set<string>();
  if (excludeRoomId && roomIds.includes(excludeRoomId)) {
    const { data: cur } = await service
      .from("room_participants")
      .select("user_id")
      .eq("room_id", excludeRoomId)
      .neq("state", "left");
    excluded = new Set((cur ?? []).map((c) => c.user_id));
  }

  const seen = new Set<string>();
  const people: { user_id: string; display_name: string | null }[] = [];
  for (const f of fellows ?? []) {
    if (seen.has(f.user_id) || excluded.has(f.user_id)) continue;
    const u = (Array.isArray(f.users) ? f.users[0] : f.users) as
      | { display_name: string | null; deleted_at: string | null }
      | undefined;
    if (u?.deleted_at) continue;
    seen.add(f.user_id);
    people.push({ user_id: f.user_id, display_name: u?.display_name ?? null });
    if (people.length >= 8) break;
  }

  return json({ people }, 200);
});
