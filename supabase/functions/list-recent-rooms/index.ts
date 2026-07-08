// list-recent-rooms: 내 최근 방 + 함께한 사람(LOB-08 로비 섹션). service_role 조회 —
// 타인 display_name 은 클라 RLS 로 못 읽는다. user_room_history 테이블(§1.23) 대신
// room_participants 파생(YAGNI — 이력 원장은 참가 행이 이미 갖고 있다, DATA-SCHEMA 편차 기록).
import { cors, json, getAppUser } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  const { data: mine } = await service
    .from("room_participants")
    .select("room_id, joined_at")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false })
    .limit(15);
  if (!mine?.length) return json({ rooms: [] }, 200);

  // 방당 최신 참가 1건으로 중복 제거 → 상위 5개
  const seen = new Set<string>();
  const recent: { room_id: string; joined_at: string }[] = [];
  for (const m of mine) {
    if (seen.has(m.room_id)) continue;
    seen.add(m.room_id);
    recent.push(m);
    if (recent.length >= 5) break;
  }

  const ids = recent.map((r) => r.room_id);
  const { data: rooms } = await service
    .from("rooms").select("id, title, status, ended_at").in("id", ids);
  const { data: fellows } = await service
    .from("room_participants")
    .select("room_id, user_id, users(display_name)")
    .in("room_id", ids)
    .neq("user_id", userId);

  const byRoom = new Map<string, { user_id: string; display_name: string | null }[]>();
  for (const f of fellows ?? []) {
    const u = (Array.isArray(f.users) ? f.users[0] : f.users) as { display_name: string | null } | undefined;
    const list = byRoom.get(f.room_id) ?? [];
    if (!list.some((x) => x.user_id === f.user_id) && list.length < 5) {
      list.push({ user_id: f.user_id, display_name: u?.display_name ?? null });
    }
    byRoom.set(f.room_id, list);
  }

  const out = recent
    .map((r) => {
      const room = rooms?.find((x) => x.id === r.room_id);
      if (!room) return null;
      return {
        room_id: room.id,
        title: room.title,
        status: room.status,
        last_joined_at: r.joined_at,
        fellows: byRoom.get(room.id) ?? [],
      };
    })
    .filter(Boolean);

  return json({ rooms: out }, 200);
});
